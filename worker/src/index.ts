/**
 * nav —— 导航页的云端服务（Cloudflare Worker + D1，路由用 Hono）
 *
 * 1. 用户体系（#9）：GitHub OAuth 登录；新账号待管理员审批；
 *    会话令牌走 Authorization: Bearer（前端在 GitHub Pages，跨站 Cookie 不可靠），
 *    D1 只存令牌的 SHA-256。
 * 2. 数据：每个用户一行整页快照（user_docs），乐观并发 + 409 冲突，拒绝静默覆盖。
 *    服务端只认会话解析出来的 user_id，从不信任客户端自报身份。
 * 3. 旧单用户数据（nav_docs.default）由管理员一次性认领，认领前原样备份。
 *    旧的 SYNC_TOKEN 默认降级为只读，供老客户端在迁移期拉取数据。
 * 4. /api/icon、/api/title 为公开抓取接口（逻辑见 fetchers.ts）。
 */

import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { randomToken, safeEqual, sha256Hex } from './crypto'
import { iconResponse, titleResponse } from './fetchers'
import { workbenchRoutes, migrateLegacy } from './workbench'
import {
  LOGIN_CODE_TTL_MS,
  OAUTH_STATE_TTL_MS,
  SESSION_TTL_MS,
  accountOnLogin,
  canSync,
  checkUserUpdate,
  finiteNumber,
  isActiveAdmin,
  isExpired,
  normalizeReturnTo,
  parseList,
  planWrite,
  renewedExpiry,
  withFragment,
  type Role,
  type Status,
} from './policy'

export type Env = {
  DB: D1Database
  /** 前端站点的 origin 列表（逗号分隔），用于 CORS 与登录回跳校验 */
  ALLOWED_ORIGIN?: string
  /** 名单内的 GitHub 登录名自动成为管理员 */
  ADMIN_GITHUB_LOGINS?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  /** 旧单用户 token：迁移期只读；LEGACY_SYNC=off 时完全停用 */
  SYNC_TOKEN?: string
  LEGACY_SYNC?: string
}

type UserRow = {
  id: string
  github_id: number
  login: string
  name: string | null
  avatar_url: string | null
  role: Role
  status: Status
  created_at: number
  last_login_at: number
}

type Principal = { kind: 'user'; user: UserRow } | { kind: 'legacy' }

type App = { Bindings: Env; Variables: { principal: Principal; workbenchUserId: string } }
type Ctx = Context<App>

const LEGACY_DOC_ID = 'default'
const MAX_BODY_BYTES = 4 * 1024 * 1024
const GITHUB_UA = 'nav-worker'

const app = new Hono<App>()

// ---------------------------------------------------------------------------
// CORS：公开抓取接口任意来源可用；账号与数据接口只对白名单前端开放
// ---------------------------------------------------------------------------

function allowedOrigins(env: Env): string[] {
  return parseList(env.ALLOWED_ORIGIN).filter((item) => item !== '*')
}

app.use('/api/icon', cors({ origin: '*' }))
app.use('/api/title', cors({ origin: '*' }))
app.use('/api/fetch-title', cors({ origin: '*' }))
app.use('*', async (c, next) => {
  const p = c.req.path
  if (p === '/api/icon' || p === '/api/title' || p === '/api/fetch-title') return next()
  const list = allowedOrigins(c.env)
  const wildcard = parseList(c.env.ALLOWED_ORIGIN).includes('*')
  return cors({
    origin: (origin) => (wildcard ? origin || '*' : list.includes(origin) ? origin : null),
    allowMethods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86400,
  })(c, next)
})

app.use('/api/*', async (c, next) => {
  await next()
  if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store')
})

const fail = (c: Ctx, status: 400 | 401 | 403 | 404 | 409 | 413 | 500 | 502, error: string, extra = {}) =>
  c.json({ ok: false, error, ...extra }, status)

// ---------------------------------------------------------------------------
// 公开接口
// ---------------------------------------------------------------------------

app.get('/', (c) =>
  c.json({
    ok: true,
    service: 'nav',
    auth: Boolean(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET),
    endpoints: [
      'GET /auth/github/start?return_to=',
      'POST /auth/exchange',
      'POST /auth/logout',
      'GET /api/me',
      'GET|PUT /api/data',
      'GET /api/icon?domain=',
      'GET /api/title?url=',
    ],
  }),
)

app.get('/api/icon', (c) => iconResponse(new URL(c.req.url)))
app.get('/api/title', (c) => titleResponse(new URL(c.req.url)))
app.get('/api/fetch-title', (c) => titleResponse(new URL(c.req.url)))

// ---------------------------------------------------------------------------
// GitHub OAuth
// ---------------------------------------------------------------------------

function callbackUrl(c: Ctx): string {
  return `${new URL(c.req.url).origin}/auth/github/callback`
}

async function purgeExpired(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM login_codes WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
  ])
}

app.get('/auth/github/start', async (c) => {
  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) {
    return c.text('GitHub 登录尚未配置（GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET）', 500)
  }
  const returnTo = normalizeReturnTo(c.req.query('return_to') || '', allowedOrigins(c.env))
  if (!returnTo) return c.text('return_to 不在允许的前端地址列表中', 400)

  const now = Date.now()
  const state = randomToken()
  await purgeExpired(c.env.DB, now)
  await c.env.DB.prepare('INSERT INTO oauth_states (state_hash, return_to, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(state), returnTo, now + OAUTH_STATE_TTL_MS)
    .run()

  const authorize = new URL('https://github.com/login/oauth/authorize')
  authorize.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID)
  authorize.searchParams.set('redirect_uri', callbackUrl(c))
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('allow_signup', 'true')
  return c.redirect(authorize.toString(), 302)
})

type GithubUser = { id: number; login: string; name: string | null; avatar_url: string | null }

async function fetchGithubUser(c: Ctx, code: string): Promise<GithubUser | null> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': GITHUB_UA },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(c),
    }),
  })
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as { access_token?: string }
  if (!tokenRes.ok || !tokenBody.access_token) return null

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenBody.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': GITHUB_UA,
    },
  })
  if (!userRes.ok) return null
  const user = (await userRes.json()) as Partial<GithubUser>
  if (typeof user.id !== 'number' || typeof user.login !== 'string') return null
  return { id: user.id, login: user.login, name: user.name ?? null, avatar_url: user.avatar_url ?? null }
}

async function upsertUser(env: Env, gh: GithubUser, now: number): Promise<UserRow> {
  const existing = await env.DB.prepare('SELECT * FROM users WHERE github_id = ?').bind(gh.id).first<UserRow>()
  const account = accountOnLogin(gh.login, parseList(env.ADMIN_GITHUB_LOGINS), existing)
  if (existing) {
    await env.DB.prepare(
      'UPDATE users SET login = ?, name = ?, avatar_url = ?, role = ?, status = ?, last_login_at = ? WHERE id = ?',
    )
      .bind(gh.login, gh.name, gh.avatar_url, account.role, account.status, now, existing.id)
      .run()
    return { ...existing, login: gh.login, name: gh.name, avatar_url: gh.avatar_url, ...account, last_login_at: now }
  }
  const user: UserRow = {
    id: crypto.randomUUID(),
    github_id: gh.id,
    login: gh.login,
    name: gh.name,
    avatar_url: gh.avatar_url,
    role: account.role,
    status: account.status,
    created_at: now,
    last_login_at: now,
  }
  await env.DB.prepare(
    `INSERT INTO users (id, github_id, login, name, avatar_url, role, status, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(user.id, user.github_id, user.login, user.name, user.avatar_url, user.role, user.status, now, now)
    .run()
  return user
}

app.get('/auth/github/callback', async (c) => {
  const state = c.req.query('state') || ''
  const code = c.req.query('code') || ''
  if (!state) return c.text('缺少 state', 400)

  // state 单次使用：取出即删除
  const row = await c.env.DB.prepare('DELETE FROM oauth_states WHERE state_hash = ? RETURNING return_to, expires_at')
    .bind(await sha256Hex(state))
    .first<{ return_to: string; expires_at: number }>()
  const now = Date.now()
  if (!row || isExpired(row.expires_at, now)) return c.text('登录请求已过期，请回到导航页重新登录', 400)

  const back = (params: Record<string, string>) => c.redirect(withFragment(row.return_to, params), 302)
  if (!code) return back({ login_error: c.req.query('error') || 'denied' })

  const gh = await fetchGithubUser(c, code).catch(() => null)
  if (!gh) return back({ login_error: 'github_failed' })

  const user = await upsertUser(c.env, gh, now)
  if (user.status === 'disabled') return back({ login_error: 'account_disabled' })
  const loginCode = randomToken()
  await c.env.DB.prepare('INSERT INTO login_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256Hex(loginCode), user.id, now + LOGIN_CODE_TTL_MS)
    .run()
  // 放在 fragment：不进服务端日志，也不会随 Referer 泄露
  return back({ login_code: loginCode })
})

function publicUser(user: UserRow) {
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  }
}

app.post('/auth/exchange', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { code?: unknown }
  if (typeof body.code !== 'string' || !body.code) return fail(c, 400, 'missing_code')

  const now = Date.now()
  const row = await c.env.DB.prepare('DELETE FROM login_codes WHERE code_hash = ? RETURNING user_id, expires_at')
    .bind(await sha256Hex(body.code))
    .first<{ user_id: string; expires_at: number }>()
  if (!row || isExpired(row.expires_at, now)) return fail(c, 401, 'invalid_code')

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first<UserRow>()
  if (!user) return fail(c, 401, 'invalid_code')
  if (user.status === 'disabled') return fail(c, 403, 'account_disabled')

  const token = randomToken()
  const expiresAt = now + SESSION_TTL_MS
  await c.env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await sha256Hex(token), user.id, now, expiresAt, (c.req.header('User-Agent') || '').slice(0, 300))
    .run()
  return c.json({ ok: true, token, expiresAt, user: publicUser(user) })
})

// ---------------------------------------------------------------------------
// 鉴权中间件
// ---------------------------------------------------------------------------

function bearer(c: Ctx): string {
  const match = /^Bearer\s+(.+)$/i.exec((c.req.header('Authorization') || '').trim())
  return match ? match[1].trim() : ''
}

function legacyEnabled(env: Env): boolean {
  return Boolean((env.SYNC_TOKEN || '').trim()) && (env.LEGACY_SYNC || '').toLowerCase() !== 'off'
}

/** 解析会话；legacy=true 时额外接受旧 SYNC_TOKEN（只读） */
function authenticate(options: { legacy?: boolean } = {}): MiddlewareHandler<App> {
  return async (c, next) => {
    const token = bearer(c)
    if (!token) return fail(c, 401, 'unauthorized')

    if (options.legacy && legacyEnabled(c.env) && safeEqual(token, (c.env.SYNC_TOKEN || '').trim())) {
      c.set('principal', { kind: 'legacy' })
      return next()
    }

    const now = Date.now()
    const hash = await sha256Hex(token)
    const row = await c.env.DB.prepare(
      `SELECT s.expires_at AS session_expires_at, u.*
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
      .bind(hash)
      .first<UserRow & { session_expires_at: number }>()
    if (!row || isExpired(row.session_expires_at, now)) {
      if (row) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run()
      return fail(c, 401, 'unauthorized')
    }
    const renewed = renewedExpiry(row.session_expires_at, now)
    if (renewed) {
      await c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(renewed, hash).run()
    }
    const { session_expires_at: _ignored, ...user } = row
    c.set('principal', { kind: 'user', user })
    return next()
  }
}

const requireActive: MiddlewareHandler<App> = async (c, next) => {
  const p = c.get('principal')
  if (p.kind === 'user' && !canSync(p.user)) {
    return fail(c, 403, p.user.status === 'pending' ? 'pending_approval' : 'account_disabled')
  }
  return next()
}

const requireAdmin: MiddlewareHandler<App> = async (c, next) => {
  const p = c.get('principal')
  if (p.kind !== 'user' || !isActiveAdmin(p.user)) return fail(c, 403, 'forbidden')
  return next()
}

function currentUser(c: Ctx): UserRow {
  const p = c.get('principal')
  if (p.kind !== 'user') throw new Error('expected user principal')
  return p.user
}

// ---------------------------------------------------------------------------
// 会话与当前用户
// ---------------------------------------------------------------------------

app.post('/auth/logout', async (c) => {
  const token = bearer(c)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run()
  return c.json({ ok: true })
})

async function legacyState(env: Env) {
  const [doc, claim] = await Promise.all([
    env.DB.prepare('SELECT updated_at FROM nav_docs WHERE id = ?').bind(LEGACY_DOC_ID).first<{ updated_at: number }>(),
    env.DB.prepare('SELECT user_id, claimed_at FROM legacy_claims WHERE id = ?')
      .bind(LEGACY_DOC_ID)
      .first<{ user_id: string; claimed_at: number }>(),
  ])
  return { exists: Boolean(doc), claimed: Boolean(claim), claimedAt: claim?.claimed_at ?? null }
}

app.get('/api/me', authenticate(), async (c) => {
  const user = currentUser(c)
  return c.json({
    ok: true,
    user: publicUser(user),
    legacy: isActiveAdmin(user) ? await legacyState(c.env) : null,
  })
})

// ---------------------------------------------------------------------------
// 快照读写（按用户隔离）
// ---------------------------------------------------------------------------

type DocRow = { doc: string; updated_at: number; rev: number }

function parseDoc(row: DocRow | null): unknown {
  if (!row) return null
  try {
    return JSON.parse(row.doc)
  } catch {
    return null
  }
}

function readDoc(c: Ctx): Promise<DocRow | null> {
  const p = c.get('principal')
  return p.kind === 'legacy'
    ? c.env.DB.prepare('SELECT doc, updated_at, rev FROM nav_docs WHERE id = ?').bind(LEGACY_DOC_ID).first<DocRow>()
    : c.env.DB.prepare('SELECT doc, updated_at, rev FROM user_docs WHERE user_id = ?').bind(p.user.id).first<DocRow>()
}

app.get('/api/data', authenticate({ legacy: true }), requireActive, async (c) => {
  const row = await readDoc(c)
  return c.json({ ok: true, doc: parseDoc(row), updatedAt: row?.updated_at ?? 0, rev: row?.rev ?? 0 })
})

app.put('/api/data', authenticate({ legacy: true }), requireActive, async (c) => {
  if (c.get('principal').kind === 'legacy') {
    return fail(c, 403, 'legacy_read_only', { hint: '旧同步密钥已改为只读，请使用 GitHub 登录' })
  }
  const user = currentUser(c)
  const raw = await c.req.text()
  if (raw.length > MAX_BODY_BYTES) return fail(c, 413, 'payload_too_large')

  let payload: { doc?: unknown; updatedAt?: unknown; expectedUpdatedAt?: unknown; force?: unknown }
  try {
    payload = JSON.parse(raw)
  } catch {
    return fail(c, 400, 'invalid_json')
  }
  if (!payload.doc || typeof payload.doc !== 'object') return fail(c, 400, 'missing_doc')

  const current = await readDoc(c)
  const plan = planWrite({
    currentUpdatedAt: current?.updated_at ?? null,
    expected: finiteNumber(payload.expectedUpdatedAt),
    incoming: finiteNumber(payload.updatedAt),
    force: payload.force === true,
    now: Date.now(),
  })
  if (plan.conflict) {
    return fail(c, 409, 'conflict', { doc: parseDoc(current), updatedAt: current!.updated_at, rev: current!.rev })
  }

  // 新版快照不再接收便签；旧快照原样保留到工作台首次读取的迁移备份中。
  const doc = { ...payload.doc } as Record<string, unknown>
  if ('memos' in doc) return fail(c, 400, 'upgrade_required', { hint: '便签已改为独立接口，请刷新客户端' })
  await migrateLegacy(c.env.DB, user.id)
  const saved = await c.env.DB.prepare(
    `INSERT INTO user_docs (user_id, doc, updated_at, rev, updated_by)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       doc = excluded.doc,
       updated_at = excluded.updated_at,
       rev = user_docs.rev + 1,
       updated_by = excluded.updated_by
     RETURNING updated_at, rev`,
  )
    .bind(user.id, JSON.stringify(doc), plan.nextUpdatedAt, (c.req.header('User-Agent') || '').slice(0, 300))
    .first<{ updated_at: number; rev: number }>()
  return c.json({ ok: true, updatedAt: saved?.updated_at ?? plan.nextUpdatedAt, rev: saved?.rev ?? 1 })
})

for (const path of ['/api/memos*', '/api/clipboard']) {
  app.use(path, authenticate(), requireActive, async (c, next) => {
    c.set('workbenchUserId', currentUser(c).id)
    return next()
  })
}
app.route('/', workbenchRoutes)

// ---------------------------------------------------------------------------
// 管理员
// ---------------------------------------------------------------------------

app.use('/api/admin/*', authenticate(), requireAdmin)

app.get('/api/admin/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM users ORDER BY CASE status WHEN \'pending\' THEN 0 ELSE 1 END, created_at DESC',
  ).all<UserRow>()
  return c.json({ ok: true, users: results.map(publicUser) })
})

app.patch('/api/admin/users/:id', async (c) => {
  const target = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(c.req.param('id')).first<UserRow>()
  if (!target) return fail(c, 404, 'user_not_found')
  const patch = (await c.req.json().catch(() => ({}))) as { role?: unknown; status?: unknown }
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'",
  ).first<{ n: number }>()
  const result = checkUserUpdate(target, patch, count?.n ?? 0)
  if (!result.ok) return fail(c, result.error === 'last_admin' ? 409 : 400, result.error)

  const stmts = [
    c.env.DB.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').bind(
      result.next.role,
      result.next.status,
      target.id,
    ),
  ]
  // 禁用即踢下线
  if (result.next.status === 'disabled') {
    stmts.push(c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id))
  }
  await c.env.DB.batch(stmts)
  return c.json({ ok: true, user: publicUser({ ...target, ...result.next }) })
})

/**
 * 认领旧单用户快照：原样备份到 legacy_claims，再写入当前管理员的 user_docs。
 * 只能成功一次；管理员云端已有数据时必须显式 replace，被替换的数据同样保留在备份里。
 */
app.post('/api/admin/claim-legacy', async (c) => {
  const user = currentUser(c)
  const body = (await c.req.json().catch(() => ({}))) as { replace?: unknown }
  const [legacy, claimed, mine] = await Promise.all([
    c.env.DB.prepare('SELECT doc, updated_at, rev FROM nav_docs WHERE id = ?').bind(LEGACY_DOC_ID).first<DocRow>(),
    c.env.DB.prepare('SELECT user_id FROM legacy_claims WHERE id = ?').bind(LEGACY_DOC_ID).first(),
    c.env.DB.prepare('SELECT doc, updated_at, rev FROM user_docs WHERE user_id = ?').bind(user.id).first<DocRow>(),
  ])
  if (claimed) return fail(c, 409, 'already_claimed')
  if (!legacy) return fail(c, 404, 'no_legacy_data')
  if (mine && body.replace !== true) {
    return fail(c, 409, 'user_doc_exists', { updatedAt: mine.updated_at, rev: mine.rev })
  }

  const now = Date.now()
  const updatedAt = Math.max(legacy.updated_at, (mine?.updated_at ?? 0) + 1)
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO legacy_claims (id, user_id, claimed_at, backup_doc, backup_updated_at, backup_rev, replaced_doc)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(LEGACY_DOC_ID, user.id, now, legacy.doc, legacy.updated_at, legacy.rev, mine?.doc ?? null),
      c.env.DB.prepare(
        `INSERT INTO user_docs (user_id, doc, updated_at, rev, updated_by)
         VALUES (?, ?, ?, 1, 'legacy-claim')
         ON CONFLICT(user_id) DO UPDATE SET
           doc = excluded.doc, updated_at = excluded.updated_at,
           rev = user_docs.rev + 1, updated_by = excluded.updated_by`,
      ).bind(user.id, legacy.doc, updatedAt),
    ])
  } catch {
    // 主键冲突 = 并发的另一次认领已经成功
    return fail(c, 409, 'already_claimed')
  }
  return c.json({ ok: true, updatedAt })
})

app.notFound((c) => fail(c, 404, 'not_found'))
app.onError((error, c) => {
  console.error(error)
  return fail(c, 500, 'internal_error')
})

export default app

/**
 * 账号云同步端到端冒烟测试（无头 Edge + CDP，黄金旅程）
 *
 * 覆盖用户最关心的场景：
 *  1. 老设备首次登录 -> 先询问初始数据（不自动上传）-> 导入本机数据并上传到账号
 *  2. 云端被别的设备推进后，本机不许静默覆盖，必须进入冲突状态
 *  3. 新设备登录同一账号 -> 自动恢复；退出后回到未登录本地库、会话被撤销
 *  4. 待审批账号不能同步，审批后可以；账号之间数据隔离；管理员一次性认领旧版数据
 *
 * GitHub OAuth 无法在本地跑：脚本直接在本地 D1 造一次性登录码，从“回跳带 login_code”开始走真实流程。
 *
 * 用法：npm run smoke:sync
 * 前置：worker 本地实例在 8788（cd worker && npx wrangler dev --port 8788，已执行 db:migrate:local），
 *       vite dev 在 5199（VITE_SYNC_URL=http://127.0.0.1:8788 npx vite --port 5199 --host 127.0.0.1）
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5199'
const WORKER_URL = process.env.WORKER_URL || 'http://127.0.0.1:8788'
const WORKER_DIR = join(import.meta.dirname, '..', 'worker')
const WRANGLER = join(WORKER_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const MESSAGE_TITLE = '端到端测试书签'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function poll(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    try {
      last = await fn()
      if (last) return last
    } catch (error) {
      last = error.message
    }
    await sleep(250)
  }
  throw new Error(`poll timeout: ${label} (last=${JSON.stringify(last)})`)
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)))
      else entry.resolve(msg.result)
    })
  }

  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
}

async function launchBrowser(port) {
  const profile = mkdtempSync(join(tmpdir(), 'nav-smoke-'))
  const proc = spawn(
    EDGE,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--no-proxy-server',
      '--disable-extensions',
      '--disable-background-networking',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const target = await poll(
    async () => {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
    },
    20000,
    'devtools target',
  )

  const ws = new WebSocket(target)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('ws error')), { once: true })
  })

  const cdp = new Cdp(ws)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  return {
    cdp,
    async close() {
      try {
        ws.close()
      } catch {}
      proc.kill()
      await sleep(300)
      try {
        rmSync(profile, { recursive: true, force: true })
      } catch {}
    },
  }
}

function makeEval(cdp) {
  return async function evaluate(expression) {
    const res = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        JSON.stringify(res.exceptionDetails)
      throw new Error(`page exception: ${desc}`)
    }
    return res.result.value
  }
}

const STORE = `await import('/src/store/useNavStore.ts')`

/** 打开页面并等到 store ready（ready===true 同时证明拿到的是 app 自己的那个 store 实例） */
async function openApp(cdp) {
  const evaluate = makeEval(cdp)
  await cdp.send('Page.navigate', { url: APP_URL })
  await poll(
    () =>
      evaluate(
        `(async () => { const m = ${STORE}; return m.useNavStore.getState().ready })()`,
      ),
    25000,
    'app ready',
  )
  return evaluate
}

const ADMIN_API_TOKEN = 'smoke-admin-api-token'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * 把本地 D1 重置成固定起点：一个管理员、一个待审批用户、一个可认领旧数据的管理员、
 * 一份单用户时代的旧快照，以及每次登录用的一次性登录码。
 * GitHub OAuth 本身无法在本地跑，这里直接造登录码，从“回跳带 login_code”开始走真实流程。
 */
function seedDatabase() {
  const now = Date.now()
  const later = now + 10 * 60 * 1000
  const users = [
    ['u-admin', 1, 'smoke-admin', 'admin', 'active'],
    ['u-pending', 2, 'smoke-pending', 'user', 'pending'],
    ['u-heir', 3, 'smoke-heir', 'admin', 'active'],
  ]
  const codes = { codeA: 'u-admin', codeB: 'u-admin', codePending: 'u-pending', codeHeir: 'u-heir' }
  const sql = [
    'DELETE FROM sessions; DELETE FROM login_codes; DELETE FROM oauth_states;',
    'DELETE FROM user_docs; DELETE FROM legacy_claims; DELETE FROM users; DELETE FROM nav_docs;',
    ...users.map(
      ([id, gh, login, role, status]) =>
        `INSERT INTO users VALUES ('${id}', ${gh}, '${login}', NULL, NULL, '${role}', '${status}', ${now}, ${now});`,
    ),
    ...Object.entries(codes).map(([code, user]) => `INSERT INTO login_codes VALUES ('${sha256(code)}', '${user}', ${later});`),
    `INSERT INTO sessions VALUES ('${sha256(ADMIN_API_TOKEN)}', 'u-admin', ${now}, ${later}, 'smoke');`,
    `INSERT INTO nav_docs VALUES ('default', '${JSON.stringify(LEGACY_DOC).replace(/'/g, "''")}', 1000, 3, 'legacy');`,
  ].join('\n')
  const file = join(mkdtempSync(join(tmpdir(), 'nav-seed-')), 'seed.sql')
  writeFileSync(file, sql)
  execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', 'nav-sync', '--local', `--file=${file}`], {
    cwd: WORKER_DIR,
    stdio: 'ignore',
  })
  // 返回 名称 -> 登录码（登录码本身就是名称，库里存的是它的哈希）
  return Object.fromEntries(Object.keys(codes).map((code) => [code, code]))
}

const LEGACY_TITLE = '单用户时代的书签'
const LEGACY_DOC = {
  categories: [{ id: 'cat-legacy', name: '旧数据', order: 0 }],
  subSections: [],
  subCategories: [],
  bookmarks: [{ id: 'bm-legacy', categoryId: 'cat-legacy', title: LEGACY_TITLE, url: 'https://example.com/legacy', order: 0, createdAt: 1, updatedAt: 1 }],
  memos: [],
  totpAccounts: [],
  settings: {},
}

async function api(path, token, init = {}) {
  const res = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const STATE = (fields) =>
  `(async () => { const m = ${STORE}; const s = m.useNavStore.getState(); return ${fields} })()`

/** 模拟 GitHub 回跳：带一次性登录码打开页面，走 main.tsx 的真实换取流程 */
async function loginWith(cdp, code) {
  const evaluate = makeEval(cdp)
  // 真实回跳来自 github.com，是一次完整的页面加载；只改 hash 不会重新加载页面
  await cdp.send('Page.navigate', { url: 'about:blank' })
  await cdp.send('Page.navigate', { url: `${APP_URL}#login_code=${code}` })
  // 先等 main.tsx 写入会话再碰 store：提前 import 会让 db 模块按未登录状态打开本地库
  await poll(() => evaluate(`location.hash === '' && Boolean(localStorage.getItem('nav_session'))`), 25000, 'session saved')
  await poll(() => evaluate(STATE('s.ready && Boolean(s.session)')), 25000, 'logged in')
  return evaluate
}

async function waitSettled(evaluate, label) {
  return poll(
    () =>
      evaluate(
        STATE(
          `s.importOffer ? 'offer' : ['synced', 'error', 'conflict', 'off'].includes(s.syncStatus) ? s.syncStatus : false`,
        ),
      ),
    25000,
    label,
  )
}

async function main() {
  const codes = seedDatabase()
  const health = await fetch(`${WORKER_URL}/`).then((r) => r.json())
  check('测试起点：本地 Worker 可用', health.ok === true)

  // ------------------------------------------------------------ 场景 1：老设备首次登录
  const a = await launchBrowser(9333)
  let sessionToken = ''
  try {
    let evaluate = await openApp(a.cdp)
    const before = await evaluate(STATE(`({ bookmarks: s.bookmarks.length, sync: s.syncStatus, session: Boolean(s.session) })`))
    check('未登录首屏有默认数据、不同步', before.bookmarks > 0 && before.sync === 'off' && !before.session, JSON.stringify(before))

    await evaluate(
      `(async () => { const m = ${STORE}; await m.useNavStore.getState().addBookmark({ title: ${JSON.stringify(MESSAGE_TITLE)}, url: 'https://example.com/e2e' }); return true })()`,
    )

    evaluate = await loginWith(a.cdp, codes.codeA)
    const hashCleared = await evaluate(`location.hash === ''`)
    check('登录码换取会话后地址栏不再保留登录码', hashCleared === true)
    check('一次性登录码不能重复使用', (await api('/auth/exchange', '', { method: 'POST', body: JSON.stringify({ code: codes.codeA }) })).status === 401)

    const offerState = await waitSettled(evaluate, 'import offer')
    const offer = await evaluate(STATE(`({ offer: s.importOffer, db: (await import('/src/lib/db.ts')).db.name, bookmarks: s.bookmarks.length, has: s.bookmarks.some(b => b.title === ${JSON.stringify(MESSAGE_TITLE)}) })`))
    check('空账号先询问初始数据，不自动上传', offerState === 'offer' && offer.offer?.anonymousBookmarks > 0 && offer.offer?.legacyClaimable === true, JSON.stringify(offer.offer))
    check('登录后使用账号独立的本地库，未登录数据不混入', offer.db.endsWith('-u-u-admin') && offer.has === false, offer.db)
    check('选择前云端仍为空', (await api('/api/data', ADMIN_API_TOKEN)).body.doc === null)

    await evaluate(`(async () => { const m = ${STORE}; await m.useNavStore.getState().resolveImport('local'); return true })()`)
    await poll(() => evaluate(STATE(`s.syncStatus === 'synced'`)), 25000, 'pushed after import')
    sessionToken = await evaluate(STATE('s.session.token'))

    const cloud = (await api('/api/data', ADMIN_API_TOKEN)).body
    check('导入本机数据后上传到账号云端', (cloud.doc?.bookmarks ?? []).some((b) => b.title === MESSAGE_TITLE), `云端书签数=${cloud.doc?.bookmarks?.length ?? 0}`)
    const local = await evaluate(STATE('s.localUpdatedAt'))
    check('云端时间戳与本机对齐', cloud.updatedAt === local, `cloud=${cloud.updatedAt} local=${local}`)
    check('导入本机数据不会认领旧版数据', (await api('/api/me', ADMIN_API_TOKEN)).body.legacy?.claimed === false)

    // ---------------------------------------------- 冲突保护：云端被别的设备推进
    const deviceC = {
      ...cloud.doc,
      bookmarks: [...cloud.doc.bookmarks, { id: 'from-device-c', title: '来自设备C的书签', url: 'https://example.com/c', order: 999, createdAt: Date.now(), updatedAt: Date.now() }],
    }
    const forced = await api('/api/data', ADMIN_API_TOKEN, {
      method: 'PUT',
      body: JSON.stringify({ doc: deviceC, updatedAt: Math.max(Date.now(), cloud.updatedAt + 1), force: true }),
    })
    check('模拟设备C推了一份新版本到云端', forced.status === 200, `PUT -> ${forced.status}`)

    const afterConflict = await evaluate(
      `(async () => { const m = ${STORE}; await m.useNavStore.getState().pushToCloud(); const s = m.useNavStore.getState(); return { status: s.syncStatus, message: s.syncMessage } })()`,
    )
    check('云端更新后本机不会静默覆盖（进入冲突状态）', afterConflict.status === 'conflict', JSON.stringify(afterConflict))
    const cloudAfter = (await api('/api/data', ADMIN_API_TOKEN)).body
    check('设备C的数据在云端保持完整', (cloudAfter.doc?.bookmarks ?? []).some((b) => b.title === '来自设备C的书签'))
  } finally {
    await a.close()
  }

  // ------------------------------------- 场景 2：新设备登录同一账号 = 自动恢复
  const b = await launchBrowser(9334)
  try {
    await openApp(b.cdp)
    let evaluate = await loginWith(b.cdp, codes.codeB)
    const settled = await waitSettled(evaluate, 'restore')
    const restored = await evaluate(
      STATE(`({ status: s.syncStatus, offer: s.importOffer, hasTest: s.bookmarks.some(b => b.title === ${JSON.stringify(MESSAGE_TITLE)}), hasC: s.bookmarks.some(b => b.title === '来自设备C的书签') })`),
    )
    check('账号云端已有数据时不询问，直接恢复', settled === 'synced' && restored.offer === null, JSON.stringify(restored))
    check('恢复后包含之前的自定义书签和设备C的书签', restored.hasTest && restored.hasC, JSON.stringify(restored))

    await cdpReload(b.cdp, evaluate)
    const afterReload = await evaluate(STATE(`({ status: s.syncStatus, hasTest: s.bookmarks.some(b => b.title === ${JSON.stringify(MESSAGE_TITLE)}) })`))
    check('刷新后账号数据仍在（并自动完成一次同步）', afterReload.hasTest === true && afterReload.status === 'synced', JSON.stringify(afterReload))

    const tokenB = await evaluate(STATE('s.session.token'))
    await b.cdp.send('Runtime.evaluate', { expression: `(async () => { const m = ${STORE}; await m.useNavStore.getState().logout() })()` })
    evaluate = makeEval(b.cdp)
    await poll(() => evaluate(STATE('s.ready && !s.session')), 25000, 'logged out')
    const anon = await evaluate(STATE(`({ sync: s.syncStatus, hasTest: s.bookmarks.some(b => b.title === ${JSON.stringify(MESSAGE_TITLE)}) })`))
    check('退出后回到未登录的本地库，看不到账号数据', anon.sync === 'off' && anon.hasTest === false, JSON.stringify(anon))
    check('退出后服务端会话已撤销', (await api('/api/me', tokenB)).status === 401)
    check('其他设备的会话不受影响', (await api('/api/me', sessionToken)).status === 200)
  } finally {
    await b.close()
  }

  // ------------------------------------- 场景 3：待审批账号 → 审批；另一个管理员认领旧数据
  const c = await launchBrowser(9335)
  try {
    let evaluate = await loginWith(c.cdp, codes.codePending)
    await waitSettled(evaluate, 'pending settled')
    const pending = await evaluate(STATE(`({ status: s.account.status, sync: Boolean(s.syncConfig), message: s.syncMessage, token: s.session.token })`))
    check('待审批账号可以登录，但不能云同步', pending.status === 'pending' && pending.sync === false, JSON.stringify(pending))
    check('待审批账号直接调用数据接口被拒绝', (await api('/api/data', pending.token)).status === 403)
    check('待审批账号不能访问管理接口', (await api('/api/admin/users', pending.token)).status === 403)
    await evaluate(`(async () => { const m = ${STORE}; await m.useNavStore.getState().resolveImport('skip'); return true })()`)

    const approved = await api('/api/admin/users/u-pending', ADMIN_API_TOKEN, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) })
    check('管理员审批通过', approved.status === 200 && approved.body.user?.status === 'active')
    await evaluate(`(async () => { const m = ${STORE}; await m.useNavStore.getState().refreshAccount(); await m.useNavStore.getState().syncNow(); return true })()`)
    const active = await evaluate(STATE(`({ sync: Boolean(s.syncConfig), status: s.syncStatus })`))
    check('审批后刷新账号即可同步', active.sync && active.status === 'synced', JSON.stringify(active))
    const pendingDoc = (await api('/api/data', pending.token)).body
    check('该账号云端只有自己的数据', pendingDoc.doc && !pendingDoc.doc.bookmarks.some((b) => b.title === MESSAGE_TITLE))

    await c.cdp.send('Runtime.evaluate', { expression: `(async () => { const m = ${STORE}; await m.useNavStore.getState().logout() })()` })
    await poll(() => makeEval(c.cdp)(STATE('s.ready && !s.session')), 25000, 'logged out')
    evaluate = await loginWith(c.cdp, codes.codeHeir)
    await waitSettled(evaluate, 'heir offer')
    const heirOffer = await evaluate(STATE('s.importOffer'))
    check('另一个空的管理员账号可以选择认领旧版数据', heirOffer?.legacyClaimable === true, JSON.stringify(heirOffer))
    await evaluate(`(async () => { const m = ${STORE}; await m.useNavStore.getState().resolveImport('legacy'); return true })()`)
    const heir = await evaluate(STATE(`({ status: s.syncStatus, hasLegacy: s.bookmarks.some(b => b.title === ${JSON.stringify(LEGACY_TITLE)}) })`))
    check('认领后本机拿到旧版数据', heir.status === 'synced' && heir.hasLegacy, JSON.stringify(heir))
    const me = (await api('/api/me', ADMIN_API_TOKEN)).body
    check('旧版数据只能认领一次', me.legacy?.claimed === true)
  } finally {
    await c.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) process.exitCode = 1
}

async function cdpReload(cdp, evaluate) {
  await cdp.send('Page.reload')
  await poll(
    () =>
      evaluate(
        `(async () => { const m = ${STORE}; return m.useNavStore.getState().ready })()`,
      ),
    25000,
    'app ready after reload',
  )
  // 等启动同步跑完
  await poll(
    () =>
      evaluate(
        `(async () => { const m = ${STORE}; const s = m.useNavStore.getState().syncStatus; return s === 'synced' || s === 'error' || s === 'conflict' ? s : false })()`,
      ),
    20000,
    'sync settled',
  )
}

main().catch((error) => {
  console.error('SMOKE ERROR:', error.message)
  process.exitCode = 1
})

import { Hono } from 'hono'

type Bindings = { DB: D1Database }
type Variables = { workbenchUserId: string }
type MemoRow = {
  id: string; text: string; done: number; created_at: number; updated_at: number; deleted_at: number | null
}

function publicMemo(row: MemoRow) {
  return { id: row.id, text: row.text, done: Boolean(row.done), createdAt: row.created_at,
    updatedAt: row.updated_at, deletedAt: row.deleted_at }
}

/** 原快照保留；备份、导入与标记在同一事务内。已有记录（包括墓碑）永不被旧快照覆盖。 */
async function migrateLegacy(db: D1Database, uid: string) {
  if (await db.prepare('SELECT user_id FROM workbench_migrations WHERE user_id = ?').bind(uid).first()) return
  const snapshot = await db.prepare('SELECT doc FROM user_docs WHERE user_id = ?').bind(uid).first<{ doc: string }>()
  if (!snapshot) return
  const old = JSON.parse(snapshot.doc) as { memos?: Array<{ id: string; text: string; done: boolean; createdAt: number }> }
  const now = Date.now()
  const inserts = (old.memos ?? []).filter(m => typeof m.id === 'string' && typeof m.text === 'string').map(m =>
    db.prepare(`INSERT OR IGNORE INTO user_memos (user_id, id, text, done, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(uid, m.id, m.text, m.done ? 1 : 0, m.createdAt || now, now))
  await db.batch([...inserts, db.prepare('INSERT OR IGNORE INTO workbench_migrations VALUES (?, ?, ?)').bind(uid, snapshot.doc, now)])
}

const routes = new Hono<{ Bindings: Bindings; Variables: Variables }>()
routes.use('/api/memos*', async (c, next) => {
  await migrateLegacy(c.env.DB, c.get('workbenchUserId'))
  return next()
})

routes.get('/api/memos', async c => {
  const since = Number(c.req.query('since') || 0)
  if (!Number.isSafeInteger(since) || since < 0) return c.json({ error: 'invalid_since' }, 400)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM user_memos WHERE user_id = ? AND updated_at > ? ORDER BY updated_at, id',
  ).bind(c.get('workbenchUserId'), since).all<MemoRow>()
  return c.json({ ok: true, memos: results.map(publicMemo), cursor: results.at(-1)?.updated_at ?? since })
})

routes.on(['PUT', 'DELETE'], '/api/memos/:id', async c => {
  const uid = c.get('workbenchUserId')
  const id = c.req.param('id')
  const raw = await c.req.text()
  if (raw.length > 24000) return c.json({ error: 'payload_too_large' }, 413)
  let body: { text?: unknown; done?: unknown; createdAt?: unknown; expectedUpdatedAt?: unknown }
  try { body = JSON.parse(raw) } catch { return c.json({ error: 'invalid_json' }, 400) }
  const expected = body.expectedUpdatedAt
  if (!id || id.length > 200 || typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0) {
    return c.json({ error: 'invalid_memo' }, 400)
  }
  const deleting = c.req.method === 'DELETE'
  if (!deleting && (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 20000 || typeof body.done !== 'boolean')) {
    return c.json({ error: 'invalid_memo' }, 400)
  }
  const existing = await c.env.DB.prepare('SELECT * FROM user_memos WHERE user_id = ? AND id = ?')
    .bind(uid, id).first<MemoRow>()
  if ((!existing && expected !== 0) || (existing && (existing.updated_at !== expected || (!deleting && existing.deleted_at)))) {
    return c.json({ error: 'workbench_conflict', memo: existing ? publicMemo(existing) : null }, 409)
  }
  const now = Date.now()
  const text = deleting ? existing?.text ?? '' : (body.text as string).trim()
  const done = deleting ? existing?.done ?? 0 : body.done ? 1 : 0
  const createdAt = existing?.created_at ?? (typeof body.createdAt === 'number' && Number.isSafeInteger(body.createdAt) ? body.createdAt : now)
  // CAS 在 SQL 内再次检查，避免读后写竞争；按账号递增，since 不漏掉同毫秒写入。
  const row = await c.env.DB.prepare(`
    INSERT INTO user_memos (user_id, id, text, done, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, MAX(?, COALESCE((SELECT MAX(updated_at) FROM user_memos WHERE user_id = ?), 0) + 1), ?)
    ON CONFLICT(user_id, id) DO UPDATE SET text=excluded.text, done=excluded.done,
      updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
    WHERE user_memos.updated_at = ? AND (? = 1 OR user_memos.deleted_at IS NULL)
    RETURNING *`).bind(uid, id, text, done, createdAt, now, uid, deleting ? now : null, expected, deleting ? 1 : 0).first<MemoRow>()
  if (!row) return c.json({ error: 'workbench_conflict' }, 409)
  return c.json({ ok: true, memo: publicMemo(row) })
})

routes.get('/api/clipboard', async c => {
  const row = await c.env.DB.prepare('SELECT content, updated_at FROM user_clipboard WHERE user_id = ?')
    .bind(c.get('workbenchUserId')).first<{ content: string; updated_at: number }>()
  return c.json({ ok: true, content: row?.content ?? '', updatedAt: row?.updated_at ?? 0 })
})

routes.put('/api/clipboard', async c => {
  const raw = await c.req.text()
  if (raw.length > 1024 * 1024) return c.json({ error: 'payload_too_large' }, 413)
  let body: { content?: unknown; expectedUpdatedAt?: unknown }
  try { body = JSON.parse(raw) } catch { return c.json({ error: 'invalid_json' }, 400) }
  const expected = body.expectedUpdatedAt
  if (typeof body.content !== 'string' || typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0) {
    return c.json({ error: 'invalid_clipboard' }, 400)
  }
  const uid = c.get('workbenchUserId')
  if (expected > 0 && !(await c.env.DB.prepare('SELECT user_id FROM user_clipboard WHERE user_id = ?').bind(uid).first())) {
    return c.json({ error: 'workbench_conflict' }, 409)
  }
  const row = await c.env.DB.prepare(`INSERT INTO user_clipboard VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET content=excluded.content, updated_at=MAX(excluded.updated_at, user_clipboard.updated_at + 1)
    WHERE user_clipboard.updated_at = ? RETURNING content, updated_at`)
    .bind(uid, body.content, Date.now(), expected).first<{ content: string; updated_at: number }>()
  if (!row) return c.json({ error: 'workbench_conflict' }, 409)
  return c.json({ ok: true, content: row.content, updatedAt: row.updated_at })
})

export { routes as workbenchRoutes, migrateLegacy }

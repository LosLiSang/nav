/**
 * #10/#12 路由 + 实际 D1 E2E；出站 DNS/HTTP 使用计数夹具，绝不调用生产。
 * npm run check:metadata
 * 两个真实 Worker 共享同一独立 D1，验证跨实例租约；报告可重复。
 */
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { runMetadataUI } from './metadata-cache-ui.mjs'
import { createServer as createTcpServer } from 'node:net'

const root = resolve(import.meta.dirname, '..')
const out = resolve(process.env.OUT_DIR || join(root, 'artifacts/metadata-cache-e2e'))
if (!out.startsWith(join(root, 'artifacts') + '\\') && !out.startsWith(join(root, 'artifacts') + '/')) throw new Error('OUT_DIR must be under artifacts')
mkdirSync(out, { recursive: true })
const config = join(root, 'worker/test/wrangler.toml')
const wrangler = join(root, 'worker/node_modules/wrangler/bin/wrangler.js')
const state = join(out, 'd1')
const base = 'http://127.0.0.1:8820'
const results = []
const counts = {}
const workers = []
let workerLog = ''
let failUpstream = false
let delay = 0
const icon = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1HkAAAAASUVORK5CYII=', 'base64')
const fixture = createServer(async (req, res) => {
  const target = new URL(req.url, 'http://fixture')
  if (target.pathname === '/dns') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(target.searchParams.get('host') === 'private.test' ? ['127.0.0.1'] : ['93.184.216.34']))
    return
  }
  const url = new URL(target.searchParams.get('url'))
  counts[url.href] = (counts[url.href] || 0) + 1
  if (delay) await new Promise(r => setTimeout(r, delay))
  if (url.pathname === '/redirect-private') {
    res.writeHead(302, { Location: 'http://private.test/secret' }).end()
  } else if (url.pathname === '/large') {
    res.setHeader('Content-Type', 'text/html')
    res.end('x'.repeat(300000))
  } else if (failUpstream || url.pathname === '/failure') {
    res.writeHead(503).end('fixture failure')
  } else if (url.pathname.endsWith('.ico')) {
    res.setHeader('Content-Type', 'image/png')
    res.end(icon)
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<html><head><title>Fixture ${url.pathname}${url.search}</title></head></html>`)
  }
})
function sql(query) {
  const file = join(out, 'query.sql')
  writeFileSync(file, query)
  const text = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'nav-sync', '--local',
    '--persist-to', state, '--config', config, '--file', file, '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return JSON.parse(text)
}
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
}
async function api(path, token = '', options = {}, url = base) {
  const response = await fetch(url + path, { ...options,
    headers: { Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    signal: AbortSignal.timeout(20000) })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()).length
  return { status: response.status, body, cache: response.headers.get('x-metadata-cache'), version: response.headers.get('x-metadata-version') }
}
function hash(v) { return createHash('sha256').update(v).digest('hex') }
async function readTitle(url, token = 'cache-a', instance = base) {
  return api('/api/title?url=' + encodeURIComponent(url), token, {}, instance)
}
async function main() {
  for (const port of [8820, 8821, 8920, 8921, ...(process.env.TEST_UI === '1' ? [5220, 9440] : [])]) {
    const server = createTcpServer()
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => server.close(resolve))
    })
  }
  await new Promise((resolve, reject) => { fixture.once('error', reject); fixture.listen(8822, '127.0.0.1', resolve) })
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'nav-sync', '--local',
    '--persist-to', state, '--config', config], { cwd: root, stdio: 'ignore' })
  if (sql("SELECT name FROM sqlite_master WHERE name='metadata_cache';")[0].results.length) {
    sql("DELETE FROM metadata_cache; DELETE FROM metadata_limits; DELETE FROM metadata_operations; DELETE FROM metadata_audit; UPDATE metadata_state SET epoch=1, changed_at=0;")
  }
  const now = Date.now()
  for (const [id, role, status] of [['cache-a', 'user', 'active'], ['cache-b', 'user', 'active'],
    ['cache-admin', 'admin', 'active'], ['cache-pending', 'user', 'pending'], ['cache-disabled', 'user', 'disabled']]) {
    const gh = Math.floor(Math.random() * 100000000)
    const doc = JSON.stringify({
      categories: [{ id: 'cat-prod', name: '缓存测试', order: 0 }], subSections: [], subCategories: [], totpAccounts: [],
      settings: { themeMode: 'light' },
      bookmarks: [
        { id: 'one', categoryId: 'cat-prod', url: 'https://cache.test/a?b=2&a=1', title: 'SAVED TITLE', iconUrl: '', order: 0, createdAt: 1, updatedAt: 1 },
        { id: 'icon', categoryId: 'cat-prod', url: 'https://cache.test/', title: 'MANUAL TITLE', iconUrl: 'data:manual-icon', order: 1, createdAt: 1, updatedAt: 1 },
      ], memos: [{ id: 'do-not-touch', text: 'BUSINESS DATA', done: false, createdAt: 1 }],
    }).replaceAll("'", "''")
    sql(`INSERT OR IGNORE INTO users VALUES ('${id}', ${gh}, '${id}', NULL, NULL, '${role}', '${status}', ${now}, ${now});
      INSERT OR REPLACE INTO sessions VALUES ('${hash(id)}', '${id}', ${now}, ${now + 3600000}, 'isolated cache E2E');
      INSERT OR REPLACE INTO user_docs VALUES ('${id}', '${doc}', ${now}, 1, 'fixture');`)
  }
  for (const port of [8820, 8821]) {
    const proc = spawn(process.execPath, [wrangler, 'dev', '--config', config, '--port', String(port),
      '--inspector-port', String(port + 100), '--persist-to', state], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    for (const stream of [proc.stdout, proc.stderr]) stream.on('data', data => { workerLog = (workerLog + data.toString()).slice(-8000) })
    workers.push(proc)
    let ready = false
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      if (proc.exitCode !== null) throw new Error('Owned Worker exited before ready')
      try { ready = (await fetch(`http://127.0.0.1:${port}/`).then(r => r.json())).ok } catch {}
      if (!ready) await new Promise(r => setTimeout(r, 200))
    }
    if (!ready) throw new Error('Worker did not become ready')
  }
  const capability = await api('/api/cache/capabilities', 'cache-a')
  if (process.env.TEST_UI_ONLY === '1') {
    await runMetadataUI(root, out, check, () => counts['https://cache.test/favicon.ico'] || 0)
    return
  }
  check('New backend advertises cache protocol', capability.status === 200 && capability.body.protocol === 1)
  for (const target of ['http://127.0.0.1/', 'http://2130706433/', 'http://[::1]/', 'http://private.test/secret',
    'https://u:password@cache.test/', 'ftp://cache.test/', 'https://cache.test:8443/']) {
    const r = await readTitle(target)
    check('Reject unsafe target: ' + target.replace('u:password@', '<credentials>@'), [400, 403].includes(r.status), { status: r.status })
  }
  check('Anonymous force rejected', [400, 401, 403].includes((await api('/api/icon?domain=cache.test&force=1')).status))
  if (capability.status !== 200) return // 保存旧实现红灯，不等待它访问不可解析的测试域名。
  const docBefore = sql('SELECT user_id, doc, rev FROM user_docs ORDER BY user_id;')[0].results
  const first = await readTitle('https://cache.test/a?b=2&a=1#frag')
  const second = await readTitle('https://CACHE.test/a?b=2&a=1')
  check('First MISS then normalized HIT', first.cache === 'MISS' && second.cache === 'HIT' && first.body.title === second.body.title, { first, second })
  check('Same resource fetched once', counts['https://cache.test/a?b=2&a=1'] === 1, counts)
  const otherPage = await readTitle('https://cache.test/b')
  const queryOrder = await readTitle('https://cache.test/a?a=1&b=2')
  check('Different path and query order have independent titles', otherPage.body.title !== first.body.title && queryOrder.body.title !== first.body.title)
  await readTitle('https://cache.test/a?b=2&a=1', 'cache-b')
  check('Private titles isolated by account', counts['https://cache.test/a?b=2&a=1'] === 2)
  await readTitle('https://cache.test/anonymous', '')
  await readTitle('https://cache.test/anonymous', '')
  check('Anonymous titles never persist', counts['https://cache.test/anonymous'] === 2)
  check('Pending account refused', (await readTitle('https://cache.test/a', 'cache-pending')).status === 403)
  check('Disabled account refused', (await readTitle('https://cache.test/a', 'cache-disabled')).status === 403)
  const i1 = await api('/api/icon?domain=cache.test', 'cache-a')
  const i2 = await api('/api/icon?domain=cache.test', 'cache-b')
  check('Icons shared across accounts', i1.cache === 'MISS' && i2.cache === 'HIT' && i1.status === 200)
  const f1 = await readTitle('https://cache.test/failure')
  const f2 = await readTitle('https://cache.test/failure')
  check('Failures negatively cached', f1.status === 502 && f2.status === 502 && counts['https://cache.test/failure'] === 1)
  const redir = await readTitle('https://cache.test/redirect-private')
  check('Public-to-private redirect rejected without private connection', [400, 403, 502].includes(redir.status) && !counts['http://private.test/secret'])
  check('Oversized responses rejected', (await readTitle('https://cache.test/large')).status === 502)
  delay = 500
  const race = await Promise.all([readTitle('https://cache.test/concurrent'), readTitle('https://cache.test/concurrent', 'cache-a', 'http://127.0.0.1:8821')])
  delay = 0
  check('Two Workers use one resource lease', counts['https://cache.test/concurrent'] === 1 && race.some(r => r.status === 200), race)
  sql("UPDATE metadata_cache SET fresh_until=0 WHERE kind='title' AND scope='cache-a';")
  const expired = await readTitle('https://cache.test/a?b=2&a=1')
  check('TTL expiry rebuilds', expired.cache === 'MISS' && expired.status === 200)
  failUpstream = true
  sql("UPDATE metadata_cache SET fresh_until=0 WHERE kind='title' AND scope='cache-a';")
  const stale = await readTitle('https://cache.test/a?b=2&a=1')
  check('Failed rebuild retains previous success', stale.status === 200 && stale.body.stale === true && stale.body.title === first.body.title, stale)
  failUpstream = false
  sql("UPDATE metadata_cache SET stale_until=0, fresh_until=0 WHERE scope='cache-a' AND kind='title';")
  const tooOld = await readTitle('https://cache.test/a?b=2&a=1')
  check('Stale retention has a hard deadline', tooOld.status === 502 && !tooOld.body.title, tooOld)
  sql("DELETE FROM metadata_limits WHERE id='read:cache-a';")
  delay = 700
  const late = api('/api/icon?domain=late.test')
  await new Promise(r => setTimeout(r, 250))
  sql("UPDATE metadata_state SET epoch=epoch+1 WHERE id='public-icons';")
  const lateResult = await late
  delay = 0
  check('Old generation cannot refill after public invalidation', lateResult.status === 202 &&
    sql("SELECT key FROM metadata_cache WHERE scope='public' AND value IS NOT NULL AND epoch < (SELECT epoch FROM metadata_state WHERE id='public-icons');")[0].results
      .every(r => r.key !== hash('v1:icon:public:https://late.test')), lateResult)
  sql(`INSERT INTO metadata_cache (key,kind,scope,byte_size,touched_at,stale_until) VALUES
    ('capacity-fixture','icon','public',104857600,${Date.now()},${Date.now() + 86400000});`)
  const capacity = await readTitle('https://cache.test/capacity')
  check('Global byte capacity enforced on commit', capacity.status === 202 && capacity.body.error === 'superseded_or_capacity', capacity)
  sql("DELETE FROM metadata_cache WHERE key='capacity-fixture';")
  sql(`INSERT OR REPLACE INTO metadata_limits VALUES ('read:cache-a',60,${Date.now() + 60000});`)
  const rate = await readTitle('https://cache.test/quota')
  check('Account cold-miss budget is atomic and bounded', rate.status === 429 && !counts['https://cache.test/quota'], rate)
  // #12 的红灯先于管理 API 与界面实现；已完成 #10 时这些检查应失败。
  if (process.env.TEST_MANAGEMENT === '1') {
    sql('DELETE FROM metadata_limits; UPDATE metadata_state SET changed_at=0;')
    const manage = (targets, token = 'cache-a', id = 'operation-' + Date.now()) => api('/api/cache/refresh', token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: id, targets }),
    })
    check('Anonymous cannot refresh', (await manage([{ bookmarkId: 'one', kind: 'title' }], '')).status === 401)
    check('Pending user cannot refresh', (await manage([{ bookmarkId: 'one', kind: 'title' }], 'cache-pending')).status === 403)
    check('Forged bookmark scope rejected', (await manage([{ bookmarkId: 'not-mine', kind: 'title' }])).status === 403)
    check('More than 20 resources rejected', (await manage(Array.from({ length: 21 }, () => ({ bookmarkId: 'one', kind: 'title' })))).status === 400)
    check('Multi-resource HTTP invocation requires chunking', (await manage([
      { bookmarkId: 'one', kind: 'title' }, { bookmarkId: 'one', kind: 'icon' },
    ])).body.error === 'batch_requires_chunking')
    check('Changed unsynced URL cannot refresh saved resource', (await manage([
      { bookmarkId: 'one', kind: 'title', expectedUrl: 'https://changed.test/' },
    ])).status === 409)
    check('Oversized management body refused', (await api('/api/cache/refresh', 'cache-a',
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: 'oversized-operation', padding: 'x'.repeat(70000) }) })).status === 413)
    const operationId = 'repeat-safe-operation'
    const refresh = await manage([{ bookmarkId: 'one', kind: 'title' }], 'cache-a', operationId)
    const countBeforeRepeat = counts['https://cache.test/a?b=2&a=1']
    const repeat = await manage([{ bookmarkId: 'one', kind: 'title' }], 'cache-a', operationId)
    check('Authorized refresh replaces cache', refresh.status === 200 && refresh.body.results?.[0].status === 'refreshed', refresh)
    check('Operation retry is idempotent', repeat.status === 200 && counts['https://cache.test/a?b=2&a=1'] === countBeforeRepeat, repeat)
    check('Same operation ID cannot change meaning', (await manage([{ bookmarkId: 'one', kind: 'icon' }], 'cache-a', operationId)).status === 409)
    check('Resource cooldown enforced', (await manage([{ bookmarkId: 'one', kind: 'title' }])).body.results?.[0].status === 'rate_limited')
    check('Manual icon is never refreshed or overwritten', (await manage([{ bookmarkId: 'icon', kind: 'icon' }])).body.results?.[0].status === 'manual_skipped')
    sql("DELETE FROM metadata_limits;")
    failUpstream = true
    const retained = await manage([{ bookmarkId: 'one', kind: 'title' }])
    failUpstream = false
    check('Failed manual refresh truthfully retains old value', retained.body.results?.[0].status === 'retained_old', retained)
    const invalidate = (token, epoch, confirmation = 'INVALIDATE PUBLIC ICONS', id = 'invalidate-' + Date.now()) =>
      api('/api/admin/cache/invalidate-public', token, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: id, expectedEpoch: epoch, confirmation }) })
    const caps = (await api('/api/cache/capabilities', 'cache-admin')).body
    check('User cannot invalidate public cache globally', (await invalidate('cache-a', caps.epoch)).status === 403)
    check('Admin must confirm scope', (await invalidate('cache-admin', caps.epoch, 'wrong')).status === 400)
    const privateBefore = sql("SELECT key, title, generation FROM metadata_cache WHERE kind='title' ORDER BY key;")[0].results
    const invalidated = await invalidate('cache-admin', caps.epoch, 'INVALIDATE PUBLIC ICONS', 'admin-idempotent')
    check('Admin invalidates public epoch', invalidated.status === 200 && invalidated.body.epoch === caps.epoch + 1, invalidated)
    check('Admin invalidation retry does not increment again', (await invalidate('cache-admin', caps.epoch, 'INVALIDATE PUBLIC ICONS', 'admin-idempotent')).body.epoch === caps.epoch + 1)
    check('Admin operation preserves all private titles', JSON.stringify(privateBefore) === JSON.stringify(sql("SELECT key, title, generation FROM metadata_cache WHERE kind='title' ORDER BY key;")[0].results))
    check('Audit does not contain raw URLs', sql("SELECT result FROM metadata_audit WHERE result LIKE '%https:%';")[0].results.length === 0)
  }
  const docAfter = sql('SELECT user_id, doc, rev FROM user_docs ORDER BY user_id;')[0].results
  check('Cache reads do not modify snapshots or user content', JSON.stringify(docBefore) === JSON.stringify(docAfter))
  if (process.env.TEST_UI === '1') {
    sql('DELETE FROM metadata_limits; UPDATE metadata_state SET changed_at=0;')
    await runMetadataUI(root, out, check, () => counts['https://cache.test/favicon.ico'] || 0)
  }
}
try { await main() } catch (error) {
  check('E2E execution', false, error.message + (error.cause ? ': ' + error.cause.message : ''))
  console.error(workerLog.slice(-2000))
} finally {
  writeFileSync(join(out, 'report.json'), JSON.stringify({ results, counts, passed: results.filter(r => r.ok).length,
    total: results.length, productionTouched: false }, null, 2))
  for (const proc of workers) if (proc.pid && proc.exitCode === null) {
    try { execFileSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }) } catch {}
  }
  await new Promise(r => fixture.close(r))
  console.log(`${results.filter(r => r.ok).length}/${results.length} passed; ${join(out, 'report.json')}`)
  if (results.some(r => !r.ok)) process.exitCode = 1
}

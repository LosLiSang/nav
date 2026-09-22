/**
 * nav-sync 端到端冒烟测试（无头 Edge + CDP）
 *
 * 覆盖用户最关心的场景：
 *  1. 老设备接入云同步 -> 本地数据被推上 D1
 *  2. 全新浏览器（等价于清掉 cookie/站点数据/换设备）-> 填一次 token 就能整份恢复
 *  3. 云端被别的设备推进后，本机不许静默覆盖，必须进入冲突状态
 *
 * 用法：node smoke.mjs
 * 前置：worker 本地实例在 8788，vite dev 在 5199
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5199'
const WORKER_URL = process.env.WORKER_URL || 'http://127.0.0.1:8788'
const TOKEN = process.env.SYNC_TOKEN || 'local-dev-token'
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

async function cloudFetch() {
  const res = await fetch(`${WORKER_URL}/api/data`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  return res.json()
}

async function cloudPut(payload, force) {
  const res = await fetch(`${WORKER_URL}/api/data`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, force }),
  })
  return { status: res.status, body: await res.json() }
}

async function main() {
  // ------------------------------------------------------------ 云端必须是空的
  const initial = await cloudFetch()
  check(
    '测试起点：云端是空的（等价于刚部署好 Worker）',
    initial.doc === null,
    `doc=${initial.doc === null ? 'null' : '有数据，请先跑 wrangler d1 execute 清表'}`,
  )
  if (initial.doc !== null) {
    throw new Error('云端不为空，先执行：wrangler d1 execute nav-sync --local --command "DELETE FROM nav_docs"')
  }

  // ------------------------------------------------- 场景 1：老设备接入，推上云端
  const a = await launchBrowser(9333)
  try {
    const evaluate = await openApp(a.cdp)
    const before = await evaluate(
      `(async () => { const m = ${STORE}; const s = m.useNavStore.getState(); return { bookmarks: s.bookmarks.length, categories: s.categories.length, sync: s.syncStatus } })()`,
    )
    check('首屏加载完成且有默认种子数据', before.bookmarks > 0 && before.categories > 0, JSON.stringify(before))
    check('未配置时同步状态为 off', before.sync === 'off', `sync=${before.sync}`)

    await evaluate(
      `(async () => { const m = ${STORE}; await m.useNavStore.getState().addBookmark({ title: ${JSON.stringify(MESSAGE_TITLE)}, url: 'https://example.com/e2e' }); return true })()`,
    )

    await evaluate(
      `(async () => { const m = ${STORE}; await m.useNavStore.getState().configureSync(${JSON.stringify(WORKER_URL)}, ${JSON.stringify(TOKEN)}); return true })()`,
    )

    const afterPush = await evaluate(
      `(async () => { const m = ${STORE}; const s = m.useNavStore.getState(); return { status: s.syncStatus, message: s.syncMessage, local: s.localUpdatedAt, remote: s.remoteUpdatedAt, bookmarks: s.bookmarks.length } })()`,
    )
    check('配置后自动上传成功', afterPush.status === 'synced', JSON.stringify(afterPush))

    const cloud = await cloudFetch()
    const cloudHasIt = (cloud.doc?.bookmarks ?? []).some((b) => b.title === MESSAGE_TITLE)
    check('云端 D1 里出现了本地新增的书签', cloudHasIt, `云端书签数=${cloud.doc?.bookmarks?.length ?? 0}`)
    check(
      '云端时间戳与本机对齐',
      cloud.updatedAt === afterPush.local,
      `cloud=${cloud.updatedAt} local=${afterPush.local}`,
    )

    // ---------------------------------------------- 冲突保护：云端被别的设备推进
    const deviceC = {
      ...cloud.doc,
      bookmarks: [
        ...(cloud.doc?.bookmarks ?? []),
        { id: 'from-device-c', title: '来自设备C的书签', url: 'https://example.com/c', order: 999, createdAt: Date.now(), updatedAt: Date.now() },
      ],
    }
    const forced = await cloudPut(
      { doc: deviceC, updatedAt: Math.max(Date.now(), cloud.updatedAt + 1) },
      true,
    )
    check('模拟设备C推了一份新版本到云端', forced.status === 200, `PUT -> ${forced.status}`)

    const afterConflict = await evaluate(
      `(async () => { const m = ${STORE}; await m.useNavStore.getState().pushToCloud(); const s = m.useNavStore.getState(); return { status: s.syncStatus, message: s.syncMessage } })()`,
    )
    check(
      '云端更新后本机不会静默覆盖（进入冲突状态）',
      afterConflict.status === 'conflict',
      JSON.stringify(afterConflict),
    )

    const cloudAfter = await cloudFetch()
    const cIntact = (cloudAfter.doc?.bookmarks ?? []).some((b) => b.title === '来自设备C的书签')
    check('设备C的数据在云端保持完整', cIntact, `云端书签数=${cloudAfter.doc?.bookmarks?.length ?? 0}`)
  } finally {
    await a.close()
  }

  // ------------------------------------- 场景 2：全新浏览器 = 清掉数据后恢复
  const b = await launchBrowser(9334)
  try {
    const evaluate = await openApp(b.cdp)
    const fresh = await evaluate(
      `(async () => { const m = ${STORE}; const s = m.useNavStore.getState(); return { bookmarks: s.bookmarks.length, hasSeed: s.bookmarks.some(b => b.id === 'bm-github' || b.title.includes('GitHub')), sync: s.syncStatus, local: s.localUpdatedAt } })()`,
    )
    check('全新浏览器初始只有默认种子（没有用户数据）', fresh.local === 0, JSON.stringify(fresh))

    await evaluate(
      `(async () => { const m = ${STORE}; await m.useNavStore.getState().configureSync(${JSON.stringify(WORKER_URL)}, ${JSON.stringify(TOKEN)}); return true })()`,
    )

    const restored = await evaluate(
      `(async () => { const m = ${STORE}; const s = m.useNavStore.getState(); return { status: s.syncStatus, message: s.syncMessage, bookmarks: s.bookmarks.length, hasTest: s.bookmarks.some(b => b.title === ${JSON.stringify(MESSAGE_TITLE)}), hasC: s.bookmarks.some(b => b.title === '来自设备C的书签') } })()`,
    )
    check('新浏览器填一次 token 后自动恢复云端数据', restored.status === 'synced', JSON.stringify(restored))
    check('恢复后包含之前的自定义书签', restored.hasTest === true, `bookmarks=${restored.bookmarks}`)
    check('恢复后包含设备C的书签', restored.hasC === true, `bookmarks=${restored.bookmarks}`)

    // 落盘检查：刷新页面后数据应该还在（IndexedDB 已写回）
    await cdpReload(b.cdp, evaluate)
    const afterReload = await evaluate(
      `(async () => { const m = ${STORE}; const s = m.useNavStore.getState(); return { status: s.syncStatus, bookmarks: s.bookmarks.length, hasTest: s.bookmarks.some(b => b.title === ${JSON.stringify(MESSAGE_TITLE)}) } })()`,
    )
    check('刷新后云端数据仍在（并自动完成一次同步）', afterReload.hasTest === true, JSON.stringify(afterReload))
  } finally {
    await b.close()
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

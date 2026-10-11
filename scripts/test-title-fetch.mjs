/**
 * 网页标题与图标抓取 (100% Cloudflare Worker 纯云端架构) 端到端与交互验证测试
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { join } from 'node:path'

const APP_PORT = 5199
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const LOCAL_FIXTURES = process.env.LOCAL_FIXTURES === '1' || process.argv.includes('--local-fixtures')
const WORKER_URL = LOCAL_FIXTURES ? 'http://127.0.0.1:8799' : (process.env.VITE_SYNC_URL || 'https://nav.lisang.workers.dev')
const SVG_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#2563eb"/><circle cx="16" cy="16" r="8" fill="white"/></svg>'
const OUT_DIR = join(tmpdir(), 'nav-title-test', 'shots')
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PROXY = process.env.PROXY || 'http://127.0.0.1:7890'
const DEBUG_PORT = 9422

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      const p = this.pending.get(m.id)
      if (!p) return
      this.pending.delete(m.id)
      if (m.error) {
        p.reject(new Error(JSON.stringify(m.error)))
      } else {
        p.resolve(m.result)
      }
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

async function poll(fn, timeoutMs, label) {
  const end = Date.now() + timeoutMs
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
      if (last) return last
    } catch (e) {
      last = e.message
    }
    await sleep(200)
  }
  throw new Error(`超时: ${label} (last=${JSON.stringify(last)})`)
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  console.log(LOCAL_FIXTURES ? '=== 1. 本地确定性响应夹具（不验证线上 Worker） ===' : '=== 1. 验证 Cloudflare 线上 Worker 服务 ===')
  console.log(`Cloudflare Worker 目标地址: ${WORKER_URL}`)

  const results = []
  function check(name, ok, detail = '') {
    results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }

  // 1. Worker 端点测试
  let fixtureServer
  if (LOCAL_FIXTURES) {
    fixtureServer = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      const url = new URL(req.url, WORKER_URL)
      if (url.pathname === '/api/icon') {
        res.setHeader('Content-Type', 'image/svg+xml')
        res.end(SVG_ICON)
      } else {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ title: url.searchParams.get('url')?.includes('linux.do') ? 'LINUX DO' : 'Example Domain' }))
      }
    })
    await new Promise(resolve => fixtureServer.listen(8799, '127.0.0.1', resolve))
    fixtureServer.unref()
  }
  const agent = LOCAL_FIXTURES ? null : new ProxyAgent(PROXY)
  const workerFetch = (url, init = {}) => LOCAL_FIXTURES
    ? fetch(url, init) : undiciFetch(url, { dispatcher: agent, ...init })

  const res1 = await workerFetch(`${WORKER_URL}/api/title?url=${encodeURIComponent('https://example.com')}`)
  const data1 = await res1.json()
  check('Worker 标题抓取 (example.com)', Boolean(data1.title), `title="${data1.title}"`)

  const res2 = await workerFetch(`${WORKER_URL}/api/title?url=${encodeURIComponent('https://linux.do/')}`)
  const data2 = await res2.json()
  const linuxDoTitleOk = Boolean(
    data2.title &&
    (data2.title.includes('LINUX DO') || data2.title.includes('Linux Do'))
  )
  check(LOCAL_FIXTURES ? '本地响应夹具返回标题 (linux.do)' : 'Worker 穿透 Cloudflare 盾提取真实标题 (linux.do)', linuxDoTitleOk, `title="${data2.title}"`)

  const resLinuxIcon = await workerFetch(`${WORKER_URL}/api/icon?domain=linux.do`)
  const linuxIconBuf = Buffer.from(await resLinuxIcon.arrayBuffer())
  check(
    'Worker 代理拉取网站高清图标 (linux.do)',
    resLinuxIcon.ok && linuxIconBuf.length > 100,
    `status=${resLinuxIcon.status}, size=${linuxIconBuf.length}B`,
  )

  console.log('\n=== 2. 启动纯前端 Vite 开发服务器（零后端代理代码） ===')
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      VITE_SYNC_URL: WORKER_URL,
    },
  })

  await poll(async () => {
    try {
      const res = await fetch(`${APP_URL}/`)
      return res.ok
    } catch {
      return false
    }
  }, 20000, 'Vite dev server')
  console.log(`Vite 前端服务就绪: ${APP_URL}\n`)

  let proc = null
  let profile = null
  try {
    // -------------------------------------------------------------
    // 测试 2：前端完全走 Worker 时的端到端浏览器交互测试
    // -------------------------------------------------------------
    console.log('=== 3. 前端端到端全链路测试（无本地代理，全走 Worker） ===')
    profile = mkdtempSync(join(tmpdir(), 'nav-title-browser-'))
    proc = spawn(
      EDGE,
      [
        '--headless=new',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${profile}`,
        ...(LOCAL_FIXTURES ? [] : [`--proxy-server=${PROXY}`]),
        '--proxy-bypass-list=127.0.0.1;localhost',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        'about:blank',
      ],
      { stdio: 'ignore' },
    )

    const target = await poll(
      async () => {
        const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()
        return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
      },
      20000,
      'devtools',
    )
    const ws = new WebSocket(target)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true })
      ws.addEventListener('error', () => rej(new Error('ws error')), { once: true })
    })
    const cdp = new Cdp(ws)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      })
      if (r.exceptionDetails) {
        throw new Error(`页面异常: ${r.exceptionDetails.exception?.description}`)
      }
      return r.result.value
    }

    await cdp.send('Page.navigate', { url: APP_URL })
    await poll(
      () => evaluate(`Boolean(document.querySelector('button[title="全局界面与壁纸设置"]'))`),
      25000,
      'app ready',
    )

    // 打开「添加网址」弹窗
    const openAdd = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加')
      if (!btn) return false
      btn.click()
      return true
    })()`)
    check('打开添加网址弹窗', openAdd)

    await poll(
      () => evaluate(`Boolean(document.querySelector('input[placeholder*="https://www.baidu.com/"]'))`),
      10000,
      'modal input visible',
    )

    // 输入目标网址 https://linux.do/
    await evaluate(`(() => {
      const input = document.querySelector('input[placeholder*="https://www.baidu.com/"]')
      const last = input.value
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(input, 'https://linux.do/')
      const tracker = input._valueTracker
      if (tracker) tracker.setValue(last)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)

    // 验证实时图标预览已通过 Worker 请求并成功展示
    const iconPreviewOk = await poll(
      async () => {
        return evaluate(`(() => {
          const form = document.querySelector('input[placeholder*="https://www.baidu.com/"]')?.closest('form')
          const img = form ? form.querySelector('img') : null
          return Boolean(img && img.complete && img.naturalWidth > 0)
        })()`)
      },
      12000,
      'live icon image rendered and loaded',
    )
    check('前端通过 Worker 实时加载站点图标', iconPreviewOk)

    // 点击「抓取标题」按钮并等待触发
    await poll(
      () => evaluate(`(() => {
        const form = document.querySelector('input[placeholder*="https://www.baidu.com/"]')?.closest('form')
        const btn = form ? [...form.querySelectorAll('button')].find((b) => b.textContent.includes('抓取')) : null
        if (!btn || btn.disabled) return false
        btn.click()
        return true
      })()`),
      10000,
      'click fetch title button',
    )

    // 等待标题填充完成
    const filledTitle = await poll(
      async () => {
        const val = await evaluate(`(() => {
          const input = document.querySelector('input[placeholder="网站名称"]')
          return input ? input.value : ''
        })()`)
        return val && val.length > 0 ? val : false
      },
      15000,
      'title populated via worker',
    )

    const titleMatched = Boolean(
      filledTitle && (filledTitle.includes('LINUX DO') || filledTitle.includes('Linux Do'))
    )
    check('前端通过 Worker 成功获取并自动填入网站名称', titleMatched, `title="${filledTitle}"`)

    // 验证按钮变为「抓取成功」绿底状态
    const statusSuccess = await poll(
      async () => {
        return evaluate(`(() => {
          const form = document.querySelector('input[placeholder*="https://www.baidu.com/"]')?.closest('form')
          const btn = form ? [...form.querySelectorAll('button')].find((b) => b.textContent.includes('抓取成功')) : null
          return Boolean(btn)
        })()`)
      },
      5000,
      'status button success',
    )
    check('抓取按钮切换为「抓取成功」提示', statusSuccess)

    // Extend this golden journey rather than creating a separate cache E2E.
    if (LOCAL_FIXTURES) await verifyLocalIconCleanup(evaluate, check)

    // 截图留存工件
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const shotPath = join(OUT_DIR, 'worker-architecture-linuxdo-success.png')
    writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
    console.log(`截图工件已生成: ${shotPath}`)

    ws.close()
  } finally {
    if (proc) {
      proc.kill()
      try {
        rmSync(profile, { recursive: true, force: true })
      } catch {}
    }
    vite.kill()
    fixtureServer?.close()
    await agent?.close()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== 测试总结: ${results.length - failed.length}/${results.length} 通过 ===`)
  if (failed.length) process.exitCode = 1
}

async function verifyLocalIconCleanup(evaluate, check) {
  console.log('=== 附加验证：本地图标缓存的选择、保护与即时恢复 ===')
  await evaluate(`(async () => {
    const { useNavStore } = await import('/src/store/useNavStore.ts')
    const { db } = await import('/src/lib/db.ts')
    const nativeFetch = window.fetch.bind(window)
    window.__iconRequests = []
    window.__allowRetry = false
    window.fetch = (input, init) => {
      const url = String(input)
      if (url.includes('/api/icon') || url.includes('retry.test')) window.__iconRequests.push(url)
      if (url.includes('retry.test') && !window.__allowRetry) return Promise.resolve(new Response('', { status: 503 }))
      return nativeFetch(input, init)
    }
    const { saveSyncConfig, saveLocalTimestamp } = await import('/src/lib/sync.ts')
    const fixtureConfig = { url: 'http://127.0.0.1:8799', token: 'fixture-test-only' }
    saveSyncConfig(fixtureConfig)
    saveLocalTimestamp(1234)
    useNavStore.getState().setAutoSync(false)
    useNavStore.setState({ syncConfig: fixtureConfig, localUpdatedAt: 1234 })
    await useNavStore.getState().addCategory('缓存测试当前组')
    const current = useNavStore.getState().settings.activeCategoryId
    const other = useNavStore.getState().categories.find(c => c.id !== current).id
    for (const domain of ['empty.test', 'retry.test']) await db.iconCache.put({ domain, notFound: true, updatedAt: Date.now() })
    useNavStore.setState(s => ({ failedDomains: { ...s.failedDomains, 'empty.test': true, 'retry.test': true } }))
    const manual = 'data:image/svg+xml,' + encodeURIComponent(${JSON.stringify(SVG_ICON)})
    await useNavStore.getState().addBookmark({ categoryId: current, title: '待恢复图标', url: 'https://empty.test/a' })
    await useNavStore.getState().addBookmark({ categoryId: current, title: '失败后重试', url: 'https://retry.test/' })
    await useNavStore.getState().addBookmark({ categoryId: current, title: '有效图标保留', url: 'https://good.test/' })
    await useNavStore.getState().addBookmark({ categoryId: current, title: '手动图标保留', url: 'https://empty.test/manual', iconUrl: manual })
    await useNavStore.getState().addBookmark({ categoryId: other, title: '其他组同域名', url: 'https://empty.test/other' })
    await useNavStore.getState().ensureIcon('https://good.test/')
    window.__beforeGoodIcon = useNavStore.getState().cachedIcons['good.test']
    window.__businessSnapshot = async () => JSON.stringify(await Promise.all(db.tables.filter(t => t.name !== 'iconCache').map(t => t.toArray())))
    window.__beforeBusiness = await window.__businessSnapshot()
    window.__protectedStorageSnapshot = () => JSON.stringify(['nav_sync_config', 'nav_sync_auto', 'nav_sync_local_ts'].map(key => [key, localStorage.getItem(key)]))
    window.__beforeStorage = window.__protectedStorageSnapshot()
    window.__iconRequests = []
    return true
  })()`)
  await evaluate(`document.querySelector('button[title="全局界面与壁纸设置"]').click()`)
  await poll(() => evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '清理本地图标缓存')
    if (!button) return false
    button.click(); return true
  })()`), 5000, 'open cleanup selector')
  const defaults = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="清理本地图标缓存"]')
    const selected = [...dialog.querySelectorAll('input[type="checkbox"]')].filter(i => i.checked).map(i => i.getAttribute('aria-label'))
    return { empty: selected.includes('待恢复图标'), retry: selected.includes('失败后重试'), good: selected.includes('有效图标保留'), manual: selected.includes('手动图标保留'), shared: dialog.textContent.includes('其他组同域名') }
  })()`)
  check('默认仅选择主分区当前页空图标，保护有效远程与手动图标', defaults.empty && defaults.retry && !defaults.good && !defaults.manual, JSON.stringify(defaults))
  check('预览提示未选中组的同域名影响', defaults.shared)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '清理并立即获取').click()`)
  await poll(() => evaluate(`document.querySelector('[role="dialog"][aria-label="清理本地图标缓存"]').textContent.includes('远程图标获取成功 1 个，未成功 1 个')`), 15000, 'partial completion feedback')
  const restored = await evaluate(`(async () => {
    const { useNavStore } = await import('/src/store/useNavStore.ts')
    const { db } = await import('/src/lib/db.ts')
    const state = useNavStore.getState()
    const persisted = await db.iconCache.get('empty.test')
    return { restored: Boolean(state.cachedIcons['empty.test'] && persisted.blob && !persisted.notFound), good: state.cachedIcons['good.test'] === window.__beforeGoodIcon,
      business: (await window.__businessSnapshot()) === window.__beforeBusiness, storage: window.__protectedStorageSnapshot() === window.__beforeStorage,
      requests: window.__iconRequests.filter(url => url.includes('/api/icon')), noForce: window.__iconRequests.every(url => !url.includes('force=')) }
  })()`)
  check('清理后立即正常远程获取并落盘，无服务端强制失效', restored.restored && restored.noForce, JSON.stringify(restored.requests))
  check('同域名仅请求一次，未选中资源不重新抓取', restored.requests.filter(url => url.includes('empty.test')).length === 1 && restored.requests.every(url => !url.includes('good.test')))
  check('业务表、同步配置与有效图标保持完整', restored.good && restored.business && restored.storage, JSON.stringify({ good: restored.good, business: restored.business, storage: restored.storage }))
  const rendered = await evaluate(`[...document.querySelectorAll('img')].some(img => img.src.startsWith('blob:') && img.complete && img.naturalWidth > 0 && img.parentElement.textContent.includes('待恢复图标'))`)
  check('无需刷新即可渲染重新获取的图标', rendered)
  await evaluate(`window.__allowRetry = true; [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '重试失败项').click()`)
  await poll(() => evaluate(`document.querySelector('[role="dialog"][aria-label="清理本地图标缓存"]').textContent.includes('远程图标获取成功 1 个，未成功 0 个')`), 10000, 'explicit retry success')
  check('失败项可单独重试并恢复图标', await evaluate(`(async () => { const { useNavStore } = await import('/src/store/useNavStore.ts'); return Boolean(useNavStore.getState().cachedIcons['retry.test']) })()`))

  const failure = await evaluate(`(async () => {
    const { useNavStore } = await import('/src/store/useNavStore.ts')
    const { db } = await import('/src/lib/db.ts')
    const before = useNavStore.getState().cachedIcons['good.test']
    const ids = useNavStore.getState().bookmarks.filter(b => b.title === '有效图标保留').map(b => b.id)
    const original = db.iconCache.bulkDelete
    db.iconCache.bulkDelete = () => Promise.reject(new Error('injected deletion failure'))
    let failed = false
    try { await useNavStore.getState().clearAndReloadIcons(ids, 'all') } catch { failed = true } finally { db.iconCache.bulkDelete = original }
    return failed && useNavStore.getState().cachedIcons['good.test'] === before && !useNavStore.getState().iconCleanupRunning && (await window.__businessSnapshot()) === window.__beforeBusiness
  })()`)
  check('缓存删除失败不虚报成功、不破坏原缓存与业务数据', failure)

  const hierarchy = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="清理本地图标缓存"]')
    const select = dialog.querySelector('select[aria-label="图标状态筛选"]')
    select.value = 'all'; select.dispatchEvent(new Event('change', { bubbles: true }))
    const group = dialog.querySelector('input[aria-label="缓存测试当前组"]')
    if (!group.checked) group.click()
    return true
  })()`)
  await poll(() => evaluate(`document.querySelector('[role="dialog"][aria-label="清理本地图标缓存"]').textContent.includes('将处理 3 个书签，对应 3 个网站缓存')`), 5000, 'whole group selection')
  check('整组选择与全部自动图标筛选可用，仍排除手动图标', hierarchy)
  await evaluate(`document.querySelector('[role="dialog"][aria-label="清理本地图标缓存"] input[aria-label="有效图标保留"]').click()`)
  await poll(() => evaluate(`document.querySelector('[role="dialog"][aria-label="清理本地图标缓存"]').textContent.includes('将处理 2 个书签，对应 2 个网站缓存')`), 5000, 'individual deselection')
  check('可在组内进一步取消单个书签', true)

  // A remote completion that ignores abort still must not refill invalidated cache.
  await evaluate(`(async () => {
    const { useNavStore } = await import('/src/store/useNavStore.ts')
    const previousFetch = window.fetch
    let first = true
    window.fetch = (input, init) => {
      if (String(input).includes('/api/icon?domain=stale.test') && first) {
        first = false
        return new Promise(resolve => { window.__releaseStale = () => resolve(new Response(${JSON.stringify(SVG_ICON.replace('#2563eb', '#ff0000'))}, { headers: { 'Content-Type': 'image/svg+xml' } })) })
      }
      return previousFetch(input, init)
    }
    const current = useNavStore.getState().settings.activeCategoryId
    await useNavStore.getState().addBookmark({ categoryId: current, title: '旧请求防回填', url: 'https://stale.test/' })
    window.__oldRequest = useNavStore.getState().ensureIcon('https://stale.test/')
  })()`)
  await poll(() => evaluate('Boolean(window.__releaseStale)'), 5000, 'delayed old request started')
  const race = await evaluate(`(async () => {
    const { useNavStore } = await import('/src/store/useNavStore.ts')
    const { db } = await import('/src/lib/db.ts')
    const ids = useNavStore.getState().bookmarks.filter(b => b.title === '旧请求防回填').map(b => b.id)
    const results = await useNavStore.getState().clearAndReloadIcons(ids, 'all')
    window.__releaseStale()
    const old = await window.__oldRequest
    const row = await db.iconCache.get('stale.test')
    return results[0].status === 'success' && old.status === 'superseded' && (await row.blob.text()).includes('#2563eb')
  })()`)
  check('清理前的旧请求结果不能回填或覆盖新图标', race)
}

main().catch((err) => {
  console.error('测试异常退出:', err)
  process.exitCode = 1
})

/**
 * 网页标题与图标抓取 (100% Cloudflare Worker 纯云端架构) 端到端与交互验证测试
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { join } from 'node:path'

const APP_PORT = 5199
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const WORKER_URL = process.env.VITE_SYNC_URL || 'https://nav-sync.lisang.workers.dev'
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

  console.log('=== 1. 验证 Cloudflare 线上 Worker 服务 ===')
  console.log(`Cloudflare Worker 目标地址: ${WORKER_URL}`)

  const results = []
  function check(name, ok, detail = '') {
    results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }

  // 1. Worker 端点测试
  const agent = new ProxyAgent(PROXY)
  const workerFetch = (url, init = {}) => undiciFetch(url, { dispatcher: agent, ...init })

  const res1 = await workerFetch(`${WORKER_URL}/api/title?url=${encodeURIComponent('https://example.com')}`)
  const data1 = await res1.json()
  check('Worker 标题抓取 (example.com)', Boolean(data1.title), `title="${data1.title}"`)

  const res2 = await workerFetch(`${WORKER_URL}/api/title?url=${encodeURIComponent('https://linux.do/')}`)
  const data2 = await res2.json()
  const linuxDoTitleOk = Boolean(
    data2.title &&
    (data2.title.includes('LINUX DO') || data2.title.includes('Linux Do'))
  )
  check('Worker 穿透 Cloudflare 盾提取真实标题 (linux.do)', linuxDoTitleOk, `title="${data2.title}"`)

  const resLinuxIcon = await workerFetch(`${WORKER_URL}/api/icon?domain=linux.do`)
  const linuxIconBuf = Buffer.from(await resLinuxIcon.arrayBuffer())
  check(
    'Worker 代理拉取网站高清图标 (linux.do)',
    resLinuxIcon.ok && linuxIconBuf.length > 100,
    `status=${resLinuxIcon.status}, size=${linuxIconBuf.length}B`,
  )

  console.log('\n=== 2. 启动纯前端 Vite 开发服务器（零后端代理代码） ===')
  const vite = spawn('npx.cmd', ['vite', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], {
    shell: true,
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
        `--proxy-server=${PROXY}`,
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
    try {
      spawn('taskkill', ['/F', '/IM', 'node.exe', '/FI', 'WINDOWTITLE eq *5199*'], { stdio: 'ignore' })
    } catch {}
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== 测试总结: ${results.length - failed.length}/${results.length} 通过 ===`)
  if (failed.length) process.exitCode = 1
}

main().catch((err) => {
  console.error('测试异常退出:', err)
  process.exitCode = 1
})

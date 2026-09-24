/**
 * 网页标题抓取 (Worker / Vite 中间件 / 前端交互) 端到端与交互验证测试
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_PORT = 5199
const APP_URL = `http://127.0.0.1:${APP_PORT}`
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
  console.log('=== 1. 启动 Vite 本地开发服务器 ===')
  const vite = spawn('npx.cmd', ['vite', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  })

  // 等待 Vite 就绪
  await poll(async () => {
    try {
      const res = await fetch(`${APP_URL}/`)
      return res.ok
    } catch {
      return false
    }
  }, 20000, 'Vite dev server')

  console.log(`Vite 服务就绪: ${APP_URL}\n`)

  const results = []
  function check(name, ok, detail = '') {
    results.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }

  let proc = null
  let profile = null
  try {
    // -------------------------------------------------------------
    // 测试 1：测试 /api/title 接口（基本抓取与多来源回退）
    // -------------------------------------------------------------
    console.log('=== 2. 接口端点测试 (/api/title & /api/fetch-title) ===')
    const res1 = await fetch(`${APP_URL}/api/title?url=${encodeURIComponent('https://example.com')}`)
    const data1 = await res1.json()
    check('example.com 标题抓取', data1.title === 'Example Domain', `title="${data1.title}"`)

    const res2 = await fetch(`${APP_URL}/api/fetch-title?url=${encodeURIComponent('https://example.com')}`)
    const data2 = await res2.json()
    check('/api/fetch-title 兼容别名抓取', data2.title === 'Example Domain', `title="${data2.title}"`)

    const res3 = await fetch(`${APP_URL}/api/title?url=${encodeURIComponent('https://yeasy.gitbook.io/')}`)
    const data3 = await res3.json()
    check(
      'GitBook (https://yeasy.gitbook.io/) 页面标题抓取',
      Boolean(data3.title && data3.title.includes('Harness')),
      `title="${data3.title}"`,
    )

    // -------------------------------------------------------------
    // 测试 2：无头浏览器端到端交互测试（打开弹窗 -> 输入网址 -> 点击抓取 -> 自动填充）
    // -------------------------------------------------------------
    console.log('\n=== 3. 无头浏览器端到端交互测试 ===')
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

    // 输入目标网址 https://yeasy.gitbook.io/
    await evaluate(`(() => {
      const input = document.querySelector('input[placeholder*="https://www.baidu.com/"]')
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(input, 'https://yeasy.gitbook.io/')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)

    // 点击「抓取标题」按钮
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('抓取标题'))
      if (btn) btn.click()
    })()`)

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
      'title populated',
    )

    check('点击抓取标题成功自动填入网站名称', Boolean(filledTitle && filledTitle.includes('Harness')), `title="${filledTitle}"`)

    // 截图留存工件
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const shotPath = join(OUT_DIR, 'title-fetch-success.png')
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
    // 确保杀掉 5199 端口上的 node 进程
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

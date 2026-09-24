import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_PORT = 5199
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const OUT_DIR = join(tmpdir(), 'nav-layer-test')
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9422

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
  console.log(`[1/5] 启动 Vite 服务器 (端口 ${APP_PORT})...`)
  const vite = spawn(
    process.execPath,
    ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'],
    { stdio: 'pipe' }
  )
  vite.stderr.on('data', (d) => console.error('[vite]', d.toString()))

  const userDir = mkdtempSync(join(tmpdir(), 'edge-layer-'))
  let edge = null
  let ws = null

  try {
    await poll(async () => {
      const res = await fetch(APP_URL).catch(() => null)
      return res && res.status === 200
    }, 10000, '等待 Vite 服务就绪')

    console.log(`[2/5] 启动无头 Edge (端口 ${PORT})...`)
    edge = spawn(EDGE, [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      'about:blank',
    ])

    const targetUrl = await poll(async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
    }, 10000, '获取 Edge WebSocket 调试地址')

    const WebSocketImpl = globalThis.WebSocket
    ws = new WebSocketImpl(targetUrl)
    await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
    const cdp = new Cdp(ws)

    const send = (method, params = {}) => cdp.send(method, params)

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.navigate', { url: APP_URL })

    console.log('[3/5] 等待页面加载及 IndexedDB 数据就绪...')
    await send('Page.enable')
    await send('Runtime.enable')
    await sleep(2000)

    console.log('[4/5] 打开「网址样式」布局下拉菜单...')
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[title="切换布局"]');
        if (btn) btn.click();
      })()`,
    })
    await sleep(600)

    const checkResult = await send('Runtime.evaluate', {
      expression: `(() => {
        const layoutTitle = Array.from(document.querySelectorAll('span')).find(s => s.textContent === '网址样式');
        if (!layoutTitle) return { success: false, reason: '未找到网址样式菜单' };
        const menu = layoutTitle.closest('div.absolute');
        if (!menu) return { success: false, reason: '未找到菜单容器' };
        
        const menuRect = menu.getBoundingClientRect();
        const testX = menuRect.right - 40;
        const testY = menuRect.bottom - 40;
        const hitEl = document.elementFromPoint(testX, testY);
        const isInsideMenu = menu.contains(hitEl);
        
        const mainCard = menu.closest('section');
        const mainCardZ = mainCard ? getComputedStyle(mainCard).zIndex : null;
        
        const toolsSection = document.getElementById('tools-section');
        const toolsZ = toolsSection ? getComputedStyle(toolsSection).zIndex : null;

        return {
          success: isInsideMenu,
          hitElTag: hitEl ? hitEl.tagName : null,
          hitElClass: hitEl ? hitEl.className : null,
          mainCardZ,
          toolsZ,
          menuRect: { x: menuRect.x, y: menuRect.y, width: menuRect.width, height: menuRect.height },
        };
      })()`,
      returnByValue: true,
    })

    const val = checkResult.result ? checkResult.result.value : checkResult.value
    console.log('图层检测结果:', val)

    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    const shotPath = join(OUT_DIR, 'layout-menu-layer-test.png')
    writeFileSync(shotPath, Buffer.from(data, 'base64'))
    console.log(`[5/5] 测试截图已保存至: ${shotPath}`)

    if (!val || !val.success) {
      throw new Error(`图层检测失败: 菜单底部区域被其他元素遮挡 (hitEl: ${val?.hitElTag}.${val?.hitElClass})`)
    }
    console.log('✅ 端到端图层测试通过：网址样式菜单层级高于工具卡片与猫咪插画！')
  } finally {
    if (ws) ws.close()
    if (edge) {
      edge.kill()
      await sleep(300)
    }
    try {
      rmSync(userDir, { recursive: true, force: true })
    } catch {}
    if (vite) {
      vite.kill()
    }
  }
}

main().catch((err) => {
  console.error('❌ 测试运行异常:', err)
  process.exit(1)
})

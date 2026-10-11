/**
 * Issue #22 的端到端回归：实际启动 Vite + Edge，交叉验证系统/应用主题。
 * npm run check:light（无需预先启动服务器，不访问线上账号或修改真实浏览器数据）。
 * 工件：artifacts/light-mode/{report.json,*.png}；OUT_DIR 可保留修复前的独立报告。
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP_PORT = Number(process.env.APP_PORT || 5202)
const DEBUG_PORT = Number(process.env.DEBUG_PORT || 9442)
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const OUT_DIR = resolve(process.env.OUT_DIR || join(ROOT, 'artifacts', 'light-mode'))
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function poll(fn, label, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { if (await fn()) return } catch { /* 服务启动期间重试 */ }
    await sleep(100)
  }
  throw new Error(`超时：${label}`)
}

class Cdp {
  seq = 0
  pending = new Map()
  constructor(ws) {
    this.ws = ws
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      const item = this.pending.get(message.id)
      if (!item) return
      this.pending.delete(message.id)
      clearTimeout(item.timer)
      if (message.error) item.reject(new Error(JSON.stringify(message.error)))
      else item.resolve(message.result)
    })
  }
  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP 超时：${method}`))
      }, 15000)
      this.pending.set(id, { resolve, reject, timer })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
}

const settings = `document.querySelector('button[title="全局界面与壁纸设置"]')`
const style = `document.querySelector('button[title="书签排版与展示设置"]')`
const profile = `document.querySelector('[title="个人中心与数据管理"]')`
const add = `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '添加')`
const tab = (name) => `[...document.querySelectorAll('.nav-dialog button')].find(b => b.textContent.includes('${name}'))`
const PANELS = [
  { id: 'settings', actions: [settings], sliders: 4, primary: true },
  { id: 'settings-sync', actions: [settings, tab('云端同步')], primary: true },
  { id: 'profile', actions: [profile], primary: true },
  { id: 'profile-data', actions: [profile, tab('数据备份')], primary: true },
  { id: 'bookmark-style', actions: [style], primary: true },
  { id: 'bookmark-layout', actions: [style, tab('视觉与布局')], sliders: 2, primary: true },
  { id: 'bookmark-manage', actions: [style, tab('分类与维护')], primary: true },
  { id: 'bookmark-add', actions: [add], counter: true },
  { id: 'icon-picker', actions: [add, `document.querySelector('svg.lucide-camera')?.closest('button')`], dialogs: 2 },
]

// Canvas 正确解析 Tailwind v4 的 oklch()；对比度使用 WCAG 相对亮度，而非 RGB 均值。
const AUDIT = `(() => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const rgba = (color) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    return [...ctx.getImageData(0, 0, 1, 1).data]
  }
  const luminance = (color) => {
    const rgb = color.slice(0, 3).map(v => {
      const c = v / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
  }
  const composite = (fg, bg) => {
    const a = fg[3] / 255
    return [...fg.slice(0, 3).map((c, i) => c * a + bg[i] * (1 - a)), 255]
  }
  const background = (el) => {
    const layers = []
    for (let p = el; p; p = p.parentElement) layers.push(rgba(getComputedStyle(p).backgroundColor))
    return layers.reverse().reduce((bg, fg) => composite(fg, bg), [255, 255, 255, 255])
  }
  const contrast = (el) => {
    const bg = background(el)
    const fg = composite(rgba(getComputedStyle(el).color), bg)
    const a = luminance(fg), b = luminance(bg)
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  }
  const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
  const panels = [...document.querySelectorAll('.nav-dialog')].filter(visible)
  const panel = panels.at(-1)
  const body = getComputedStyle(document.body)
  const panelStyle = panel && getComputedStyle(panel)
  const r = panel?.getBoundingClientRect()
  const primary = panel && [...panel.querySelectorAll('button')].find(b => b.textContent.trim() === '完成')
  const counter = panel && [...panel.querySelectorAll('span')].find(s => /^\\d+\\/100$/.test(s.textContent.trim()))
  const lowContrastText = panel ? [...panel.querySelectorAll('*')].filter(el =>
    visible(el) && !el.matches('button:disabled, input, select, textarea') &&
    [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) &&
    contrast(el) < 4.5
  ).map(el => ({ text: el.textContent.trim().slice(0, 60), contrast: contrast(el) })) : []
  return {
    rootScheme: getComputedStyle(document.documentElement).colorScheme,
    bodyColor: rgba(body.color), bodyBackground: rgba(body.backgroundColor),
    dialogs: panels.length, panelColor: panelStyle && rgba(panelStyle.color),
    panelBackground: panelStyle && rgba(panelStyle.backgroundColor),
    panelContrast: panel && contrast(panel),
    rect: r && { x: r.x, y: r.y, width: r.width, height: r.height },
    viewport: { width: innerWidth, height: innerHeight },
    primaryColor: primary && rgba(getComputedStyle(primary).backgroundColor),
    counterContrast: counter && contrast(counter),
    sliders: panel ? [...panel.querySelectorAll('input[type=range]')].map(el => {
      const s = getComputedStyle(el)
      return { min: el.min, max: el.max, value: el.value, appearance: s.appearance,
        background: s.backgroundImage, track: s.getPropertyValue('--range-track').trim(),
        trackColor: rgba(s.getPropertyValue('--range-track')),
        fill: s.getPropertyValue('--range-fill').trim(),
        progress: s.getPropertyValue('--range-progress').trim(),
        accessibleName: el.getAttribute('aria-label') }
    }) : [],
    lowContrastText
  }
})()`

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const report = { issue: 22, appUrl: APP_URL, timestamp: new Date().toISOString(), results: [], success: false }
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', windowsHide: true })
  const temp = resolve(tmpdir())
  const browserProfile = mkdtempSync(join(temp, 'nav-light-e2e-'))
  let browser, ws
  try {
    await poll(async () => {
      if (vite.exitCode !== null) throw new Error(`Vite 已退出 (${vite.exitCode})`)
      return (await fetch(APP_URL)).ok
    }, 'Vite')
    assert.equal(vite.exitCode, null, 'Vite 必须由本次测试成功启动')
    browser = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${browserProfile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore', windowsHide: true })
    let target
    await poll(async () => {
      const pages = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()
      target = pages.find(p => p.type === 'page')?.webSocketDebuggerUrl
      return target
    }, 'Edge')
    ws = new WebSocket(target)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    const cdp = new Cdp(ws)
    const evaluate = async expression => {
      const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
      return result.result.value
    }
    const loadPage = async (reload = false) => {
      // Page.reload 返回时旧文档可能还在；不能把旧页面的按钮当成新页面已就绪。
      await evaluate('window.__navThemeTestOldDocument = true')
      await cdp.send(reload ? 'Page.reload' : 'Page.navigate', reload ? {} : { url: APP_URL })
      await poll(() => evaluate(`!window.__navThemeTestOldDocument && document.readyState === 'complete' && Boolean(${settings}) && Boolean(${style})`), '新文档就绪')
    }
    const click = action => poll(() => evaluate(`(() => {
      const el = (${action})
      if (!el) return false
      el.click()
      return true
    })()`), `操作入口：${action}`)
    await cdp.send('Page.enable')
    await cdp.send('Network.enable')
    // 测试主题不依赖互联网图片或天气请求；浏览器使用独立临时 profile。
    await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] })
    for (const width of [1280, 390]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false })
      for (const systemTheme of ['light', 'dark']) {
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: systemTheme }] })
        for (const appTheme of ['light', 'dark']) {
          for (const panel of PANELS) {
            const id = `${width}-${systemTheme}-${appTheme}-${panel.id}`
            const result = { id, width, systemTheme, appTheme, panel: panel.id, pass: false }
            try {
              await loadPage()
              await evaluate(`(async () => {
                const { useNavStore } = await import('/src/store/useNavStore.ts')
                await useNavStore.getState().updateSettings({ themeMode: '${appTheme}', wallpaperUrl: '', avatarUrl: '', dialogCornerRadius: 'lg' })
              })()`)
              await poll(() => evaluate(`document.documentElement.classList.contains('dark') === ${appTheme === 'dark'}`), '应用主题')
              for (const action of panel.actions) {
                await click(action)
                await sleep(100)
              }
              await poll(() => evaluate(`document.querySelectorAll('.nav-dialog').length >= ${panel.dialogs || 1}`), '弹窗')
              await sleep(100)
              result.audit = await evaluate(AUDIT)
              const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
              result.screenshot = join(OUT_DIR, `${id}.png`)
              writeFileSync(result.screenshot, Buffer.from(shot.data, 'base64'))
              const a = result.audit
              const dark = appTheme === 'dark'
              assert.equal(a.rootScheme, appTheme, 'color-scheme 必须跟随应用，而不是系统')
              assert.ok(dark ? a.bodyColor[0] > 180 : a.bodyColor[0] < 80, 'body 前景色')
              assert.ok(dark ? a.bodyBackground[0] < 80 : a.bodyBackground[0] > 230, 'body 背景色')
              assert.ok(dark ? a.panelColor[0] > 180 : a.panelColor[0] < 80, '弹窗继承前景色')
              assert.ok(dark ? a.panelBackground[0] < 80 : a.panelBackground[0] > 230, '弹窗背景色')
              assert.ok(a.panelContrast >= 4.5, '弹窗默认文字对比度至少 4.5:1')
              assert.ok(a.rect.x >= -1 && a.rect.x + a.rect.width <= width + 1, '弹窗不得横向越界')
              assert.ok(a.rect.y >= -1 && a.rect.y + a.rect.height <= a.viewport.height + 1, '弹窗不得纵向越界')
              if (panel.primary) assert.ok(a.primaryColor?.[0] > 180 && a.primaryColor[0] > a.primaryColor[1] * 1.5, '完成按钮统一为橙色')
              if (panel.counter) assert.ok(a.counterContrast >= 4.5, '字数统计对比度至少 4.5:1')
              if (panel.sliders) {
                assert.equal(a.sliders.length, panel.sliders)
                for (const slider of a.sliders) {
                  assert.equal(slider.appearance, 'none', '滑块不依赖原生深色轨道')
                  assert.ok(slider.background.includes('linear-gradient'), '滑块有明确的填充轨道')
                  assert.ok(slider.track && slider.fill && slider.accessibleName, '滑块颜色和无障碍名称')
                  assert.ok(dark ? slider.trackColor[0] < 100 : slider.trackColor[0] > 200, '轨道颜色跟随应用主题')
                  const expected = (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min)) * 100
                  assert.ok(Math.abs(parseFloat(slider.progress) - expected) < .01, '填充比例必须按 min/max 计算')
                }
                // 真实键盘操作，验证受控输入、轨道填充和 IndexedDB 持久化仍能工作。
                const before = Number(a.sliders[0].value)
                await evaluate(`document.querySelector('.nav-dialog input[type=range]').focus()`)
                const key = before === Number(a.sliders[0].max) ? 'ArrowLeft' : 'ArrowRight'
                await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'ArrowRight' ? 39 : 37 })
                await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key })
                await poll(() => evaluate(`Number(document.querySelector('.nav-dialog input[type=range]').value) !== ${before}`), '键盘调整滑块')
                result.afterKeyboard = (await evaluate(AUDIT)).sliders[0]
                const slider = result.afterKeyboard
                assert.ok(Math.abs(parseFloat(slider.progress) - (Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min)) * 100) < .01, '键盘操作后填充同步更新')
                assert.equal(await evaluate(`getComputedStyle(document.querySelector('.nav-dialog input[type=range]')).outlineStyle`), 'solid', '键盘焦点必须可见')
                // 等待实际持久化完成，不靠固定 sleep 猜测 IndexedDB 写入时序。
                await poll(() => evaluate(`(async () => {
                  const { db } = await import('/src/lib/db.ts')
                  const { useNavStore } = await import('/src/store/useNavStore.ts')
                  const records = await db.settings.toArray()
                  return records.some(r => JSON.stringify(r.value) === JSON.stringify(useNavStore.getState().settings))
                })()`), '滑块写入 IndexedDB')
                await loadPage(true)
                for (const action of panel.actions) {
                  await click(action)
                  await sleep(100)
                }
                assert.equal((await evaluate(AUDIT)).sliders[0].value, result.afterKeyboard.value, '滑块值重载后保留')
              }
              result.pass = true
            } catch (error) {
              result.error = error.message
            }
            report.results.push(result)
            console.log(`${result.pass ? 'PASS' : 'FAIL'} ${id}${result.error ? `: ${result.error}` : ''}`)
          }
        }
      }
    }
    report.success = report.results.every(r => r.pass)
    console.log(`${report.results.filter(r => r.pass).length}/${report.results.length} 通过；工件：${OUT_DIR}`)
    if (!report.success) process.exitCode = 1
    await cdp.send('Browser.close').catch(() => {})
  } catch (error) {
    report.error = error.message
    throw error
  } finally {
    writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    ws?.close()
    browser?.kill()
    vite.kill()
    await sleep(500)
    // 只清理本脚本新建的临时 profile，检查绝对路径后才递归删除。
    if (dirname(resolve(browserProfile)) === temp && browserProfile.startsWith(join(temp, 'nav-light-e2e-'))) {
      try { rmSync(browserProfile, { recursive: true, force: true }) } catch { /* Edge 可能尚未释放文件句柄 */ }
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

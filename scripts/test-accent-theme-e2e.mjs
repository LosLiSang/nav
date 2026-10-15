/**
 * 主题强调色端到端测试（Issue #41）
 *
 * 可能失败的方式（先列出再验证）：
 *  1. 默认橙色被新色阶改变，造成无意的视觉回归；
 *  2. 自定义主题色后复选框仍是橙色，或个别复选框（书签私密）显示浏览器默认蓝；
 *  3. 输入框聚焦边框、主按钮、选中态仍写死橙/蓝；
 *  4. 浅色主题色（琥珀黄）上白字不可读；
 *  5. 深色模式下过暗主题色（曜石黑）让复选框/按钮不可见；
 *  6. 语义色（短休绿、危险红）被误改成主题色；
 *  7. 浏览器不支持相对颜色语法导致变量失效（落回透明/黑色）。
 *
 * 用法：npm run check:accent   工件：artifacts/accent-e2e/report.json + 截图
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const APP_PORT = Number(process.env.APP_PORT || 5198)
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const OUT_DIR = process.env.OUT_DIR || join(process.cwd(), 'artifacts', 'accent-e2e')
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const DEBUG_PORT = 9431
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Cdp {
  constructor(ws) {
    this.seq = 0
    this.pending = new Map()
    this.ws = ws
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      const p = this.pending.get(m.id)
      if (!p) return
      this.pending.delete(m.id)
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
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
    try { last = await fn(); if (last) return last } catch (e) { last = e.message }
    await sleep(200)
  }
  throw new Error(`超时: ${label} (last=${JSON.stringify(last)})`)
}

// 页面内工具：把任意 CSS 颜色规范化为 sRGB，并计算对比度。
const PAGE_HELPERS = `(() => {
  const c = document.createElement('canvas'); c.width = c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true })
  window.__rgb = (color) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) }
  const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }
  window.__lum = (rgb) => .2126 * lin(rgb[0]) + .7152 * lin(rgb[1]) + .0722 * lin(rgb[2])
  window.__contrast = (a, b) => { const x = __lum(a), y = __lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
  window.__visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  return true
})()`

const near = (a, b, tol = 6) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol)
const hexRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], { windowsHide: true, stdio: 'ignore' })
  let proc = null, profile = null, ws = null
  const results = []
  const report = { issue: 41, success: false, results, cases: {}, artifacts: [] }
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail })
    console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }
  try {
    await poll(async () => (await fetch(`${APP_URL}/`)).ok, 20000, 'Vite')
    profile = mkdtempSync(join(tmpdir(), 'nav-accent-browser-'))
    proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
      '--no-proxy-server', '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
    const target = await poll(async () => (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json())
      .find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl, 20000, 'devtools')
    ws = new WebSocket(target)
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
    const cdp = new Cdp(ws)
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable')
    // 无头窗口默认没有系统焦点，:focus 样式可能不生效；开启焦点模拟让聚焦样式可测。
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
    await cdp.send('Page.navigate', { url: APP_URL })
    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    }
    await poll(() => evaluate(`Boolean(document.querySelector('#right-workbench') && document.querySelector('main'))`), 20000, 'Page init')
    await sleep(800)
    await evaluate(PAGE_HELPERS)
    const shot = async (name) => {
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
      const file = join(OUT_DIR, `${name}.png`)
      writeFileSync(file, Buffer.from(image.data, 'base64'))
      report.artifacts.push(file)
    }
    const click = async (expression, label) => {
      const ok = await evaluate(`(() => { const el = (${expression}); if (!el) return false; el.scrollIntoView({ block: 'nearest' }); el.click(); return true })()`)
      if (!ok) throw new Error(`没有找到：${label}`)
      await sleep(250)
    }
    const byText = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)} && __visible(b))`
    const setSettings = (patch) => evaluate(`(async () => { const { useNavStore } = await import('/src/store/useNavStore.ts'); useNavStore.getState().updateSettings(${JSON.stringify(patch)}); return true })()`)
    const pressEscape = async () => {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
      await sleep(250)
    }

    /** 收集当前可见的复选框、主按钮（主题色实心背景）与一个输入框的聚焦边框。 */
    const measure = (scopeExpr, inputExpr) => evaluate(`(async () => {
      const scope = ${scopeExpr}
      const boxes = [...scope.querySelectorAll('input[type=checkbox]')].filter(__visible)
        .map(b => ({ label: b.getAttribute('aria-label') || b.closest('label')?.textContent.trim().slice(0, 12) || '?', accent: __rgb(getComputedStyle(b).accentColor) }))
      const buttons = [...scope.querySelectorAll('.bg-orange-500')].filter(el => __visible(el) && el.matches('button, [role=button]'))
        .map(b => { const s = getComputedStyle(b); return { text: b.textContent.trim().slice(0, 12), bg: __rgb(s.backgroundColor), fg: __rgb(s.color) } })
      let focus = null
      const input = ${inputExpr}
      if (input) {
        input.focus()
        // 等焦点稳定、过渡结束后再取色，并确认焦点确实落在该输入框上。
        await new Promise(r => setTimeout(r, 300))
        if (document.activeElement !== input) { input.focus(); await new Promise(r => setTimeout(r, 300)) }
        focus = { border: __rgb(getComputedStyle(input).borderTopColor), focused: document.activeElement === input }
        input.blur()
      }
      return { boxes, buttons, focus }
    })()`)

    // 每种情况期望的「主题色 500」和按钮文字颜色。
    const cases = [
      { name: 'default-orange', color: '#ff6900', theme: 'light', expect500: [255, 105, 0], ink: [255, 255, 255] },
      { name: 'blue', color: '#2563eb', theme: 'light', expect500: hexRgb('#2563eb'), ink: [255, 255, 255] },
      { name: 'amber-light-accent', color: '#f59e0b', theme: 'light', expect500: hexRgb('#f59e0b'), ink: [10, 10, 10] },
      { name: 'black-dark-mode', color: '#171717', theme: 'dark', expect500: null, ink: [255, 255, 255] },
    ]

    for (const c of cases) {
      console.log(`\n--- 主题色 ${c.name} (${c.color}, ${c.theme}) ---`)
      await setSettings({ highlightColor: c.color, themeMode: c.theme })
      await sleep(300)
      const rootState = await evaluate(`({ mode: document.documentElement.dataset.accent, v500: __rgb(getComputedStyle(document.documentElement).getPropertyValue('--color-orange-500')), v600: __rgb(getComputedStyle(document.documentElement).getPropertyValue('--color-orange-600')), v50: __rgb(getComputedStyle(document.documentElement).getPropertyValue('--color-orange-50')) })`)
      const expected500 = c.expect500 ?? rootState.v500
      const pageBg = c.theme === 'dark' ? [10, 10, 10] : [255, 255, 255]
      const groups = {}

      // 1) 搜索设置弹层：2 个复选框
      await click(`[...document.querySelectorAll('section button')].find(b => b.querySelector('svg.lucide-settings'))`, '搜索设置')
      groups.search = await measure(`document.querySelector('section .nav-dialog')`, 'null')
      await click(`[...document.querySelectorAll('section button')].find(b => b.querySelector('svg.lucide-settings'))`, '关闭搜索设置')

      // 2) 专注设置弹窗：提醒复选框 + 时长输入框聚焦
      await click(byText('专注'), '专注标签')
      await click(`document.querySelector('[data-testid="pomodoro-settings-button"]')`, '专注设置')
      groups.pomodoro = await measure(`document.querySelector('[role=dialog]')`, `document.querySelector('[role=dialog] input[type=number], [role=dialog] input[inputmode=numeric]')`)
      await pressEscape()
      if (await evaluate(`Boolean(document.querySelector('[role=dialog]'))`)) await click(byText('完成', `document.querySelector('[role=dialog]')`) + ` || [...document.querySelectorAll('[role=dialog] button')].find(b => b.getAttribute('aria-label')?.includes('关闭'))`, '关闭专注设置')
      // 语义色：短休按钮保持绿色
      await click(`[...document.querySelectorAll('#right-workbench button')].find(b => b.textContent.trim().startsWith('短休'))`, '短休')
      const shortBreak = await evaluate(`__rgb(getComputedStyle([...document.querySelectorAll('#right-workbench button')].find(b => b.textContent.trim().startsWith('短休'))).backgroundColor)`)
      await click(`[...document.querySelectorAll('#right-workbench button')].find(b => b.textContent.trim().startsWith('工作'))`, '工作')

      // 3) 新增书签弹窗：隐私复选框、主按钮、输入框聚焦
      await click(`[...document.querySelectorAll('main button')].find(b => b.textContent.trim() === '添加' && b.style.backgroundColor && __visible(b))`, '添加书签')
      await click(byText('隐私设置'), '隐私设置')
      groups.bookmark = await measure(`document.querySelector('.nav-dialog')`, `[...document.querySelectorAll('.nav-dialog input')].find(i => i.type === 'text' || i.type === 'url' || !i.type)`)
      if (c.name !== 'default-orange') await shot(`${c.name}-bookmark-dialog`)
      await click(`document.querySelector('.nav-dialog button:has(svg.lucide-x)')`, '关闭书签弹窗')

      // 4) 全局设置：天气页输入框聚焦 + 「完成」主按钮
      await click(`[...document.querySelectorAll('header button, button')].find(b => b.textContent.trim() === '设置' && __visible(b))`, '设置')
      await click(byText('天气服务'), '天气服务')
      groups.settings = await measure(`document.querySelector('.nav-dialog')`, `[...document.querySelectorAll('.nav-dialog input')].find(i => (i.type === 'text' || i.type === 'password' || !i.type) && __visible(i))`)
      await click(byText('外观'), '外观')
      await shot(`${c.name}-settings`)
      await click(byText('完成'), '完成')

      const boxes = Object.values(groups).flatMap(g => g.boxes)
      const buttons = Object.values(groups).flatMap(g => g.buttons)
      const focuses = Object.entries(groups).filter(([, g]) => g.focus).map(([k, g]) => ({ group: k, border: g.focus.border }))
      report.cases[c.name] = { color: c.color, theme: c.theme, rootState, groups, shortBreak }

      if (c.name === 'default-orange') check('默认橙色不启用自定义色阶，--color-orange-500 保持 Tailwind 原值', rootState.mode === 'default' && near(rootState.v500, [255, 105, 0], 3), JSON.stringify(rootState))
      else check(`${c.name}：启用自定义色阶，50/500/600 色阶有效（非透明/非黑）`, rootState.mode === 'custom' && __validScale(rootState), JSON.stringify(rootState))
      check(`${c.name}：所有可见复选框（${boxes.length} 个）勾选色 = 主题色`, boxes.length >= 5 && boxes.every(b => near(b.accent, expected500)), JSON.stringify(boxes.filter(b => !near(b.accent, expected500))))
      check(`${c.name}：书签「私密」复选框不再是浏览器默认蓝`, groups.bookmark.boxes.length === 1 && near(groups.bookmark.boxes[0].accent, expected500))
      check(`${c.name}：输入框聚焦边框 = 主题色（${focuses.map(f => f.group).join('/')}）`, focuses.length >= 3 && focuses.every(f => near(f.border, expected500)), JSON.stringify(focuses))
      check(`${c.name}：主按钮（${buttons.length} 个）背景 = 主题色，文字颜色自适应`, buttons.length >= 2 && buttons.every(b => near(b.bg, expected500) && near(b.fg, c.ink, 2)), JSON.stringify(buttons))
      const ratio = await evaluate(`__contrast(${JSON.stringify(expected500)}, ${JSON.stringify(c.ink)})`)
      check(`${c.name}：主按钮文字对比度`, c.ink[0] === 10 ? ratio >= 4.5 : ratio >= 2.8, ratio.toFixed(2))
      check(`${c.name}：语义色不受影响（短休仍为绿色）`, shortBreak[1] > shortBreak[0] + 60 && shortBreak[1] > shortBreak[2], JSON.stringify(shortBreak))
      if (c.theme === 'dark') {
        const bgContrast = await evaluate(`__contrast(${JSON.stringify(expected500)}, ${JSON.stringify(pageBg)})`)
        check(`${c.name}：深色模式下过暗主题色被提亮，与背景对比度 ≥ 3:1`, bgContrast >= 3 && !near(expected500, hexRgb(c.color), 10), `${bgContrast.toFixed(2)} ${JSON.stringify(expected500)}`)
      }
    }
    await setSettings({ highlightColor: '#ff6900', themeMode: 'light' })

    report.success = results.every(r => r.ok)
    if (!report.success) process.exitCode = 1
    console.log(`\n${results.filter(r => r.ok).length}/${results.length} 通过，端到端工件：\n${OUT_DIR}`)
  } catch (error) {
    report.error = error.message
    throw error
  } finally {
    writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    ws?.close()
    proc?.kill()
    if (profile) {
      const target = resolve(profile), temp = resolve(tmpdir())
      if (dirname(target) === temp && target.startsWith(join(temp, 'nav-accent-browser-'))) {
        try { rmSync(target, { recursive: true, force: true }) } catch {}
      }
    }
    vite.kill()
  }
}

function __validScale(s) {
  const sum = (v) => v[0] + v[1] + v[2]
  // 50 应接近白色、600 比 500 更深，且都不是落回的纯黑。
  return sum(s.v50) > 690 && sum(s.v500) > 0 && sum(s.v600) > 0 && sum(s.v600) <= sum(s.v500) + 3
}

main().catch((e) => { console.error('E2E 测试失败:', e); process.exit(1) })

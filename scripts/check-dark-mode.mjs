/**
 * 暗色模式端到端验证：真的在无头浏览器里打开每个弹窗，断言 + 截图。
 *
 * 断言方式：读计算样式（computed style），而不是靠肉眼。
 *  - 弹窗面板背景必须是深色
 *  - 面板内部不允许残留"近白色"背景块（>200,>200,>200）—— 这正是用户报的那个 bug 形态
 *  - 字体预览的文字必须是浅色（曾出现"预览显示深色文字、与卡片实际渲染不一致"的回归）
 * 截图作为人工复核用的工件一并产出。
 *
 * 用法（先在另一个终端把 dev server 跑起来）：
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort
 *   node scripts/check-dark-mode.mjs
 *
 * 环境变量：EDGE_PATH 指定浏览器可执行文件，OUT_DIR 指定截图输出目录，
 *          APP_URL 覆盖被测地址，PROXY 覆盖代理（默认 127.0.0.1:7890，用于加载在线壁纸）。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5199'
const OUT_DIR = process.env.OUT_DIR || join(tmpdir(), 'nav-dark', 'shots')
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PROXY = process.env.PROXY || 'http://127.0.0.1:7890'
const PORT = 9411
const STORE = `await import('/src/store/useNavStore.ts')`

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

/**
 * 注意：Tailwind v4 的计算样式返回 oklch()，而且可能带 none 关键字，
 * 用正则抠数字会解析错。这里统一丢进 canvas 取真实 RGBA 像素来判定。
 */
const AUDIT = `(() => {
  const wraps = document.querySelectorAll('div.fixed.inset-0')
  if (!wraps.length) return { found: false }
  const panel = wraps[wraps.length - 1].firstElementChild
  if (!panel) return { found: false }

  const cv = document.createElement('canvas')
  cv.width = cv.height = 1
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  const measure = (cssColor) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000000'
    ctx.fillStyle = cssColor
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: d[3] }
  }
  const luma = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255

  const panelPx = measure(getComputedStyle(panel).backgroundColor)
  const light = []
  panel.querySelectorAll('*').forEach((el) => {
    const c = measure(getComputedStyle(el).backgroundColor)
    if (c.a < 128) return
    if (c.r > 200 && c.g > 200 && c.b > 200) {
      light.push(
        el.tagName.toLowerCase() + ' :: ' + String(el.className || '') +
          (el.textContent ? ' ::text=' + el.textContent.trim().slice(0, 18) : ''),
      )
    }
  })
  return {
    found: true,
    panelBg: 'rgb(' + panelPx.r + ',' + panelPx.g + ',' + panelPx.b + ')',
    panelText: getComputedStyle(panel).color,
    panelIsDark: luma(panelPx) < 0.35,
    lightCount: light.length,
    lightSamples: light.slice(0, 12),
  }
})()`

const PANELS = [
  {
    id: '1-settings',
    name: '全局设置 - 界面与壁纸 (SettingsPanel)',
    click: `document.querySelector('button[title="全局界面与壁纸设置"]')`,
  },
  {
    id: '1b-settings-sync',
    name: '全局设置 - 云端同步 Tab (SettingsPanel)',
    setup: `document.querySelector('button[title="全局界面与壁纸设置"]')`,
    click: `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('云端同步'))`,
  },
  {
    id: '2-profile',
    name: '个人中心 - 资料 Tab (ProfileModal)',
    click: `document.querySelector('[title="个人中心与数据管理"]')`,
  },
  {
    id: '2b-profile-data',
    name: '个人中心 - 数据备份 Tab (ProfileModal)',
    setup: `document.querySelector('[title="个人中心与数据管理"]')`,
    click: `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('数据备份'))`,
  },
  {
    id: '3-bookmark-style',
    name: '书签样式 - 字体排版 Tab (BookmarkStyleModal)',
    click: `document.querySelector('button[title="书签排版与展示设置"]')`,
    expectPreviewTextLight: true,
  },
  {
    id: '3b-bookmark-style-layout',
    name: '书签样式 - 视觉与布局 Tab (BookmarkStyleModal)',
    setup: `document.querySelector('button[title="书签排版与展示设置"]')`,
    click: `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('视觉与布局'))`,
  },
  {
    id: '3c-bookmark-style-manage',
    name: '书签样式 - 分类与维护 Tab (BookmarkStyleModal)',
    setup: `document.querySelector('button[title="书签排版与展示设置"]')`,
    click: `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('分类与维护'))`,
  },
  {
    id: '4-bookmark-dialog',
    name: '添加书签 (BookmarkDialog)',
    click: `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加')`,
  },
  {
    id: '5-icon-picker',
    name: '图标选择 (IconPickerModal，套在添加书签之上)',
    setup: `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '添加')`,
    click: `document.querySelector('svg.lucide-camera')?.closest('button')`,
    expectWraps: 2,
  },
  {
    id: '6-help-modal',
    name: '帮助详情弹窗 (HelpDetailModal in MainCategoryCard)',
    setup: `document.querySelector('button[title="帮助说明"]')`,
    click: `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('拖放管理'))`,
  },
  {
    id: '7-edit-category',
    name: '编辑分类弹窗 (EditCategoryModal in MainCategoryCard)',
    setup: `(() => { const cat = document.querySelector('button span.rounded-full')?.closest('button'); if (!cat) return null; const r = cat.getBoundingClientRect(); cat.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 10, clientY: r.top + 10 })); return cat })()`,
    click: `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('编辑分类'))`,
  },
  {
    id: '8-confirm-modal',
    name: '删除确认弹窗 (ConfirmModal)',
    setup: `(() => { const item = [...document.querySelectorAll('div.group')].find((d) => d.querySelector('span.truncate')); if (!item) return null; const r = item.getBoundingClientRect(); item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 20, clientY: r.top + 20 })); return item })()`,
    click: `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('删除'))`,
  },
  {
    id: '9-sub-rename',
    name: '二级版块重命名弹窗 (RenameModal in SubCategorySection)',
    setup: `(() => { const btn = [...document.querySelectorAll('#tools-section button')].find((b) => b.querySelector('span')); if (!btn) return null; const r = btn.getBoundingClientRect(); btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 10, clientY: r.top + 10 })); return btn })()`,
    click: `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('重命名'))`,
  },
]

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const profile = mkdtempSync(join(tmpdir(), 'nav-dark-'))
  const proc = spawn(
    EDGE,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
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
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
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
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 900,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  })

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

  const ready = () =>
    evaluate(`Boolean(document.querySelector('button[title="全局界面与壁纸设置"]'))`)
  const setDark = () =>
    evaluate(
      `(async () => { const m = ${STORE}; const s = m.useNavStore.getState(); if (s.settings.themeMode !== 'dark') s.updateSettings({ themeMode: 'dark' }); return m.useNavStore.getState().settings.themeMode })()`,
    )
  const hasDarkRoot = () => evaluate(`Boolean(document.querySelector('.dark'))`)

  await cdp.send('Page.navigate', { url: APP_URL })
  await poll(ready, 25000, 'app ready')
  await setDark()
  await poll(hasDarkRoot, 10000, 'dark class applied')
  console.log(`应用地址: ${APP_URL}`)
  console.log(`暗色根节点: 已应用 (.dark)\n`)

  const results = []
  for (const panel of PANELS) {
    await cdp.send('Page.reload')
    await poll(ready, 25000, `reload ${panel.id}`)
    await sleep(400)
    await setDark()
    await poll(hasDarkRoot, 10000, 'dark class after reload')

    if (panel.setup) {
      const ok = await evaluate(`(() => { const el = (${panel.setup}); if (!el) return false; el.click(); return true })()`)
      if (!ok) throw new Error(`${panel.id}: setup 按钮未找到`)
      await sleep(600)
    }

    const clicked = await evaluate(
      `(() => { const el = (${panel.click}); if (!el) return false; el.click(); return true })()`,
    )
    if (!clicked) throw new Error(`${panel.id}: 触发按钮未找到`)

    await poll(
      () =>
        evaluate(
          `document.querySelectorAll('div.fixed.inset-0').length >= ${panel.expectWraps ?? 1}`,
        ),
      10000,
      `${panel.id} 弹窗出现`,
    )
    await sleep(500)

    const audit = await evaluate(AUDIT)
    let previewLuma = null
    if (panel.expectPreviewTextLight) {
      const preview = await evaluate(`(() => {
        const el = [...document.querySelectorAll('div')].find((d) =>
          d.textContent.trim().startsWith('Aa Bb 1234567890'))
        if (!el) return null
        const cv = document.createElement('canvas')
        cv.width = cv.height = 1
        const ctx = cv.getContext('2d')
        ctx.fillStyle = '#000000'
        ctx.fillStyle = getComputedStyle(el).color
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        return { color: 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')',
                 luma: (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255 }
      })()`)
      previewLuma = preview
    }
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const file = join(OUT_DIR, `${panel.id}.png`)
    writeFileSync(file, Buffer.from(shot.data, 'base64'))

    const previewOk = !panel.expectPreviewTextLight || (previewLuma && previewLuma.luma > 0.6)
    const pass = audit.found && audit.panelIsDark && audit.lightCount === 0 && previewOk
    results.push({ ...panel, audit, file, pass })
    console.log(
      `${pass ? 'PASS' : 'FAIL'}  ${panel.name}\n        面板底色=${audit.panelBg} 文字色=${audit.panelText} 残留浅色块=${audit.lightCount}` +
        (audit.lightCount ? `\n        例: ${audit.lightSamples.join(' | ')}` : '') +
        (panel.expectPreviewTextLight
          ? `\n        字体预览文字色=${previewLuma ? previewLuma.color + ' (亮度 ' + previewLuma.luma.toFixed(2) + ')' : '未找到预览元素'}`
          : ''),
    )
  }

  console.log(`\n截图目录: ${OUT_DIR}`)
  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} 通过`)
  if (failed.length) process.exitCode = 1

  ws.close()
  proc.kill()
  await sleep(300)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
}

main().catch((e) => {
  console.error('验证失败:', e.message)
  process.exitCode = 1
})

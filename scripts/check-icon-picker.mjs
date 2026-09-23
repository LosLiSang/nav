/**
 * 图标选择器端到端验证：真的点一遍「添加书签 → 图标库 → 分类图标 → 选一个 → 保存」，
 * 然后用像素采样证明存下来的图标不是一整块黑。
 *
 * 背景：旧实现把颜色里的 # 预转义成 %23，又对整个 SVG 做 encodeURIComponent，
 * %23 变成 %2523，浏览器解析出非法 fill 回退成黑色，而模板里的 <rect> 铺满全图，
 * 书签上就是一整块纯黑圆角方块。另外旧实现不管点哪个图标，存的都是同一个
 * ★ 占位模板 —— 所以这里同时断言存的是「点的那一个」图标。
 *
 * 用法（先在另一个终端起 dev server）：
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort
 *   node scripts/check-icon-picker.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5199'
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9453
const STORE = `await import('/src/store/useNavStore.ts')`
const TITLE = '__icon_e2e__'

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
      if (m.error) p.reject(new Error(JSON.stringify(m.error)))
      else p.resolve(m.result)
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
  const profile = mkdtempSync(join(tmpdir(), 'nav-icon-'))
  const proc = spawn(
    EDGE,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const results = []
  const check = (name, ok, detail = '') => {
    results.push(ok)
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }

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

  const setInput = (selector, value) =>
    evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)

  try {
    await cdp.send('Page.navigate', { url: APP_URL })
    await poll(
      () =>
        evaluate(
          `(async () => { const m = ${STORE}; return m.useNavStore.getState().ready })()`,
        ),
      25000,
      'app ready',
    )

    // 1. 打开添加书签弹窗
    await evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '添加'); b?.click(); return Boolean(b) })()`,
    )
    await poll(
      () =>
        evaluate(
          `Boolean(document.querySelector('button[title="从图标库选择或自定义图标"]'))`,
        ),
      10000,
      '添加书签弹窗',
    )
    check('添加书签弹窗已打开', true)

    // 2. 打开图标库并切到分类图标
    await evaluate(
      `document.querySelector('button[title="从图标库选择或自定义图标"]')?.click()`,
    )
    await poll(
      () =>
        evaluate(
          `[...document.querySelectorAll('button')].some((b) => b.textContent.trim().startsWith('分类图标'))`,
        ),
      10000,
      '图标选择器',
    )
    await evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('分类图标')); b?.click(); return Boolean(b) })()`,
    )
    check('已切换到分类图标页签', true)

    // 3. 点选「代码」图标
    await evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '代码'); b?.click(); return Boolean(b) })()`,
    )
    await sleep(400)

    // 4. 读回弹窗里图标按钮的 src 并断言
    const src = await evaluate(
      `document.querySelector('button[title="从图标库选择或自定义图标"] img')?.src || ''`,
    )
    // 存储值是百分号编码过的，内容断言要对着解码后的原文做
    const decoded = src ? decodeURIComponent(src) : ''
    check('存的是 data:image/svg+xml 数据图标', src.startsWith('data:image/svg+xml'), src.slice(0, 60) + '…')
    check(
      '图标来自点选的「代码」而非 ★ 占位',
      decoded.includes('data-icon="Code"') && !decoded.includes('<text'),
    )
    check('不再含双重编码 %2523', !src.includes('%2523'))

    // 5. 像素采样：新图标可渲染出内容，旧写法是一整块黑
    const pixels = await evaluate(`(async () => {
      const load = (uri) => new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = uri
      })
      const analyze = async (uri) => {
        const img = await load(uri)
        const cv = document.createElement('canvas')
        cv.width = img.naturalWidth
        cv.height = img.naturalHeight
        const ctx = cv.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data
        let opaque = 0
        let dark = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue
          opaque++
          if (d[i] < 64 && d[i + 1] < 64 && d[i + 2] < 64) dark++
        }
        return { opaque, dark, ratio: opaque ? dark / opaque : -1 }
      }
      // 旧写法还原：# 预转义成 %23 再整体编码
      const oldSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><rect width="48" height="48" rx="12" fill="%23fff" stroke="%23fed7aa" stroke-width="2"/><circle cx="24" cy="24" r="12" fill="%23fff7ed"/><text x="24" y="29" text-anchor="middle" font-size="16" fill="%23ea580c">★</text></svg>'
      const oldUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(oldSvg)
      return { current: await analyze(${JSON.stringify(src)}), old: await analyze(oldUri) }
    })()`)
    check(
      '旧写法确实是全黑（复现用户看到的现象）',
      pixels.old.ratio > 0.9,
      `暗色像素占比 ${pixels.old.ratio.toFixed(2)}`,
    )
    check(
      '新图标不再是全黑',
      pixels.current.ratio >= 0 && pixels.current.ratio < 0.5,
      `暗色像素占比 ${pixels.current.ratio.toFixed(2)}`,
    )

    // 6. 保存书签，验证落库的 iconUrl
    await setInput('input[placeholder="网站名称"]', TITLE)
    await setInput('input[placeholder^="网站地址"]', 'https://example.com/icon-test')
    await evaluate(
      `(() => { const b = [...document.querySelectorAll('button[type="submit"]')].find((x) => x.textContent.trim() === '保存'); b?.click(); return Boolean(b) })()`,
    )
    const saved = await poll(
      () =>
        evaluate(
          `(async () => { const m = ${STORE}; const b = m.useNavStore.getState().bookmarks.find((x) => x.title === ${JSON.stringify(TITLE)}); return b ? b.iconUrl : null })()`,
        ),
      10000,
      '书签落库',
    )
    check(
      '保存后书签携带修复过的图标',
      typeof saved === 'string' &&
        saved.startsWith('data:image/svg+xml') &&
        !saved.includes('%2523') &&
        decodeURIComponent(saved).includes('data-icon="Code"'),
      `iconUrl ${typeof saved === 'string' ? saved.slice(0, 50) + '…' : saved}`,
    )

    const failed = results.filter((r) => !r).length
    console.log(`\n${results.length - failed}/${results.length} 通过`)
    if (failed) process.exitCode = 1
  } finally {
    ws.close()
    proc.kill()
    await sleep(300)
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {}
  }
}

main().catch((e) => {
  console.error('验证失败:', e.message)
  process.exitCode = 1
})

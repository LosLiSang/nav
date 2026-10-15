/**
 * 书签字体（西文 / 中文分开选、字体设计、本机字体）端到端验证。
 *
 * 预先列出的失败方式，每一条对应下面一个 check：
 *  1. 深色模式下原生下拉的 option 仍是浅底浅字（用户报的 bug）
 *  2. 选了中文字体但被西文栈里的 system-ui 抢先渲染汉字 → 拼出的栈里不能有 system-ui
 *  3. 西文 / 中文选择没有同时写进 fontFamily，或书签标题没用上
 *  4. 字体设计点了不生效 / 没有选中态 / 不清掉本机字体输入态
 *  5. 本机字体名没加引号，或在线 CSS 输入框不出现
 *  6. 刷新后选择丢失（IndexedDB 持久化）
 *  7. 字体误作用到全局（body / 设置面板文字）
 *  8. 老用户的旧版 fontFamily 被静默覆盖
 *  0. 新用户进来不是「默认」设计被选中，或者西文 / 中文的高级选项默认就摊开（应该收起）
 * 10. 推荐项又变回中西文混搭（应是单一字体，栈里不重复），或者页面又注册了打包的 Web 字体
 *  9. 打开「应用到全部界面」后，body / portal 弹窗 / 输入框仍是旧字体；等宽元素被误改；关掉后没恢复；刷新后开关丢失
 *
 * 用法（用一个没被 HMR 改过的新 dev server，否则脚本 import 到的 store 和页面不是同一实例）：
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort
 *   npm run check:fonts
 * 产物：OUT_DIR 下的截图 + report.json。
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5199'
const OUT_DIR = process.env.OUT_DIR || join(process.cwd(), 'artifacts', 'bookmark-font')
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9417
const STORE = `await import('/src/store/useNavStore.ts')`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n        ${detail}`}`)
}

// 页面内工具：受控 select / input 赋值、读颜色亮度
const HELPERS = `
window.__setSelect = (label, value) => {
  const el = document.querySelector('select[aria-label="' + label + '"]')
  if (!el) return false
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}
window.__setInput = (label, value) => {
  const el = document.querySelector('input[aria-label="' + label + '"]')
  if (!el) return false
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}
window.__luma = (css) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255
}
window.__bookmarkFont = () => {
  const el = [...document.querySelectorAll('[style*="font-family"]')].find((e) => !e.closest('.nav-dialog'))
  return el ? getComputedStyle(el).fontFamily : null
}
true`

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const profile = mkdtempSync(join(tmpdir(), 'nav-font-'))
  const proc = spawn(
    EDGE,
    ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-extensions', 'about:blank'],
    { stdio: 'ignore' },
  )
  const wsUrl = await poll(
    async () => {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
    },
    20000,
    'devtools',
  )
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', () => rej(new Error('ws error')), { once: true })
  })
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    const p = pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (r.exceptionDetails) throw new Error(`页面异常: ${r.exceptionDetails.exception?.description}`)
    return r.result.value
  }
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    const file = join(OUT_DIR, `${name}.png`)
    writeFileSync(file, Buffer.from(s.data, 'base64'))
    return file
  }
  const settings = () => evaluate(`(async () => { const m = ${STORE}; return m.useNavStore.getState().settings })()`)
  const update = (values) =>
    evaluate(`(async () => { const m = ${STORE}; m.useNavStore.getState().updateSettings(${JSON.stringify(values)}); return true })()`)
  const openBookmarkSettings = async () => {
    await poll(() => evaluate(`Boolean(document.querySelector('button[title="全局界面与壁纸设置"]'))`), 25000, 'app ready')
    await evaluate(HELPERS)
    await evaluate(`document.querySelector('button[title="全局界面与壁纸设置"]').click()`)
    await poll(() => evaluate(`Boolean(document.querySelector('.nav-dialog nav'))`), 10000, '设置面板')
    await evaluate(`[...document.querySelectorAll('.nav-dialog nav button')].find((b) => b.textContent.trim() === '书签').click()`)
    await poll(() => evaluate(`Boolean(document.querySelector('[aria-label="字体设计"]'))`), 10000, '书签页')
    await sleep(300)
  }
  const reload = async () => {
    await send('Page.reload')
    await sleep(800)
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 1100, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: APP_URL })
  await poll(() => evaluate(`Boolean(document.querySelector('button[title="全局界面与壁纸设置"]'))`), 25000, 'app ready')

  // 0. 默认状态
  await openBookmarkSettings()
  const fresh = await evaluate(`({
    checked: [...document.querySelectorAll('[aria-label="字体设计"] [aria-checked="true"]')].map((b) => b.textContent),
    advancedVisible: Boolean(document.querySelector('select[aria-label="书签西文字体"]')),
  })`)
  fresh.settings = await settings().then((x) => ({ fontFamily: x.fontFamily, fontLatin: x.fontLatin, fontCjk: x.fontCjk }))
  check('默认选中「默认」设计且高级选项收起', fresh.checked.length === 1 && fresh.checked[0].startsWith('系统默认') && !fresh.advancedVisible, JSON.stringify(fresh))
  await sleep(400)
  await shot('0-default-light')

  // 10. 推荐项是单一普通字体，不再注册打包的 Web 字体
  const designs = await evaluate(`({
    labels: [...document.querySelectorAll('[aria-label="字体设计"] [role="radio"]')].map((b) => b.textContent.split('The quick')[0]),
    webFaces: [...document.fonts].map((f) => f.family),
  })`)
  check(
    '推荐项为单一普通字体，无打包 Web 字体',
    ['系统默认', '黑体', '宋体', '楷体', '仿宋', '等宽'].every((l) => designs.labels.includes(l)) && designs.webFaces.length === 0,
    JSON.stringify(designs),
  )
  await evaluate(`[...document.querySelectorAll('[aria-label="字体设计"] button')].find((b) => b.textContent.startsWith('宋体')).click()`)
  await sleep(300)
  const song = await settings()
  check('选「宋体」整段只用宋体', song.fontFamily === 'SimSun, "Songti SC", serif', song.fontFamily)
  await shot('0b-design-list')
  await reload()

  // 8. 旧版字体：只有 fontFamily，没有 fontLatin/fontCjk
  const legacy = '"Comic Sans MS", KaiTi, cursive'
  await evaluate(`(async () => { const m = ${STORE}; const s = m.useNavStore.getState().settings; const next = { ...s, fontFamily: ${JSON.stringify(legacy)} }; delete next.fontLatin; delete next.fontCjk; m.useNavStore.setState({ settings: next }); return true })()`)
  await openBookmarkSettings()
  check(
    '旧版 fontFamily 保留并提示',
    (await settings()).fontFamily === legacy &&
      (await evaluate(`document.querySelector('.nav-dialog').textContent.includes('沿用旧版字体设置')`)),
  )

  // 1. 深色模式下拉选项可读
  await update({ themeMode: 'dark' })
  await poll(() => evaluate(`document.documentElement.classList.contains('dark')`), 5000, 'dark')
  const optionAudit = await evaluate(`(() => {
    const opts = [...document.querySelectorAll('.nav-dialog select option, .nav-dialog select optgroup')]
    const bad = opts.filter((o) => { const cs = getComputedStyle(o); return __luma(cs.backgroundColor) > 0.35 || __luma(cs.color) < 0.6 })
    return { total: opts.length, bad: bad.map((o) => o.label || o.textContent).slice(0, 5) }
  })()`)
  check('深色模式下拉选项为深底浅字', optionAudit.total > 10 && optionAudit.bad.length === 0, JSON.stringify(optionAudit))
  await shot('1-dark-bookmark-font')

  // 3 + 2. 分别选西文、中文
  await evaluate(`__setSelect('书签西文字体', 'Georgia')`)
  await sleep(150)
  await evaluate(`__setSelect('书签中文字体', 'KaiTi, STKaiti, "Kaiti SC"')`)
  await sleep(300)
  let s = await settings()
  check('西文 / 中文写入设置', s.fontLatin === 'Georgia' && s.fontCjk === 'KaiTi, STKaiti, "Kaiti SC"', JSON.stringify(s.fontFamily))
  check('拼出的字体栈：西文在前、中文在后、衬线兜底', /^Georgia, KaiTi, STKaiti, "Kaiti SC", serif$/.test(s.fontFamily), s.fontFamily)
  check('字体栈里没有 system-ui（否则汉字不走中文字体）', !s.fontFamily.includes('system-ui'), s.fontFamily)
  const bmFont = await evaluate(`__bookmarkFont()`)
  check('书签标题使用新字体栈', bmFont && bmFont.startsWith('Georgia') && bmFont.includes('KaiTi'), String(bmFont))

  // 7. 不影响全局
  const scope = await evaluate(`({ body: getComputedStyle(document.body).fontFamily, dialog: getComputedStyle(document.querySelector('.nav-dialog')).fontFamily })`)
  check('字体不作用于 body 和设置面板', !scope.body.includes('Georgia') && !scope.dialog.includes('Georgia'), JSON.stringify(scope))

  // 5. 本机字体
  await evaluate(`__setSelect('书签中文字体', '__local__')`)
  await sleep(200)
  await evaluate(`__setInput('书签中文字体（本机字体名）', 'LXGW WenKai')`)
  await sleep(300)
  s = await settings()
  check('本机字体名加引号写入中文栈', s.fontCjk === '"LXGW WenKai"' && s.fontFamily.startsWith('Georgia, "LXGW WenKai"'), s.fontFamily)
  check(
    '使用本机字体时出现在线字体 CSS 输入',
    await evaluate(`Boolean(document.querySelector('input[aria-label="Web 字体 CSS 链接"]'))`),
  )
  await shot('2-local-font')

  // 6. 刷新后保留
  await reload()
  await openBookmarkSettings()
  const restored = await evaluate(`({
    latin: document.querySelector('select[aria-label="书签西文字体"]').value,
    cjk: document.querySelector('select[aria-label="书签中文字体"]').value,
    local: document.querySelector('input[aria-label="书签中文字体（本机字体名）"]')?.value,
  })`)
  check('刷新后选择保留（含本机字体）', restored.latin === 'Georgia' && restored.cjk === '__local__' && restored.local === 'LXGW WenKai', JSON.stringify(restored))

  // 4. 字体设计
  await evaluate(`[...document.querySelectorAll('[aria-label="字体设计"] button')].find((b) => b.textContent.includes('等宽')).click()`)
  await sleep(300)
  s = await settings()
  const pairing = await evaluate(`({
    checked: [...document.querySelectorAll('[aria-label="字体设计"] [aria-checked="true"]')].map((b) => b.textContent),
    localInput: Boolean(document.querySelector('input[aria-label="书签中文字体（本机字体名）"]')),
    cjk: document.querySelector('select[aria-label="书签中文字体"]').value,
  })`)
  check('字体设计写入并以等宽兜底', s.fontLatin.startsWith('Consolas') && s.fontCjk.includes('Microsoft YaHei') && s.fontFamily.endsWith('monospace'), s.fontFamily)
  check('字体设计有唯一选中态，并清掉本机字体输入', pairing.checked.length === 1 && pairing.checked[0].includes('等宽') && !pairing.localInput && pairing.cjk === s.fontCjk, JSON.stringify(pairing))
  await shot('3-design-dark')

  // 9. 应用到全部界面
  const globalProbe = `(() => {
    const mono = document.querySelector('.font-mono')
    return {
      body: getComputedStyle(document.body).fontFamily,
      dialog: getComputedStyle(document.querySelector('.nav-dialog')).fontFamily,
      input: getComputedStyle(document.querySelector('input:not([type])') || document.body).fontFamily,
      mono: mono ? getComputedStyle(mono).fontFamily : null,
    }
  })()`
  await evaluate(`(() => { const el = document.querySelector('input[aria-label="字体应用到全部界面"]'); el.click(); return el.checked })()`)
  await sleep(300)
  s = await settings()
  let g = await evaluate(globalProbe)
  check(
    '开启后 body / 设置弹窗 / 输入框都用新字体',
    s.fontScope === 'global' && [g.body, g.dialog, g.input].every((f) => f.startsWith('Consolas')),
    JSON.stringify(g),
  )
  await update({ fontLatin: 'Georgia', fontCjk: '', fontFamily: 'Georgia, "Songti SC", "Source Han Serif SC", "Noto Serif SC", SimSun, serif' })
  await sleep(300)
  g = await evaluate(globalProbe)
  check('全局模式下等宽元素保持等宽', g.mono === null || !g.mono.startsWith('Georgia'), JSON.stringify(g))
  const stale = await evaluate(`[...document.querySelectorAll('[aria-label="字体设计"] [aria-checked="true"]')].length`)
  check('非推荐组合时没有搭配被选中', stale === 0, String(stale))
  await sleep(400)
  await shot('5-global-font')
  await reload()
  await openBookmarkSettings()
  g = await evaluate(globalProbe)
  check(
    '刷新后全局开关保留',
    g.body.startsWith('Georgia') && (await evaluate(`document.querySelector('input[aria-label="字体应用到全部界面"]').checked`)),
    JSON.stringify(g),
  )
  await evaluate(`document.querySelector('input[aria-label="字体应用到全部界面"]').click()`)
  await sleep(300)
  g = await evaluate(globalProbe)
  check(
    '关闭后界面恢复默认字体、书签仍用自选字体',
    !g.body.startsWith('Georgia') && !g.dialog.startsWith('Georgia') && (await evaluate(`__bookmarkFont()`)).startsWith('Georgia'),
    JSON.stringify(g),
  )

  await update({ themeMode: 'light' })
  await sleep(300)
  await shot('4-design-light')

  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify({ appUrl: APP_URL, at: new Date().toISOString(), results }, null, 2))
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} 通过，产物：${OUT_DIR}`)
  if (failed.length) process.exitCode = 1

  ws.close()
  // Edge 会派生子进程，只杀父进程会留下仍占着调试端口的旧实例，下次运行会连到旧数据
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
  else proc.kill()
  await sleep(300)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
}

main().catch((e) => {
  console.error('验证失败:', e.message)
  process.exitCode = 1
})

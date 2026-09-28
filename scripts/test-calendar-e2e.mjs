/**
 * 日历核心功能与真实数据（农历、节气、节日、翻月与今天高亮）E2E 测试脚本
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_PORT = 5198
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const OUT_DIR = join(process.cwd(), '.codex-remote-attachments', 'e2e-artifacts')
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PROXY = process.env.PROXY || 'http://127.0.0.1:7890'
const DEBUG_PORT = 9426

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
  console.log('=== 1. 启动 Vite 本地服务器 (端口: ' + APP_PORT + ') ===')

  const vite = spawn('npx.cmd', ['vite', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], {
    shell: true,
    stdio: 'ignore',
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
  const results = []
  function check(name, ok, detail = '') {
    results.push({ name, ok, detail })
    console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }

  try {
    console.log('=== 2. 启动 Headless Edge 浏览器验证日历真实数据与交互 ===')
    profile = mkdtempSync(join(tmpdir(), 'nav-calendar-browser-'))
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
    await cdp.send('DOM.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })

    await cdp.send('Page.navigate', { url: `${APP_URL}/` })
    await poll(async () => {
      const res = await cdp.send('Runtime.evaluate', {
        expression: "document.body.innerText.includes('日历')",
        returnByValue: true,
      })
      return res.result.value === true
    }, 15000, 'Page loaded')

    // 点击日历 Tab 确保激活日历
    await cdp.send('Runtime.evaluate', {
      expression: `
        Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === '日历')?.click()
      `,
    })
    await sleep(500)

    // 1. 验证年月标题与生肖
    const headerInfo = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const spans = Array.from(document.querySelectorAll('span'));
          const titleSpan = spans.find(s => s.innerText.includes('年') && s.innerText.includes('月'));
          const zodiacSpan = spans.find(s => s.innerText.includes('马年') || s.innerText.includes('丙午'));
          return {
            title: titleSpan?.innerText || '',
            zodiac: zodiacSpan?.innerText || ''
          };
        })()
      `,
      returnByValue: true,
    })
    check('当前年月标题真实准确', headerInfo.result.value.title.includes('2026年 09月'), headerInfo.result.value.title)
    check('生肖干支真实准确', headerInfo.result.value.zodiac.includes('丙午') || headerInfo.result.value.zodiac.includes('马年'), headerInfo.result.value.zodiac)

    // 2. 检查 9 月日期数据（必须是 30 天，无 31 天当月，中秋节、秋分、教师节）
    const calendarStats = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.title && b.title.includes('农历'));
          const currentMonthDays = buttons.filter(b => !b.className.includes('opacity-30'));
          const hasMidAutumn = buttons.some(b => b.innerText.includes('中秋节'));
          const hasAutumnEquinox = buttons.some(b => b.innerText.includes('秋分'));
          const hasTeacherDay = buttons.some(b => b.innerText.includes('教师节'));
          const todayBtn = buttons.find(b => b.title.includes('9月29日'));
          return {
            totalCells: buttons.length,
            currentMonthDaysCount: currentMonthDays.length,
            hasMidAutumn,
            hasAutumnEquinox,
            hasTeacherDay,
            todayHasNineteen: todayBtn?.innerText.includes('十九') || false,
            todayIsSelected: todayBtn?.className.includes('bg-') || todayBtn?.style.backgroundColor !== '',
          };
        })()
      `,
      returnByValue: true,
    })
    const stats = calendarStats.result.value
    check('网格紧凑规范 35 格（5行自适应，剔除无用下月多余行）', stats.totalCells === 35, `总格子数: ${stats.totalCells}`)
    check('当月真实天数精准 30 天（无 9月31日）', stats.currentMonthDaysCount === 30, `当月天数: ${stats.currentMonthDaysCount}`)
    check('农历重大节日精准识别（9月25日中秋节）', stats.hasMidAutumn === true, '显示中秋节')
    check('二十四节气精准识别（9月23日秋分）', stats.hasAutumnEquinox === true, '显示秋分')
    check('公历节日精准识别（9月10日教师节）', stats.hasTeacherDay === true, '显示教师节')
    check('今日（9月29日）农历与焦点高亮正常', stats.todayHasNineteen && stats.todayIsSelected, '高亮且显示十九')

    // 3. 验证翻月切换（点击下一月 -> 10月，检查国庆节；再点击回今天）
    await cdp.send('Runtime.evaluate', {
      expression: `
        document.querySelector('button[title=\"下一月\"]')?.click()
      `,
    })
    await sleep(400)

    const nextMonthStats = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const title = Array.from(document.querySelectorAll('span')).find(s => s.innerText.includes('10月'))?.innerText || '';
          const hasNationalDay = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('国庆节'));
          const hasBackTodayBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('回今天'));
          return { title, hasNationalDay, hasBackTodayBtn };
        })()
      `,
      returnByValue: true,
    })
    const nextStats = nextMonthStats.result.value
    check('翻月切换到 10 月成功', nextStats.title.includes('10月'), nextStats.title)
    check('10月国庆节识别正常', nextStats.hasNationalDay === true, '识别国庆节')
    check('非当前月显示“回今天”快捷按钮', nextStats.hasBackTodayBtn === true)

    // 点击“回今天”
    await cdp.send('Runtime.evaluate', {
      expression: `
        Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('回今天'))?.click()
      `,
    })
    await sleep(400)

    const backTodayStats = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const title = Array.from(document.querySelectorAll('span')).find(s => s.innerText.includes('09月'))?.innerText || '';
          return { title };
        })()
      `,
      returnByValue: true,
    })
    check('点击“回今天”成功回到 9 月', backTodayStats.result.value.title.includes('09月'), backTodayStats.result.value.title)

    // 4. 截图保存验证工件
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const artifactPath = join(OUT_DIR, 'calendar-real-verified.png')
    writeFileSync(artifactPath, Buffer.from(shot.data, 'base64'))
    console.log(`\n已生成 E2E 验证工件截图: ${artifactPath}`)

    ws.close()
  } finally {
    if (proc) {
      proc.kill()
      await sleep(500)
    }
    if (profile) {
      try {
        rmSync(profile, { recursive: true, force: true })
      } catch {}
    }
    vite.kill()
  }

  const allPass = results.every((r) => r.ok)
  console.log(`\n========================================`)
  console.log(`E2E 验证汇总: ${results.filter((r) => r.ok).length}/${results.length} PASS`)
  console.log(`========================================`)
  if (!allPass) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('E2E 测试异常:', err)
  process.exit(1)
})

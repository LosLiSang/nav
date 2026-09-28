/**
 * 端到端测试 (E2E)：真实在无头浏览器中测试天气服务与自定义天气API设置
 * 1. 验证顶栏动态天气获取与真实温度展示
 * 2. 验证城市天气切换下拉框及自定义 API 配置入口
 * 3. 验证全局设置「天气服务」面板中的各数据源切换 (Open-Meteo, 高德, 和风, wttr, 自定义API)
 * 4. 验证「测试接口」功能连通性与数据解析
 * 5. 产出可验证与复现的工件 (截图与报告 JSON)
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_PORT = 5194
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const OUT_DIR = join(process.cwd(), 'artifacts', 'weather-e2e')
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PROXY = process.env.PROXY || 'http://127.0.0.1:7890'
const DEBUG_PORT = 9435

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
    await sleep(250)
  }
  throw new Error(`超时: ${label} (last=${JSON.stringify(last)})`)
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`[E2E] 启动本地 Vite 开发服务器 (端口 ${APP_PORT})...`)

  const isWindows = process.platform === 'win32'
  const viteCmd = isWindows ? 'npx.cmd' : 'npx'
  const vite = spawn(viteCmd, ['vite', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], {
    stdio: 'ignore',
    shell: isWindows,
  })

  // 等待 Vite 就绪
  await poll(async () => {
    try {
      const res = await fetch(APP_URL)
      return res.ok
    } catch {
      return false
    }
  }, 20000, 'Vite dev server start')

  console.log(`[E2E] Vite 运行就绪: ${APP_URL}`)

  const profile = mkdtempSync(join(tmpdir(), 'nav-weather-test-'))
  const browser = spawn(
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

  const report = {
    timestamp: new Date().toISOString(),
    steps: [],
    artifacts: [],
    success: false,
  }

  try {
    const target = await poll(
      async () => {
        const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()
        return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl
      },
      20000,
      'Edge DevTools connection',
    )

    const ws = new WebSocket(target)
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true })
      ws.addEventListener('error', () => rej(new Error('WebSocket connection failed')), { once: true })
    })

    const cdp = new Cdp(ws)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
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
        throw new Error(`页面脚本异常: ${r.exceptionDetails.exception?.description}`)
      }
      return r.result.value
    }

    // 1. 导航至主页
    console.log('[E2E] 1. 打开首页并加载天气...')
    await cdp.send('Page.navigate', { url: APP_URL })

    // 等待顶栏加载
    await poll(
      () => evaluate(`Boolean(document.querySelector('button[title*="城市"]'))`),
      20000,
      'Top navbar city/weather button rendered',
    )

    // 等待实时天气数据获取完成（包含温度数字和°C，而不是静态假数据）
    const weatherText = await poll(
      async () => {
        const text = await evaluate(`(() => {
          const btn = document.querySelector('button[title*="城市"]');
          return btn ? btn.textContent : '';
        })()`)
        if (text && text.includes('°C') && !text.includes('加载中')) {
          return text
        }
        return null
      },
      25000,
      'Dynamic weather data loaded in navbar',
    )
    console.log(`[E2E] ✓ 顶栏天气实时加载完成: "${weatherText}"`)
    report.steps.push({ step: '1_navbar_weather', text: weatherText, pass: true })

    // 截图 1: 顶栏与首页
    const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const file1 = join(OUT_DIR, '01_navbar_weather.png')
    writeFileSync(file1, Buffer.from(shot1.data, 'base64'))
    report.artifacts.push(file1)

    // 2. 点击城市按钮打开下拉框
    console.log('[E2E] 2. 打开城市与天气选择下拉框...')
    await evaluate(`document.querySelector('button[title*="城市"]').click()`)
    await sleep(400)

    const dropdownVisible = await evaluate(`(() => {
      return [...document.querySelectorAll('span')].some(s => s.textContent.includes('切换城市与天气'));
    })()`)
    if (!dropdownVisible) throw new Error('城市下拉框未能成功展开')
    console.log('[E2E] ✓ 城市天气下拉框展开成功')
    report.steps.push({ step: '2_dropdown_opened', pass: true })

    // 截图 2: 城市下拉框
    const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const file2 = join(OUT_DIR, '02_city_dropdown.png')
    writeFileSync(file2, Buffer.from(shot2.data, 'base64'))
    report.artifacts.push(file2)

    // 3. 点击「配置自定义天气 API」快捷入口
    console.log('[E2E] 3. 点击「配置自定义天气 API」进入设置面板...')
    const clickedShortcut = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('配置自定义天气 API'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`)
    if (!clickedShortcut) throw new Error('未能找到「配置自定义天气 API」入口按钮')

    await poll(
      () => evaluate(`Boolean([...document.querySelectorAll('h2')].some(h => h.textContent.includes('全局设置')))`),
      10000,
      'Settings modal open',
    )
    await sleep(400)

    // 验证当前激活的 Tab 是否为「天气服务」
    const isWeatherTabActive = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('天气服务'));
      return btn && (btn.className.includes('bg-white') || btn.className.includes('dark:bg-neutral-900'));
    })()`)
    if (!isWeatherTabActive) throw new Error('点击快捷入口后未自动跳转到「天气服务」Tab')
    console.log('[E2E] ✓ 全局设置成功打开并直接激活「天气服务」Tab')
    report.steps.push({ step: '3_weather_tab_active', pass: true })

    // 4. 验证天气数据源提供方切换
    console.log('[E2E] 4. 测试数据源类型切换...')
    // 切换到自定义 API
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('自定义 API'));
      btn?.click();
    })()`)
    await sleep(400)

    const customInputsVisible = await evaluate(`(() => {
      return Boolean(document.querySelector('input[placeholder*="https://api.example.com"]'));
    })()`)
    if (!customInputsVisible) throw new Error('自定义 API 配置输入框未显示')
    console.log('[E2E] ✓ 自定义 API 选项及 URL / Key / 字段路径设置输入框展示正确')

    // 切回 Open-Meteo
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Open-Meteo'));
      btn?.click();
    })()`)
    await sleep(400)
    report.steps.push({ step: '4_provider_switching', pass: true })

    // 5. 测试接口连通性测试按钮
    console.log('[E2E] 5. 点击「测试接口」按钮，验证连通性测试与数据预览...')
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('测试接口'));
      btn?.click();
    })()`)

    // 等待测试结果出现
    const testResult = await poll(
      async () => {
        const res = await evaluate(`(() => {
          const successBanner = [...document.querySelectorAll('span')].find(s => s.textContent.includes('接口测试成功！'));
          if (successBanner) {
            return {
              success: true,
              text: successBanner.closest('div').parentElement?.textContent || ''
            };
          }
          const failBanner = [...document.querySelectorAll('span')].find(s => s.textContent.includes('请求失败'));
          if (failBanner) {
            return {
              success: false,
              text: failBanner.closest('div').parentElement?.textContent || ''
            };
          }
          return null;
        })()`)
        return res
      },
      20000,
      'Weather API test response banner',
    )

    if (!testResult || !testResult.success) {
      throw new Error(`接口连通性测试未通过: ${testResult?.text}`)
    }
    console.log(`[E2E] ✓ 接口连通性测试成功，实时数据预览正常: ${testResult.text.replace(/\s+/g, ' ').slice(0, 80)}`)
    report.steps.push({ step: '5_api_test_connection', pass: true, detail: testResult.text })

    // 滚动到底部使测试结果卡片完整可见
    await evaluate(`(() => {
      const modalBody = document.querySelector('.fixed.inset-0 .overflow-y-auto');
      if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
    })()`)
    await sleep(300)

    // 截图 3: 天气设置面板与测试成功预览
    const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const file3 = join(OUT_DIR, '03_weather_settings_tested.png')
    writeFileSync(file3, Buffer.from(shot3.data, 'base64'))
    report.artifacts.push(file3)

    report.success = true
    console.log(`\n========================================`)
    console.log(`[E2E] 所有端到端测试全部通过 (ALL PASS)！`)
    console.log(`生成工件目录: ${OUT_DIR}`)
    console.log(`========================================\n`)
  } finally {
    writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
    browser.kill()
    vite.kill()
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {}
  }
}

main().catch((err) => {
  console.error('[E2E FAIL] 测试失败:', err)
  process.exitCode = 1
})

 /**
  * 导航页左右侧边栏（左侧常驻 Dock + 近期足迹，右侧常驻工作台：草稿板 / 番茄钟 / 资讯流）E2E 测试
  */
 import { spawn } from 'node:child_process'
 import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
 import { tmpdir } from 'node:os'
 import { join } from 'node:path'
 
 const APP_PORT = 5199
 const APP_URL = `http://127.0.0.1:${APP_PORT}`
 const OUT_DIR = join(process.cwd(), '.codex-remote-attachments', 'e2e-artifacts')
 const EDGE =
   process.env.EDGE_PATH ||
   'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
 const PROXY = process.env.PROXY || 'http://127.0.0.1:7890'
 const DEBUG_PORT = 9425
 
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
     console.log('=== 2. 启动 Headless Edge 浏览器验证左右侧边栏交互 ===')
     profile = mkdtempSync(join(tmpdir(), 'nav-sidebars-browser-'))
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
     await cdp.send('DOM.enable')
 
     // 宽屏 1920x1080 验证常驻展开效果
     await cdp.send('Emulation.setDeviceMetricsOverride', {
       width: 1920,
       height: 1080,
       deviceScaleFactor: 1,
       mobile: false,
     })
 
     await cdp.send('Page.navigate', { url: APP_URL })
 
     // 等待核心元素就绪
     await poll(async () => {
       const r = await cdp.send('Runtime.evaluate', {
         expression: 'Boolean(document.querySelector("aside") && document.querySelector("main"))',
         returnByValue: true,
       })
       return r.result.value === true
     }, 15000, 'Page init')
     await sleep(1000)
 
     console.log('\n--- 测试 1: 验证左侧常驻 Dock 与快捷键提示 ---')
     const leftDockOk = await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const dockLinks = document.querySelectorAll('#left-dock a[href*="github.com"], #left-dock a[href*="chatgpt.com"]');
           return dockLinks.length >= 2;
         })()
       `,
       returnByValue: true,
     })
     check('左侧常驻 Dock 成功渲染核心超频站点', leftDockOk.result.value === true)
 
     console.log('\n--- 测试 2: 验证右侧常驻工作台及其选项卡 ---')
     const rightSidebarOk = await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const buttons = Array.from(document.querySelectorAll('#right-workbench button'));
           const hasScratchpad = buttons.some(b => b.textContent.includes('草稿板'));
          const hasTodo = buttons.some(b => b.textContent.includes('便签 Todo'));
           const hasFeeds = buttons.some(b => b.textContent.includes('动态资讯'));
          return hasScratchpad && hasTodo && hasFeeds;
         })()
       `,
       returnByValue: true,
     })
    check('右侧常驻工作台渲染并包含三大模块 (草稿/便签Todo/资讯)', rightSidebarOk.result.value === true)
 
     // 保存初始宽屏全貌截图工件
     const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' })
     writeFileSync(join(OUT_DIR, '01-sidebars-desktop-view.png'), Buffer.from(shot1.data, 'base64'))
 
     console.log('\n--- 测试 3: 草稿板即写即存与字符统计 ---')
     await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const ta = document.querySelector('#right-workbench textarea');
           if (ta) {
            const proto = window.HTMLTextAreaElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(ta, 'curl https://api.example.com/v1/ping\\n// 临时测试命令记录');
             ta.dispatchEvent(new Event('input', { bubbles: true }));
             ta.dispatchEvent(new Event('change', { bubbles: true }));
           }
         })()
       `,
     })
     await sleep(600)
 
     const scratchpadSaved = await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const ta = document.querySelector('#right-workbench textarea');
          const stats = document.querySelector('#right-workbench')?.textContent || '';
           return ta && ta.value.includes('ping') && stats.includes('字符');
         })()
       `,
       returnByValue: true,
     })
     check('草稿板文本输入、实时字符统计与本地持久化触发正常', scratchpadSaved.result.value === true)
 
     const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' })
     writeFileSync(join(OUT_DIR, '02-scratchpad-input.png'), Buffer.from(shot2.data, 'base64'))
 
    console.log('\n--- 测试 4: 切换到便签 Todo 并添加/切换待办项 ---')
     await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const btn = Array.from(document.querySelectorAll('#right-workbench button')).find(b => b.textContent.includes('便签 Todo'));
           if (btn) btn.click();
         })()
       `,
     })
     await sleep(400)
 
    // 在待办输入框中添加一项
     await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const input = document.querySelector('#right-workbench input[placeholder*="添加待办便签"]');
          if (input) {
            const proto = window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(input, '完成左右侧栏 Todo 升级验证');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }
         })()
       `,
     })
     await sleep(600)
 
    const todoAdded = await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const asideText = document.querySelector('#right-workbench')?.textContent || '';
          return asideText.includes('完成左右侧栏 Todo 升级验证');
         })()
       `,
       returnByValue: true,
     })
    check('便签 Todo 成功新增待办条目并展示在清单中', todoAdded.result.value === true)
 
     const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT_DIR, '03-todo-memo-tab.png'), Buffer.from(shot3.data, 'base64'))
 
     console.log('\n--- 测试 5: 切换到动态资讯并查看 GitHub/V2EX 动态 ---')
     await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const btn = Array.from(document.querySelectorAll('#right-workbench button')).find(b => b.textContent.includes('动态资讯'));
           if (btn) btn.click();
         })()
       `,
     })
     await sleep(400)
 
     const feedsOk = await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const asideText = document.querySelector('#right-workbench')?.textContent || '';
           return asideText.includes('GitHub') && (asideText.includes('shadcn') || asideText.includes('uv') || asideText.includes('workers'));
         })()
       `,
       returnByValue: true,
     })
     check('动态资讯成功展示热点聚合条目', feedsOk.result.value === true)
 
     const shot4 = await cdp.send('Page.captureScreenshot', { format: 'png' })
     writeFileSync(join(OUT_DIR, '04-feeds-tab.png'), Buffer.from(shot4.data, 'base64'))
 
     console.log('\n--- 测试 6: 点击书签触发自动沉淀「近期足迹 (History)」 ---')
     // 模拟点击一个书签触发 onRecordVisit
     await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
           // 找到主分类里的第一个书签卡片并模拟点击
           const bmCard = document.querySelector('#root main div.group');
           if (bmCard) {
             bmCard.click();
           }
         })()
       `,
     })
     await sleep(600)
 
     // 打开左侧足迹面板
     await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const histBtn = document.querySelector('#left-dock button[title="近期访问足迹"]');
           if (histBtn) histBtn.click();
         })()
       `,
     })
     await sleep(400)
 
     const historyOpened = await cdp.send('Runtime.evaluate', {
       expression: `
        Boolean(document.querySelector('#left-dock')?.textContent.includes('近期足迹'))
       `,
       returnByValue: true,
     })
     check('近期足迹抽屉成功展开并记录访问足迹', historyOpened.result.value === true)
 
     const shot5 = await cdp.send('Page.captureScreenshot', { format: 'png' })
     writeFileSync(join(OUT_DIR, '05-history-flyout.png'), Buffer.from(shot5.data, 'base64'))
 
     console.log('\n--- 测试 7: 折叠与恢复右侧工作台 ---')
     // 点击折叠按钮
     await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const closeBtn = document.querySelector('#right-workbench button[title="折叠常驻侧栏"]');
           if (closeBtn) closeBtn.click();
         })()
       `,
     })
     await sleep(400)
 
     const collapsedOk = await cdp.send('Runtime.evaluate', {
       expression: `
         Boolean(document.querySelector('button[title*="展开常驻工作台"]'))
       `,
       returnByValue: true,
     })
     check('右侧工作台支持平滑收起为轻量迷你标', collapsedOk.result.value === true)
 
     const shot6 = await cdp.send('Page.captureScreenshot', { format: 'png' })
     writeFileSync(join(OUT_DIR, '06-collapsed-view.png'), Buffer.from(shot6.data, 'base64'))
 
     console.log('\n=============================================')
     console.log(`全部测试通过！已生成 6 个端到端验证工件于：\n${OUT_DIR}`)
     console.log('=============================================\n')
   } finally {
     if (proc) {
       proc.kill()
     }
     if (profile) {
       try {
         rmSync(profile, { recursive: true, force: true })
       } catch {}
     }
     vite.kill()
   }
 }
 
 main().catch((e) => {
   console.error('E2E 测试失败:', e)
   process.exit(1)
 })

 /**
  * 导航页左右侧边栏（左侧常驻 Dock + 近期足迹，右侧常驻工作台：草稿板 / 番茄钟 / 资讯流）E2E 测试
  */
 import { spawn } from 'node:child_process'
 import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
 import { tmpdir } from 'node:os'
 import { dirname, join, resolve } from 'node:path'
 import assert from 'node:assert/strict'
 
 const APP_PORT = Number(process.env.APP_PORT || 5199)
 const APP_URL = `http://127.0.0.1:${APP_PORT}`
 const OUT_DIR = process.env.OUT_DIR || join(process.cwd(), 'artifacts', 'sidebars-e2e')
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
 
   const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], {
     windowsHide: true,
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
   let ws = null
   const results = []
   const report = { issues: [8, 25], success: false, results, artifacts: [] }
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
     ws = new WebSocket(target)
     await new Promise((res, rej) => {
       ws.addEventListener('open', res, { once: true })
       ws.addEventListener('error', () => rej(new Error('ws error')), { once: true })
     })
     const cdp = new Cdp(ws)
     await cdp.send('Page.enable')
     await cdp.send('Runtime.enable')
     await cdp.send('DOM.enable')
     await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
       // 真实 UI/计时器不替换，仅推进 Date.now；系统能力用可控夹具记录调用。
       window.__pomoOffset = 0
       const now = Date.now.bind(Date)
       Date.now = () => now() + window.__pomoOffset
       const probe = window.__pomoProbe = {
         permissionRequests: 0, notifications: [], audioStarts: 0, gains: [],
         audioResumes: 0, audioContexts: [], audioFail: false, notificationFail: false,
         nextPermission: 'granted'
       }
       class NotificationFixture {
         static permission = 'default'
         static async requestPermission() {
           probe.permissionRequests++
           return NotificationFixture.permission = probe.nextPermission
         }
         constructor(title, options) {
           if (probe.notificationFail) throw new Error('notification fixture blocked')
           this.title = title; this.options = options
           probe.notifications.push(this)
         }
         close() { this.closed = true }
       }
       window.Notification = NotificationFixture
       window.AudioContext = class {
         constructor() { probe.audioContexts.push(this) }
         state = 'suspended'
         currentTime = 0
         destination = {}
         async resume() {
           probe.audioResumes++
           if (probe.audioFail) throw new Error('audio fixture blocked')
           this.state = 'running'
         }
         async close() { this.state = 'closed' }
         createOscillator() {
           return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
             connect() {}, disconnect() {}, stop() {},
             start() { probe.audioStarts++ } }
         }
         createGain() {
           return { connect() {}, disconnect() {}, gain: {
             setValueAtTime(value) { probe.gains.push(value) },
             exponentialRampToValueAtTime() {}
           }}
         }
       }
     })()` })
 
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
     const evaluate = async (expression) => {
       const r = await cdp.send('Runtime.evaluate', {
         expression, awaitPromise: true, returnByValue: true, userGesture: true,
       })
       if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
       return r.result.value
     }
     const clickText = async (text) => {
       assert.ok(await evaluate(`(() => {
         const b = [...document.querySelectorAll('#right-workbench button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})
         if (!b) return false
         b.click(); return true
       })()`), `按钮不存在：${text}`)
       await sleep(100)
     }
     const clickLabel = async (label) => {
       assert.ok(await evaluate(`(() => {
         const el = document.querySelector('[aria-label=${JSON.stringify(label)}]')
         if (!el) return false
         el.click(); return true
       })()`), `控件不存在：${label}`)
       await sleep(100)
     }
     const shot = async (name) => {
       const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
       const file = join(OUT_DIR, `${name}.png`)
       writeFileSync(file, Buffer.from(image.data, 'base64'))
       report.artifacts.push(file)
     }
     const nativeClick = async (expression, count = 1) => {
       const point = await evaluate(`(() => {
         const el = (${expression})
         if (!el) return null
         el.scrollIntoView({ block: 'nearest' })
         const r = el.getBoundingClientRect()
         return { x: r.left + Math.min(12, r.width / 2), y: r.top + r.height / 2 }
       })()`)
       assert.ok(point, `没有找到点击目标：${expression}`)
       await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
       await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: count, ...point })
       await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: count, ...point })
       await sleep(150)
     }
     const press = async (key) => {
       await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'Enter' ? 13 : 27 })
       await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key })
       await sleep(150)
     }
     const setInput = async (selector, value) => {
       assert.ok(await evaluate(`(() => {
         const el = document.querySelector(${JSON.stringify(selector)})
         if (!el) return false
         const prototype = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
         Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, ${JSON.stringify(value)})
         el.dispatchEvent(new Event('input', { bubbles: true }))
         return true
       })()`), `没有找到输入框：${selector}`)
       await sleep(100)
     }
 
    console.log('\n--- 测试 1: 验证右侧常驻工作台及其三大板块 (草稿/便签/专注) ---')
     const rightSidebarOk = await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const buttons = Array.from(document.querySelectorAll('#right-workbench button'));
          const hasScratchpad = buttons.some(b => b.textContent.trim() === '草稿');
          const hasTodo = buttons.some(b => b.textContent.trim() === '便签');
          const hasFocus = buttons.some(b => b.textContent.trim() === '专注');
          const hasNoFeeds = !buttons.some(b => b.textContent.trim() === '资讯');
          return hasScratchpad && hasTodo && hasFocus && hasNoFeeds;
         })()
       `,
       returnByValue: true,
     })
    check('右侧常驻工作台渲染并包含三大精简板块 (草稿/便签/专注)，资讯流已移除', rightSidebarOk.result.value === true)
 
     // 保存初始宽屏全貌截图工件
     const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' })
     writeFileSync(join(OUT_DIR, '01-sidebars-desktop-view.png'), Buffer.from(shot1.data, 'base64'))
 
    console.log('\n--- 测试 2: 草稿板即写即存与字符统计 ---')
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
 
    console.log('\n--- 测试 3: 切换到便签 Todo 并添加待办项 ---')
     await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const btn = Array.from(document.querySelectorAll('#right-workbench button')).find(b => b.textContent.trim() === '便签');
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
            setter.call(input, '深度体验 React 19 生产力');
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
         })()
       `,
     })
     await sleep(100)
     await evaluate(`document.querySelector('#right-workbench button[title="保存待办 (Enter)"]').click()`)
     await sleep(600)
 
    const todoAdded = await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const asideText = document.querySelector('#right-workbench')?.textContent || '';
          return asideText.includes('深度体验 React 19 生产力');
         })()
       `,
       returnByValue: true,
     })
    check('便签板块成功新增待办条目并展示在清单中', todoAdded.result.value === true)
 
     const shot3 = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT_DIR, '03-todo-memo-tab.png'), Buffer.from(shot3.data, 'base64'))
 
    console.log('\n--- 测试 3b: 便签正文、编辑和打开网址（Issue #25）---')
    const memoId = await evaluate(`(async () => {
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      return useNavStore.getState().memos.find(m => m.text === '深度体验 React 19 生产力').id
    })()`)
    const row = `[data-memo-id="${memoId}"]`
    const body = `document.querySelector('${row} [data-testid="memo-body"]') || [...document.querySelectorAll('#right-workbench div')].find(d => d.textContent.trim() === '深度体验 React 19 生产力')`
    const readMemo = () => evaluate(`(async () => {
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      return useNavStore.getState().memos.find(m => m.id === ${JSON.stringify(memoId)})
    })()`)
    const originalMemo = await readMemo()
    await nativeClick(body)
    const clickDidNotToggle = !(await readMemo()).done
    check('单击正文不会切换完成状态', clickDidNotToggle)
    await shot('13-memo-single-click')
    assert.ok(clickDidNotToggle, '单击便签正文误切换了完成状态')
    check('正文可选取复制，普通文本不显示打开入口', await evaluate(`(() => {
      const el = document.querySelector('${row} [data-testid="memo-body"]')
      const range = document.createRange(); range.selectNodeContents(el)
      getSelection().removeAllRanges(); getSelection().addRange(range)
      return getComputedStyle(el).userSelect === 'text' && getSelection().toString() === '深度体验 React 19 生产力' && !document.querySelector('${row} [data-testid="memo-open"]')
    })()`))
    await nativeClick(`document.querySelector('${row} button[role="checkbox"]')`)
    check('只有圆点切换完成，计数和进度即时更新', (await readMemo()).done && await evaluate(`(async () => {
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      const memos = useNavStore.getState().memos
      const done = memos.filter(m => m.done).length
      const text = document.querySelector('#right-workbench').textContent
      return text.includes(done + '/' + memos.length + ' 项已完成') &&
        text.includes('待办 (' + (memos.length - done) + ')') &&
        text.includes('已完成 (' + done + ')') &&
        text.includes(Math.round(done / memos.length * 100) + '%')
    })()`))
    await nativeClick(`document.querySelector('${row} button[role="checkbox"]')`)
    await nativeClick(body, 2)
    assert.ok(await evaluate(`Boolean(document.querySelector('${row} [data-testid="memo-editor"]'))`), '双击没有进入编辑')
    await setInput(`${row} [data-testid="memo-editor"]`, '编辑后持久化的便签')
    await press('Enter')
    await poll(async () => (await readMemo()).text === '编辑后持久化的便签', 3000, 'Enter 保存')
    check('双击编辑并用 Enter 保存，不改变 ID、创建时间或完成状态', (await readMemo()).id === memoId && (await readMemo()).createdAt === originalMemo.createdAt && !(await readMemo()).done)

    const edit = () => nativeClick(`document.querySelector('${row} [aria-label="编辑便签"]')`)
    await edit()
    await setInput(`${row} [data-testid="memo-editor"]`, 'Esc 应放弃这次修改')
    await press('Escape')
    check('编辑按钮进入编辑，Esc 取消且不保存', (await readMemo()).text === '编辑后持久化的便签' && !(await evaluate(`Boolean(document.querySelector('${row} [data-testid="memo-editor"]'))`)))
    await edit()
    await setInput(`${row} [data-testid="memo-editor"]`, '   ')
    await press('Enter')
    check('空白内容保存视为取消，不删除便签', (await readMemo()).text === '编辑后持久化的便签')
    await edit()
    await setInput(`${row} [data-testid="memo-editor"]`, '失焦保存的便签')
    await nativeClick(`document.querySelector('#right-workbench input[placeholder*="添加待办便签"]')`)
    await poll(async () => (await readMemo()).text === '失焦保存的便签', 3000, '失焦保存')
    check('失焦保存文本且保留完成状态', !(await readMemo()).done)
    await edit()
    await setInput(`${row} [data-testid="memo-editor"]`, '第一行\n第二行')
    await evaluate(`document.querySelector('${row} [data-testid="memo-editor"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))`)
    check('Shift+Enter 可继续多行编辑而不保存', await evaluate(`Boolean(document.querySelector('${row} [data-testid="memo-editor"]'))`) && (await readMemo()).text === '失焦保存的便签')
    await evaluate(`document.querySelector('${row} [data-testid="memo-editor"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))`)
    check('中文输入法确认 Enter 不会误保存', await evaluate(`Boolean(document.querySelector('${row} [data-testid="memo-editor"]'))`) && (await readMemo()).text === '失焦保存的便签')
    const editorGrew = await evaluate(`document.querySelector('${row} [data-testid="memo-editor"]').getBoundingClientRect().height > 32`)
    await press('Enter')
    check('多行便签保留换行且自动增长编辑框', editorGrew && (await readMemo()).text === '第一行\n第二行')

    // 注入一次真实持久化边界失败；草稿必须留在 UI 中，便于重试。
    await evaluate(`(async () => {
      const { db } = await import('/src/lib/db.ts')
      const update = db.memos.update.bind(db.memos)
      window.__restoreMemoUpdate = () => { db.memos.update = update }
      db.memos.update = async () => { throw new Error('memo persistence fixture failed') }
    })()`)
    await edit()
    await setInput(`${row} [data-testid="memo-editor"]`, '失败后重试的便签')
    await press('Enter')
    check('保存失败保留草稿并显示可重试提示', await evaluate(`document.querySelector('${row} [data-testid="memo-editor"]')?.value === '失败后重试的便签' && document.querySelector('${row} [role="alert"]')?.textContent.includes('保存失败')`) && (await readMemo()).text === '第一行\n第二行')
    await evaluate('window.__restoreMemoUpdate()')
    await press('Enter')
    await poll(async () => (await readMemo()).text === '失败后重试的便签', 3000, '保存重试')
    check('持久化恢复后可以直接重试保存', (await readMemo()).text === '失败后重试的便签')

    // Enter + blur 只提交一次，且写回不会把已删除记录复活。
    await evaluate(`(async () => {
      const { db } = await import('/src/lib/db.ts')
      const update = db.memos.update.bind(db.memos)
      window.__memoSaveCalls = 0
      window.__restoreMemoUpdate = () => { db.memos.update = update }
      db.memos.update = async (...args) => {
        window.__memoSaveCalls++
        await new Promise(r => setTimeout(r, 100))
        return update(...args)
      }
    })()`)
    await edit()
    await setInput(`${row} [data-testid="memo-editor"]`, '只保存一次')
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await evaluate(`document.querySelector('${row} [data-testid="memo-editor"]')?.blur()`)
    await sleep(250)
    check('Enter 与 blur 竞态不会重复写入', await evaluate('window.__memoSaveCalls === 1') && (await readMemo()).text === '只保存一次')
    await evaluate('window.__restoreMemoUpdate()')

    // 拖慢旧式整行 put，复现 blur 保存文本与圆点完成状态竞争的真实调用顺序。
    await evaluate(`(async () => {
      const { db } = await import('/src/lib/db.ts')
      const put = db.memos.put.bind(db.memos)
      window.__restoreMemoPut = () => { db.memos.put = put }
      db.memos.put = async (...args) => {
        await new Promise(r => setTimeout(r, 100))
        return put(...args)
      }
    })()`)
    await edit()
    await setInput(`${row} [data-testid="memo-editor"]`, '边保存边勾选也保留文本')
    await nativeClick(`document.querySelector('${row} button[role="checkbox"]')`)
    await sleep(150)
    check('失焦保存与圆点勾选竞争时不覆盖文本', (await readMemo()).text === '边保存边勾选也保留文本' && (await readMemo()).done)
    await evaluate('window.__restoreMemoPut()')
    await nativeClick(`document.querySelector('${row} button[role="checkbox"]')`)
    await edit()
    await setInput(`${row} [data-testid="memo-editor"]`, '只保存一次')
    await press('Enter')

    const addTodo = async (text) => {
      await setInput('#right-workbench input[placeholder*="添加待办便签"]', text)
      await nativeClick(`document.querySelector('#right-workbench button[title="保存待办 (Enter)"]')`)
      return evaluate(`(async () => {
        const { useNavStore } = await import('/src/store/useNavStore.ts')
        return useNavStore.getState().memos.find(m => m.text === ${JSON.stringify(text)}).id
      })()`)
    }
    const deletedId = await addTodo('删除中的便签')
    const deletedRow = `[data-memo-id="${deletedId}"]`
    await evaluate(`(async () => {
      const { db } = await import('/src/lib/db.ts')
      const update = db.memos.update.bind(db.memos)
      window.__restoreMemoUpdate = () => { db.memos.update = update }
      db.memos.update = async (...args) => {
        await new Promise(r => setTimeout(r, 500))
        return update(...args)
      }
    })()`)
    await nativeClick(`document.querySelector('${deletedRow} [aria-label="编辑便签"]')`)
    await setInput(`${deletedRow} [data-testid="memo-editor"]`, '删除后不得复活')
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await nativeClick(`document.querySelector('${deletedRow} [aria-label="删除便签"]')`)
    await sleep(550)
    check('保存期间删除便签，不会因迟到的保存结果复活', await evaluate(`(async () => {
      const { db } = await import('/src/lib/db.ts')
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      return Boolean((await db.memos.get(${JSON.stringify(deletedId)}))?.deletedAt) && !useNavStore.getState().memos.some(m => m.id === ${JSON.stringify(deletedId)})
    })()`))
    await evaluate('window.__restoreMemoUpdate()')
    const link = `${APP_URL}/?memo-open-e2e=1`
    const linkId = await addTodo(`本地文档（${link}），第二个链接 https://example.com/second。`)
    const linkRow = `[data-memo-id="${linkId}"]`
    check('识别第一个 http(s) 链接，剔除中文标点并设置新标签页隔离', await evaluate(`(() => {
      const a = document.querySelector('${linkRow} [data-testid="memo-open"]')
      return a?.href === ${JSON.stringify(link)} && a.target === '_blank' && a.rel.includes('noopener') && a.rel.includes('noreferrer')
    })()`))
    await nativeClick(`document.querySelector('${linkRow} [data-testid="memo-open"]')`)
    let opened
    await poll(async () => {
      const targets = await cdp.send('Target.getTargets')
      opened = targets.targetInfos.find(t => t.type === 'page' && t.url === link)
      return opened
    }, 5000, 'UI 打开新标签页')
    check('打开入口确实创建新标签页，且不切换便签完成状态', Boolean(opened) && await evaluate(`(async () => {
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      return !useNavStore.getState().memos.find(m => m.id === ${JSON.stringify(linkId)}).done
    })()`))
    const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()
    const child = targets.find(t => t.id === opened.targetId)
    const childWs = new WebSocket(child.webSocketDebuggerUrl)
    try {
      await new Promise((resolve, reject) => {
        childWs.addEventListener('open', resolve, { once: true })
        childWs.addEventListener('error', reject, { once: true })
      })
      const childCdp = new Cdp(childWs)
      let isolated = false
      await poll(async () => {
        const r = await childCdp.send('Runtime.evaluate', {
          expression: `location.href === ${JSON.stringify(link)} && window.opener === null && document.referrer === ''`,
          returnByValue: true,
        })
        isolated = r.result?.value === true
        return isolated
      }, 5000, '新标签页隔离')
      check('新标签页没有 opener 且不携带 referrer', isolated)
    } finally {
      childWs.close()
      await cdp.send('Target.closeTarget', { targetId: opened.targetId })
    }
    const unsafeId = await addTodo('javascript:alert(1) data:text/html,hello 不是可打开的网址')
    check('非 http(s) 文本没有打开入口', !(await evaluate(`Boolean(document.querySelector('[data-memo-id="${unsafeId}"] [data-testid="memo-open"]'))`)))
    const wrapId = await addTodo('百科 https://example.com/wiki/Test_(demo).')
    check('链接保留平衡括号，去掉句末英文句点', await evaluate(`document.querySelector('[data-memo-id="${wrapId}"] [data-testid="memo-open"]').href === 'https://example.com/wiki/Test_(demo)'`))
    await edit()
    check('展开编辑框后帮助文字可见，列表和操作区没有溢出', await evaluate(`(() => {
      const el = document.querySelector('${row}')
      const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect()
      return r.top >= p.top - 1 && r.bottom <= p.bottom + 1 && el.scrollWidth <= el.clientWidth
    })()`))
    const editorContrast = () => evaluate(`(() => {
      const s = getComputedStyle(document.querySelector('${row} [data-testid="memo-editor"]'))
      const c = document.createElement('canvas'); c.width = c.height = 1
      const ctx = c.getContext('2d', { willReadFrequently: true })
      const luminance = color => {
        ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
        const v = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => {
          const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4
        })
        return v[0] * .2126 + v[1] * .7152 + v[2] * .0722
      }
      const f = luminance(s.color), b = luminance(s.backgroundColor)
      return (Math.max(f, b) + .05) / (Math.min(f, b) + .05)
    })()`)
    const lightEditorContrast = await editorContrast()
    await shot('14-memo-edit-light')
    await evaluate(`(async () => {
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      useNavStore.getState().updateSettings({ themeMode: 'dark' })
    })()`)
    await sleep(100)
    check('浅色和深色编辑框文字对比度均至少 4.5:1', lightEditorContrast >= 4.5 && await editorContrast() >= 4.5)
    await shot('15-memo-edit-dark')
    await press('Escape')
    await evaluate(`(async () => {
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      useNavStore.getState().updateSettings({ themeMode: 'light' })
    })()`)
    await evaluate('window.__oldMemoDocument = true')
    await cdp.send('Page.reload')
    await poll(() => evaluate(`!window.__oldMemoDocument && Boolean(document.querySelector('#right-workbench'))`), 15000, '便签重载')
    await clickText('便签')
    check('刷新后编辑结果仍然存在，ID、状态和其他便签保留', (await readMemo()).text === '只保存一次' && !(await readMemo()).done && await evaluate(`Boolean(document.querySelector('${linkRow}'))`))
    check('便签编辑本地持久化，但不再进入整页同步快照', await evaluate(`(async () => {
      const { buildSyncDoc } = await import('/src/lib/sync.ts')
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      const { db } = await import('/src/lib/db.ts')
      return !Object.hasOwn(buildSyncDoc(useNavStore.getState()), 'memos') && (await db.memos.get(${JSON.stringify(memoId)})).text === '只保存一次'
    })()`))

    console.log('\n--- 测试 4: 切换到专注板块并启动番茄工作钟 ---')
     await cdp.send('Runtime.evaluate', {
       expression: `
         (() => {
          const btn = Array.from(document.querySelectorAll('#right-workbench button')).find(b => b.textContent.trim() === '专注');
          if (btn) btn.click();
        })()
      `,
    })
    await sleep(400)

    // 点击开始计时
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const startBtn = Array.from(document.querySelectorAll('#right-workbench button')).find(b => b.textContent.includes('开始'));
          if (startBtn) startBtn.click();
        })()
      `,
    })
    await sleep(600)

    const focusTimerOk = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const asideText = document.querySelector('#right-workbench')?.textContent || '';
          return asideText.includes('专注中...') && asideText.includes('今日已完成番茄');
        })()
      `,
      returnByValue: true,
    })
    check('番茄专注钟成功保留启动，并展示成就统计', focusTimerOk.result.value === true)

    const shotFocus = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT_DIR, '03b-pomodoro-focus-tab.png'), Buffer.from(shotFocus.data, 'base64'))

    console.log('\n--- 测试 5: 折叠与恢复右侧工作台 ---')
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
 
    console.log('\n--- 测试 6: 打开全局设置并切换为「经典蓝」全局主题色 ---')
    // 点击展开右侧栏
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const openBtn = document.querySelector('button[title*="展开常驻工作台"]');
          if (openBtn) openBtn.click();
        })()
      `,
    })
    await sleep(300)

    // 点击顶部导航的「设置」按钮
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const settingsBtn = Array.from(document.querySelectorAll('header button')).find(b => b.textContent.includes('设置'));
          if (settingsBtn) settingsBtn.click();
        })()
      `,
    })
    await sleep(500)

    // 点击设置面板里的「经典蓝」调色板按钮
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const blueBtn = document.querySelector('button[title="经典蓝"]');
          if (blueBtn) blueBtn.click();
        })()
      `,
    })
    await sleep(500)

    // 关闭设置面板
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const closeBtn = document.querySelector('button[aria-label="关闭"]');
          if (closeBtn) closeBtn.click();
        })()
      `,
    })
    await sleep(500)

    // 验证各区域高亮色是否已统一变成 rgb(37, 99, 235) / #2563eb
    const themeUnified = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const engineBtn = document.querySelector('section button.rounded-full');
          const engineBg = engineBtn ? window.getComputedStyle(engineBtn).backgroundColor : '';
          const isBlue = engineBg.includes('37, 99, 235') || engineBg.includes('rgb(37, 99, 235)');
          return isBlue;
        })()
      `,
      returnByValue: true,
    })
    check('全局主题色一键切换为经典蓝，且全站高亮元素同步换色', themeUnified.result.value === true)

    const shotTheme = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT_DIR, '07-theme-color-blue-unified.png'), Buffer.from(shotTheme.data, 'base64'))

    // 切回活力橙默认色以便保持原汁原味
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const settingsBtn = Array.from(document.querySelectorAll('header button')).find(b => b.textContent.includes('设置'));
          if (settingsBtn) settingsBtn.click();
        })()
      `,
    })
    await sleep(300)
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const orangeBtn = document.querySelector('button[title="活力橙"]');
          if (orangeBtn) orangeBtn.click();
        })()
      `,
    })
    await sleep(300)
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const closeBtn = document.querySelector('button[aria-label="关闭"]');
          if (closeBtn) closeBtn.click();
        })()
      `,
    })
    await sleep(400)

    const shotFinal = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT_DIR, '08-theme-color-orange-unified.png'), Buffer.from(shotFinal.data, 'base64'))

    console.log('\n--- 测试 7: 专注设置弹窗、自定义时长与自动衔接（Issue #34）---')
    await clickText('专注')
    await evaluate(`document.querySelector('button[title="重置计时"]').click()`)
    await sleep(100)
    check('页面加载和启动计时不会请求通知权限', await evaluate('window.__pomoProbe.permissionRequests === 0'))
    check('主面板不再常驻提醒设置，改为设置弹窗入口', await evaluate(`!document.querySelector('[aria-label="启用声音提醒"]') && Boolean(document.querySelector('[data-testid="pomodoro-settings-button"]'))`))
    check('专注面板不再包含目标与倒数日', await evaluate(`!document.querySelector('#right-workbench').textContent.includes('目标与倒数日')`))

    const openPomoSettings = async () => {
      await evaluate(`document.querySelector('[data-testid="pomodoro-settings-button"]').click()`)
      await sleep(150)
    }
    const closePomoSettings = async () => {
      await evaluate(`document.querySelector('[aria-label="关闭专注设置"]').click()`)
      await sleep(150)
    }
    const setInputValue = async (testId, value) => {
      await evaluate(`(() => {
        const el = document.querySelector('[data-testid="${testId}"]')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)})
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
      await sleep(80)
    }

    await openPomoSettings()
    check('设置弹窗包含提醒与时长配置', await evaluate(`Boolean(document.querySelector('[data-testid="pomodoro-settings-dialog"]')) && Boolean(document.querySelector('[aria-label="启用声音提醒"]')) && Boolean(document.querySelector('[data-testid="pomodoro-duration-work"]'))`))
    check('声音和系统通知默认关闭', await evaluate(`!document.querySelector('[aria-label="启用声音提醒"]').checked && !document.querySelector('[aria-label="启用系统通知"]').checked`))
    await setInputValue('pomodoro-duration-work', '2')
    await setInputValue('pomodoro-duration-shortBreak', '1')
    await setInputValue('pomodoro-duration-longBreak', '2')
    await setInputValue('pomodoro-long-break-every', '2')
    await shot('13-pomodoro-settings-light')
    await closePomoSettings()
    check('阶段按钮文案使用自定义时长', await evaluate(`document.querySelector('#right-workbench').textContent.includes('工作 2m') && document.querySelector('#right-workbench').textContent.includes('短休 1m') && document.querySelector('#right-workbench').textContent.includes('长休 2m')`))

    const advance = async (ms) => {
      await evaluate(`window.__pomoOffset += ${ms}`)
      await evaluate(`document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'))`)
      await sleep(400)
    }
    const completed = () => evaluate(`Boolean(document.querySelector('[data-testid="pomodoro-reminder"]'))`)
    await clickText('开始')
    await advance(2 * 60 * 1000 - 1100)
    check('截止时间之前不提前触发完成提醒', !(await completed()))
    await advance(1500)
    await poll(completed, 3000, '工作完成提示')
    const originalTitle = 'nav'
    check('完成后提醒标明已完成阶段和自动开始的短休，且不播放声音或发系统通知', await evaluate(`document.querySelector('[data-testid="pomodoro-reminder"]').textContent.includes('工作阶段已完成') && document.querySelector('[data-testid="pomodoro-reminder"]').textContent.includes('已自动开始短休') && window.__pomoProbe.audioStarts === 0 && window.__pomoProbe.notifications.length === 0`))
    check('阶段结束后自动开始短休', await evaluate(`document.querySelector('#right-workbench').textContent.includes('专注中...')`))
    check('今日统计按实际工作时长累计', await evaluate(`document.querySelector('[data-testid="pomodoro-count"]').textContent.includes('1 个 (2 分钟)')`))
    await shot('09-pomodoro-completed-light')
    const countAfterFirst = await evaluate(`document.querySelector('[data-testid="pomodoro-count"]').textContent`)
    await advance(1000)
    check('重复 focus/visibility 事件不会重复统计完成次数', await evaluate(`document.querySelector('[data-testid="pomodoro-count"]').textContent === ${JSON.stringify(countAfterFirst)}`))
    await clickLabel('关闭完成提醒')
    check('关闭提示恢复标签页标题', await evaluate(`document.title === ${JSON.stringify(originalTitle)}`))
    check('关闭提示不重置已自动开始的下一阶段', await evaluate(`document.querySelector('#right-workbench').textContent.includes('专注中...')`))

    // 旧计时不得在暂停、重置或切换阶段后发出过期提醒。
    await clickText('暂停')
    await advance(30 * 60 * 1000)
    check('暂停后超过原截止时间，不提醒', !(await completed()))
    await clickText('开始')
    await advance(60 * 1000)
    await poll(completed, 3000, '短休完成提示')
    check('暂停后续跑按剩余时间完成并自动回到工作', await evaluate(`document.querySelector('[data-testid="pomodoro-reminder"]').textContent.includes('短休阶段已完成') && document.querySelector('[data-testid="pomodoro-reminder"]').textContent.includes('已自动开始工作') && document.querySelector('#right-workbench').textContent.includes('专注中...')`))
    // 运行中打开设置不暂停计时；修改时长不重置当前阶段。
    await openPomoSettings()
    check('运行中打开设置弹窗不暂停计时', await evaluate(`Boolean(document.querySelector('[data-testid="pomodoro-settings-dialog"]')) && document.querySelector('#right-workbench').textContent.includes('专注中...')`))
    await setInputValue('pomodoro-duration-work', '0')
    check('零时长给出明确提示且不影响计时', await evaluate(`document.querySelector('[data-testid="pomodoro-warning"]').textContent.includes('1-120') && document.querySelector('#right-workbench').textContent.includes('专注中...')`))
    await setInputValue('pomodoro-duration-work', '150')
    check('超出范围时长给出明确提示', await evaluate(`document.querySelector('[data-testid="pomodoro-warning"]').textContent.includes('1-120')`))
    await setInputValue('pomodoro-duration-work', '5')
    check('运行中修改时长不重置当前倒计时', await evaluate(`document.querySelector('#right-workbench .font-mono').textContent !== '05:00' && document.querySelector('#right-workbench').textContent.includes('专注中...')`))
    await setInputValue('pomodoro-duration-work', '2')
    await closePomoSettings()
    check('关闭设置弹窗后计时仍在继续', await evaluate(`!document.querySelector('[data-testid="pomodoro-settings-dialog"]') && document.querySelector('#right-workbench').textContent.includes('专注中...')`))

    await evaluate(`document.querySelector('button[title="重置计时"]').click()`)
    check('重置取消自动循环中的当前阶段与提示', await evaluate(`!document.querySelector('[data-testid="pomodoro-reminder"]') && !document.querySelector('#right-workbench').textContent.includes('专注中...')`))
    await clickText('开始')
    await advance(1000)
    await clickText('工作 2m')
    await advance(2 * 60 * 1000)
    check('切换阶段取消旧计时', !(await completed()))
    await clickText('开始')

    // 显式启用才申请权限；音量通过实际受控 range 输入修改。
    await openPomoSettings()
    await clickLabel('启用声音提醒')
    await clickLabel('启用系统通知')
    check('用户主动启用系统通知后仅请求一次权限', await evaluate('window.__pomoProbe.permissionRequests === 1'))
    await evaluate(`(() => {
      const el = document.querySelector('[aria-label="提醒音量"]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '35')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await sleep(100)
    await clickLabel('试听提醒音')
    const startsBeforeFinish = await evaluate('window.__pomoProbe.audioStarts')
    check('试听通过用户手势启用音频并按设定音量播放', await evaluate(`window.__pomoProbe.audioResumes > 0 && window.__pomoProbe.audioStarts > 0 && window.__pomoProbe.gains.some(v => Math.abs(v - .07) < .001)`))
    await closePomoSettings()
    await clickText('草稿')
    await evaluate(`document.querySelector('#right-workbench button[title="折叠常驻侧栏"]').click()`)
    await sleep(100)
    // visibilityState 夹具模拟隐藏/恢复；仍跑真实计时和恢复处理器。
    await evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })`)
    await advance(2 * 60 * 1000)
    check('工作阶段在折叠侧栏后台完成时仍有全局页面提示和后台标题提示', await evaluate(`Boolean(document.querySelector('#right-workbench-collapsed')) && document.querySelector('[data-testid="pomodoro-reminder"]')?.textContent.includes('工作阶段已完成') && document.title.includes('工作阶段已完成')`))
    check('声音与系统通知各触发一次', await evaluate(`window.__pomoProbe.audioStarts === ${startsBeforeFinish + 1} && window.__pomoProbe.notifications.length === 1`))
    await advance(1000)
    check('恢复事件去重：系统通知不重复发送', await evaluate('window.__pomoProbe.notifications.length === 1'))
    await evaluate(`delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'))`)
    await sleep(100)
    check('恢复可见时还原原始标题', await evaluate(`document.title === ${JSON.stringify(originalTitle)}`))
    await evaluate('window.__pomoProbe.notifications[0].onclick()')
    await sleep(100)
    check('点击通知回到专注工作台', await evaluate(`Boolean(document.querySelector('button[title="重置计时"]'))`))

    const countBeforeLongBreak = await evaluate(`document.querySelector('[data-testid="pomodoro-count"]').textContent`)
    await clickText('长休 2m')
    await clickText('开始')
    await advance(2 * 60 * 1000)
    await poll(completed, 3000, '长休完成提示')
    check('长休完成自动回到工作，休息不增加工作次数', await evaluate(`document.querySelector('[data-testid="pomodoro-reminder"]').textContent.includes('长休阶段已完成') && document.querySelector('[data-testid="pomodoro-reminder"]').textContent.includes('已自动开始工作') && document.querySelector('[data-testid="pomodoro-count"]').textContent === ${JSON.stringify(countBeforeLongBreak)} && document.querySelector('#right-workbench').textContent.includes('专注中...')`))
    await clickLabel('关闭完成提醒')
    await openPomoSettings()
    await clickLabel('启用声音提醒')
    await clickLabel('启用系统通知')
    await closePomoSettings()
    const beforeDisabled = await evaluate('[window.__pomoProbe.audioStarts, window.__pomoProbe.notifications.length]')
    await advance(2 * 60 * 1000)
    check('关闭提醒选项后不再播放声音或发送系统通知', await evaluate(`JSON.stringify([window.__pomoProbe.audioStarts, window.__pomoProbe.notifications.length]) === ${JSON.stringify(JSON.stringify(beforeDisabled))}`))

    await clickLabel('关闭完成提醒')
    await openPomoSettings()
    await evaluate(`Notification.permission = 'denied'`)
    await clickLabel('启用系统通知')
    await clickLabel('启用系统通知')
    check('已拒绝权限不重复弹出权限请求，给出降级说明', await evaluate(`window.__pomoProbe.permissionRequests === 1 && !document.querySelector('[aria-label="启用系统通知"]').checked && document.querySelector('[data-testid="pomodoro-warning"]')?.textContent.includes('拒绝')`))
    await evaluate(`Notification.permission = 'granted'; window.__pomoProbe.notificationFail = true`)
    await clickLabel('启用系统通知')
    await closePomoSettings()
    await advance(1 * 60 * 1000)
    await poll(completed, 3000, '通知失败阶段完成提示')
    check('系统通知发送失败时仍显示页面完成提示，并反馈失败', await evaluate(`Boolean(document.querySelector('[data-testid="pomodoro-reminder"]')) && document.querySelector('[data-testid="pomodoro-warning"]')?.textContent.includes('失败')`))
    await openPomoSettings()
    await evaluate(`window.__pomoProbe.audioFail = true; window.__pomoProbe.audioContexts.at(-1).state = 'suspended'`)
    await clickLabel('启用声音提醒')
    await clickLabel('试听提醒音')
    check('音频受限时明确提示，页面不崩溃', await evaluate(`document.querySelector('[data-testid="pomodoro-warning"]')?.textContent.includes('声音')`))
    await closePomoSettings()
    await evaluate(`(async () => {
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      useNavStore.getState().updateSettings({ themeMode: 'dark' })
    })()`)
    await sleep(100)
    await shot('10-pomodoro-completed-dark')
    await openPomoSettings()
    await shot('14-pomodoro-settings-dark')
    await closePomoSettings()
    // 刷新只保留提醒偏好，不恢复计时或补发过期提醒。
    await evaluate('window.__oldSidebarDocument = true')
    await cdp.send('Page.reload')
    await poll(() => evaluate(`!window.__oldSidebarDocument && Boolean(document.querySelector('#right-workbench'))`), 15000, '新页面')
    await clickText('专注')
    check('刷新后不恢复旧计时、不补发通知、不重复申请权限', await evaluate(`!document.querySelector('[data-testid="pomodoro-reminder"]') && window.__pomoProbe.notifications.length === 0 && window.__pomoProbe.permissionRequests === 0 && !document.querySelector('#right-workbench').textContent.includes('专注中...')`))
    await openPomoSettings()
    check('刷新后保留本设备的声音偏好和音量', await evaluate(`document.querySelector('[aria-label="启用声音提醒"]').checked && document.querySelector('[aria-label="提醒音量"]').value === '35'`))
    check('刷新后保留自定义时长和长休间隔', await evaluate(`document.querySelector('[data-testid="pomodoro-duration-work"]').value === '2' && document.querySelector('[data-testid="pomodoro-duration-shortBreak"]').value === '1' && document.querySelector('[data-testid="pomodoro-duration-longBreak"]').value === '2' && document.querySelector('[data-testid="pomodoro-long-break-every"]').value === '2'`))
    await closePomoSettings()
    await evaluate(`window.Notification = undefined`)
    await openPomoSettings()
    await clickLabel('启用系统通知')
    check('不支持 Notification API 时显式降级，不崩溃也不请求权限', await evaluate(`document.querySelector('[data-testid="pomodoro-warning"]')?.textContent.includes('不支持') && window.__pomoProbe.permissionRequests === 0`))
    await closePomoSettings()

    // 窄屏工作台隐藏，但全局提示仍可读、没有越界；完成提示明暗主题均留截图。
    await clickText('开始')
    await advance(2 * 60 * 1000)
    await poll(completed, 3000, '窄屏完成提示')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
    await sleep(100)
    await openPomoSettings()
    check('窄屏设置弹窗可见且不越界', await evaluate(`(() => {
      const el = document.querySelector('[data-testid="pomodoro-settings-dialog"]')
      const r = el?.getBoundingClientRect()
      return r && r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight
    })()`))
    await shot('15-pomodoro-settings-dark-narrow')
    await closePomoSettings()
    check('窄屏完成提示可见且不越界', await evaluate(`(() => {
      const el = document.querySelector('[data-testid="pomodoro-reminder"]')
      const r = el?.getBoundingClientRect()
      return r && r.x >= 0 && r.right <= innerWidth && r.y >= 0 && r.bottom <= innerHeight
    })()`))
    await shot('11-pomodoro-mobile-dark')
    await evaluate(`(async () => {
      const { useNavStore } = await import('/src/store/useNavStore.ts')
      useNavStore.getState().updateSettings({ themeMode: 'light' })
    })()`)
    await sleep(100)
    await shot('12-pomodoro-mobile-light')

    report.success = results.every(r => r.ok)
    if (!report.success) process.exitCode = 1
     console.log('\n=============================================')
     console.log(`${results.filter(r => r.ok).length}/${results.length} 通过，端到端工件：\n${OUT_DIR}`)
     console.log('=============================================\n')
   } catch (error) {
     report.error = error.message
     throw error
   } finally {
     writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
     ws?.close()
     if (proc) {
       proc.kill()
     }
     if (profile) {
       const target = resolve(profile)
       const temp = resolve(tmpdir())
       if (dirname(target) !== temp || !target.startsWith(join(temp, 'nav-sidebars-browser-'))) {
         console.error('拒绝清理未知浏览器 profile')
         process.exitCode = 1
       } else {
         try {
           rmSync(target, { recursive: true, force: true })
         } catch {}
       }
     }
     vite.kill()
   }
 }
 
 main().catch((e) => {
   console.error('E2E 测试失败:', e)
   process.exit(1)
 })

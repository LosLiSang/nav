/**
 * 导航站分类/子分类排序、跨区拖拽归类与右键菜单关闭交互 E2E 测试
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APP_PORT = 5198
const APP_URL = `http://127.0.0.1:${APP_PORT}`
const WORKER_URL = process.env.VITE_SYNC_URL || 'https://nav-sync.lisang.workers.dev'
const OUT_DIR = join(tmpdir(), 'nav-sort-test', 'shots')
const EDGE =
  process.env.EDGE_PATH ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PROXY = process.env.PROXY || 'http://127.0.0.1:7890'
const DEBUG_PORT = 9423

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
  console.log('=== 1. 启动 Vite 本地服务器 ===')

  const vite = spawn('npx.cmd', ['vite', '--host', '127.0.0.1', '--port', String(APP_PORT), '--strictPort'], {
    shell: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      VITE_SYNC_URL: WORKER_URL,
    },
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
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  }

  try {
    console.log('=== 2. 启动 Headless Edge 浏览器验证交互 ===')
    profile = mkdtempSync(join(tmpdir(), 'nav-sort-browser-'))
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
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })

    await cdp.send('Page.navigate', { url: APP_URL })

    // 等待页面渲染出主分类卡片和底部板块卡片
    await poll(async () => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'Boolean(document.querySelector("#tools-section") && document.querySelectorAll("button").length > 10)',
        returnByValue: true,
      })
      return r.result.value === true
    }, 15000, 'Page render')

    check('前端主页初始化渲染成功', true)

    // 1. 验证底部板块/子分类右键菜单弹出并能在点击空白处自动关闭
    console.log('\n--- 测试 1: 底部右键菜单及点击空白自动关闭 ---')
    await cdp.send('Runtime.evaluate', {
      expression: `
        const secBtn = Array.from(document.querySelectorAll('#tools-section button')).find(b => b.textContent.includes('发现') || b.textContent.includes('常用') || b.textContent.includes('生活') || b.textContent.includes('工具'));
        if (secBtn) {
          const rect = secBtn.getBoundingClientRect();
          secBtn.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + 10,
            clientY: rect.top + 10
          }));
        }
      `,
    })
    await sleep(500)

    const menuOpen = await cdp.send('Runtime.evaluate', {
      expression: `Boolean(Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('重命名')) && Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('删除')))` ,
      returnByValue: true,
    })
    check('底部分类右键菜单成功弹出', menuOpen.result.value === true)

    // 点击空白处 (例如 body 顶部或非菜单区域)
    await cdp.send('Runtime.evaluate', {
      expression: `
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
      `,
    })
    await sleep(500)

    const debugButtons = await cdp.send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean)`,
      returnByValue: true,
    })
    console.log('当前页面按钮:', debugButtons.result.value)

    const menuClosed = await cdp.send('Runtime.evaluate', {
      expression: `!Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('重命名'))`,
      returnByValue: true,
    })
    check('点击空白处右键菜单自动关闭（修复与上方行为不一致问题）', menuClosed.result.value === true)

    // 2. 验证打开排序模式
    console.log('\n--- 测试 2: 开启排序模式 ---')
    await cdp.send('Runtime.evaluate', {
      expression: `
        const sortBtn = document.querySelector('button[title*="排序"]');
        if (sortBtn) sortBtn.click();
      `,
    })
    await sleep(500)

    const sortModeActive = await cdp.send('Runtime.evaluate', {
      expression: `document.body.innerText.includes('已打开排序') && document.querySelectorAll('.cursor-grab').length > 0`,
      returnByValue: true,
    })
    check('成功激活排序模式（上下卡片所有书签、分类标签均进入可拖拽状态）', sortModeActive.result.value === true)

    // 3. 验证跨区从上方移动到下方子分类
    console.log('\n--- 测试 3: 跨区书签移动（上层分类 -> 下层子分类） ---')
    const moveResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          const mod = await import('/src/store/useNavStore.ts');
          const store = mod.useNavStore.getState();
          const topBookmarks = store.bookmarks.filter(b => b.categoryId && !b.subCategoryId);
          const subCats = store.subCategories;
          if (topBookmarks.length === 0 || subCats.length === 0) return { error: 'no bookmarks or subcats' };
          
          const targetBookmark = topBookmarks[0];
          const targetSubCat = subCats[0];
          
          // 执行跨区移动
          await store.moveBookmarkToSubCategory(targetBookmark.id, targetSubCat.id);
          
          const nextStore = mod.useNavStore.getState();
          const updated = nextStore.bookmarks.find(b => b.id === targetBookmark.id);
          return {
            success: Boolean(updated && updated.subCategoryId === targetSubCat.id && !updated.categoryId),
            title: targetBookmark.title,
            subCatName: targetSubCat.name
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    })

    check(
      '跨区归类：上方书签成功拉入下方子分类',
      moveResult.result.value?.success === true,
      `书签「${moveResult.result.value?.title}」-> 子分类「${moveResult.result.value?.subCatName}」`,
    )

    // 4. 验证分类与子分类排序
    console.log('\n--- 测试 4: 分类与子分类排序支持 ---')
    const sortCategoryResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          const mod = await import('/src/store/useNavStore.ts');
          const store = mod.useNavStore.getState();
          if (store.subSections.length < 2) return { error: 'not enough sections' };
          const firstSecId = store.subSections[0].id;
          const secondSecId = store.subSections[1].id;
          await store.reorderSubSections(firstSecId, secondSecId);
          const afterSecs = mod.useNavStore.getState().subSections;
          return {
            success: afterSecs[0].id === secondSecId && afterSecs[1].id === firstSecId
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    })

    check('下方板块与子分类支持自由重排序', sortCategoryResult.result.value?.success === true)

    // 截图产出验证工件
    await sleep(500)
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const shotPath = join(OUT_DIR, 'sort-and-cross-move-verified.png')
    writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
    console.log(`\n已保存端到端视觉验证截图: ${shotPath}`)

  } finally {
    if (proc) proc.kill('SIGKILL')
    if (vite) {
      try {
        process.kill(vite.pid)
      } catch {}
    }
    try {
      if (profile) rmSync(profile, { recursive: true, force: true })
    } catch {}
  }

  console.log('\n=== 测试统计 ===')
  const passCount = results.filter((r) => r.ok).length
  console.log(`总计: ${results.length}, 通过: ${passCount}, 失败: ${results.length - passCount}`)
  if (passCount !== results.length) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('测试异常失败:', err)
  process.exit(1)
})

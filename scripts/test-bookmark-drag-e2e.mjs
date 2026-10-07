/**
 * 二级分类书签真实鼠标拖拽与排序 E2E 验证脚本
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
const DEBUG_PORT = 9429

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
    console.log('=== 2. 启动 Headless Edge 浏览器验证二级分类书签拖拽排序 ===')
    profile = mkdtempSync(join(tmpdir(), 'nav-subbookmark-drag-'))
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

    await poll(async () => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'Boolean(document.querySelector("#tools-section") && document.querySelectorAll("button").length > 10)',
        returnByValue: true,
      })
      return r.result.value === true
    }, 15000, 'Page render')

    check('前端页面正常加载', true)

    // 1. 开启排序模式
    await cdp.send('Runtime.evaluate', {
      expression: `
        const sortBtn = document.querySelector('button[title*="排序"]');
        if (sortBtn) sortBtn.click();
      `,
    })
    await sleep(600)

    // 2. 获取当前二级分类下的书签列表
    const initialBookmarks = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const dropZone = document.querySelector('#tools-section [class*="min-h-[300px]"] .grid');
          if (!dropZone) return null;
          const items = Array.from(dropZone.children);
          return items.map((el, i) => {
            const rect = el.getBoundingClientRect();
            const title = el.querySelector('span')?.textContent?.trim() || el.textContent?.trim();
            return {
              index: i,
              title,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 }
            };
          });
        })()
      `,
      returnByValue: true,
    })

    const list = initialBookmarks.result.value
    check('成功识别二级分类书签网格', Boolean(list && list.length >= 2), `书签数量: ${list?.length}`)
    console.log('拖拽前二级分类书签前三项:', list?.slice(0, 3).map(b => b.title))

    if (list && list.length >= 2) {
      const b0 = list[0]
      const b1 = list[1]

      console.log(`执行真实鼠标拖拽：将书签「${b0.title}」拖拽至书签「${b1.title}」...`)
      const startX = Math.round(b0.rect.cx)
      const startY = Math.round(b0.rect.cy)
      const endX = Math.round(b1.rect.cx)
      const endY = Math.round(b1.rect.cy)

      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: startY, button: 'left', buttons: 1, clickCount: 1 })
      await sleep(100)
      for (let i = 1; i <= 25; i++) {
        const curX = Math.round(startX + (endX - startX) * (i / 25))
        const curY = Math.round(startY + (endY - startY) * (i / 25))
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: curX, y: curY, button: 'left', buttons: 1 })
        await sleep(20)
      }
      await sleep(150)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: endX, y: endY, button: 'left' })
      await sleep(600)

      const afterBookmarks = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const dropZone = document.querySelector('#tools-section [class*="min-h-[300px]"] .grid');
            if (!dropZone) return [];
            return Array.from(dropZone.children).map(el => el.querySelector('span')?.textContent?.trim() || el.textContent?.trim());
          })()
        `,
        returnByValue: true,
      })
      const afterList = afterBookmarks.result.value || []
      console.log('拖拽后二级分类书签前三项:', afterList.slice(0, 3))

      const swapped = afterList.length >= 2 && afterList[0] === b1.title && afterList[1] === b0.title
      check('二级分类书签在页面上完成位置调换', swapped, `预期前两项为 [${b1.title}, ${b0.title}], 实际为 [${afterList[0]}, ${afterList[1]}]`)

      // 3. 验证反向拖拽（将当前的第 1 项拖拽回到第 0 项之前）
      console.log(`执行反向拖拽：将书签「${afterList[1]}」拖拽回书签「${afterList[0]}」前方...`)
      const backPositions = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const dropZone = document.querySelector('#tools-section [class*="min-h-[300px]"] .grid');
            if (!dropZone) return null;
            const items = Array.from(dropZone.children);
            return items.slice(0, 2).map((el, i) => {
              const rect = el.getBoundingClientRect();
              return {
                title: el.querySelector('span')?.textContent?.trim() || el.textContent?.trim(),
                cx: rect.x + rect.width / 2,
                cy: rect.y + rect.height / 2
              };
            });
          })()
        `,
        returnByValue: true,
      })
      if (backPositions.result.value && backPositions.result.value.length >= 2) {
        const item0 = backPositions.result.value[0]
        const item1 = backPositions.result.value[1]
        const bStartX = Math.round(item1.cx)
        const bStartY = Math.round(item1.cy)
        const bEndX = Math.round(item0.cx)
        const bEndY = Math.round(item0.cy)

        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bStartX, y: bStartY, button: 'left', buttons: 1, clickCount: 1 })
        await sleep(100)
        for (let i = 1; i <= 25; i++) {
          const curX = Math.round(bStartX + (bEndX - bStartX) * (i / 25))
          const curY = Math.round(bStartY + (bEndY - bStartY) * (i / 25))
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: curX, y: curY, button: 'left', buttons: 1 })
          await sleep(20)
        }
        await sleep(150)
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bEndX, y: bEndY, button: 'left' })
        await sleep(600)

        const finalBookmarks = await cdp.send('Runtime.evaluate', {
          expression: `
            (() => {
              const dropZone = document.querySelector('#tools-section [class*="min-h-[300px]"] .grid');
              if (!dropZone) return [];
              return Array.from(dropZone.children).map(el => el.querySelector('span')?.textContent?.trim() || el.textContent?.trim());
            })()
          `,
          returnByValue: true,
        })
        const finalList = finalBookmarks.result.value || []
        console.log('反向拖拽后二级分类书签前三项:', finalList.slice(0, 3))
        const backSwapped = finalList.length >= 2 && finalList[0] === b0.title && finalList[1] === b1.title
        check('反向拖拽成功复原顺序', backSwapped, `预期前两项为 [${b0.title}, ${b1.title}], 实际为 [${finalList[0]}, ${finalList[1]}]`)
      }

      // 4. 验证将书签拖拽到底部空白 DropZone 区域（自动归类/调整至当前子分类末尾）
      console.log(`执行拖拽到底部空白区：将首项书签「${b0.title}」拖拽至空白区以移至末尾...`)
      const dropZoneRect = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const dropZone = document.querySelector('#tools-section [class*="min-h-[300px]"] .grid');
            if (!dropZone) return null;
            const r = dropZone.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.bottom + 40 };
          })()
        `,
        returnByValue: true,
      })
      if (dropZoneRect.result.value) {
        const dz = dropZoneRect.result.value
        const b0Pos = await cdp.send('Runtime.evaluate', {
          expression: `
            (() => {
              const dropZone = document.querySelector('#tools-section [class*="min-h-[300px]"] .grid');
              const first = dropZone?.children[0];
              if (!first) return null;
              const r = first.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            })()
          `,
          returnByValue: true,
        })
        if (b0Pos.result.value) {
          const fromX = Math.round(b0Pos.result.value.x)
          const fromY = Math.round(b0Pos.result.value.y)
          const toX = Math.round(dz.x)
          const toY = Math.round(dz.y)

          await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, button: 'left', buttons: 1, clickCount: 1 })
          await sleep(100)
          for (let i = 1; i <= 25; i++) {
            const curX = Math.round(fromX + (toX - fromX) * (i / 25))
            const curY = Math.round(fromY + (toY - fromY) * (i / 25))
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: curX, y: curY, button: 'left', buttons: 1 })
            await sleep(20)
          }
          await sleep(150)
          await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, button: 'left' })
          await sleep(600)

          const endCheck = await cdp.send('Runtime.evaluate', {
            expression: `
              (() => {
                const dropZone = document.querySelector('#tools-section [class*="min-h-[300px]"] .grid');
                if (!dropZone) return [];
                return Array.from(dropZone.children).map(el => el.querySelector('span')?.textContent?.trim() || el.textContent?.trim());
              })()
            `,
            returnByValue: true,
          })
          const endList = endCheck.result.value || []
          const isLast = endList[endList.length - 1] === b0.title
          check('拖拽至空白区成功将书签排至末尾', isLast, `末尾书签为: ${endList[endList.length - 1]}`)
        }
      }

      // 5. 验证数据库持久化（Dexie 中的 order 必须与视图一致）
      const dbCheck = await cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            const dbMod = await import('/src/lib/db.ts');
            const allBookmarks = await dbMod.db.bookmarks.toArray();
            const subBookmarks = allBookmarks.filter(b => b.subCategoryId === 'sub-mail').sort((a, b) => a.order - b.order);
            return {
              totalBookmarksCount: allBookmarks.length,
              count: subBookmarks.length,
              orders: subBookmarks.map(b => b.order),
              firstTitle: subBookmarks[0]?.title,
              allTitles: subBookmarks.map(b => b.title)
            };
          })()
        `,
        awaitPromise: true,
        returnByValue: true,
      })
      const dbInfo = dbCheck.result.value
      console.log('数据库查询详情:', dbInfo)
      const isOrderSequential = dbInfo?.orders?.every((ord, idx) => ord === idx)
      check('Dexie 本地数据库中 order 字段连续递增并持久化', isOrderSequential, `顺序序列: ${JSON.stringify(dbInfo?.orders)}`)
    }

    // 截图生成工件
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const shotPath = join(OUT_DIR, 'sub-bookmark-drag-verified.png')
    writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
    console.log(`\n已保存端到端视觉验证截图: ${shotPath}`)

  } finally {
    if (proc) proc.kill('SIGKILL')
    if (vite) {
      try { process.kill(vite.pid) } catch {}
    }
    try {
      if (profile) rmSync(profile, { recursive: true, force: true })
    } catch {}
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

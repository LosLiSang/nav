/** Browser leg of the metadata E2E; real application, APIs and IndexedDB. */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function runMetadataUI(root, out, check, upstreamCount) {
  const processes = []
  let ws
  let send
  const errors = []
  let viteLog = ''
  let dropAdminResponse = false
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  async function poll(fn, label) {
    let last
    for (let i = 0; i < 100; i++) {
      try { const value = await fn(); if (value) return value; last = value } catch (error) { last = String(error) }
      await sleep(200)
    }
    throw new Error('UI timeout: ' + label + '; last=' + JSON.stringify(last))
  }
  try {
    // Exercise the production build; the dev CSS module transform can hang on cold boot.
    const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1',
      '--port', '5220', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, VITE_SYNC_URL: 'http://127.0.0.1:8820' } })
    processes.push(vite)
    for (const stream of [vite.stdout, vite.stderr]) stream.on('data', data => { viteLog += data.toString() })
    await poll(() => fetch('http://127.0.0.1:5220/').then(r => r.ok), 'owned Vite')
    const profile = mkdtempSync(join(out, 'browser-profile-'))
    const edge = spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ['--headless=new', '--remote-debugging-port=9440', `--user-data-dir=${profile}`, '--no-first-run',
        `--proxy-server=${process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890'}`,
        '--proxy-bypass-list=127.0.0.1;localhost', '--disable-extensions', '--disable-background-networking', 'about:blank'],
      { stdio: 'ignore', windowsHide: true })
    processes.push(edge)
    const target = await poll(() => fetch('http://127.0.0.1:9440/json/list').then(r => r.json())
      .then(list => list.find(t => t.type === 'page')?.webSocketDebuggerUrl), 'owned Edge')
    ws = new WebSocket(target)
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
    let seq = 0
    const pending = new Map()
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.method === 'Fetch.requestPaused') {
        const drop = dropAdminResponse && message.params.request.method === 'POST' && message.params.responseStatusCode === 200
        void send(drop ? 'Fetch.failRequest' : 'Fetch.continueResponse',
          { requestId: message.params.requestId, ...(drop ? { errorReason: 'Failed' } : {}) })
        return
      }
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
      if (message.method === 'Network.loadingFailed' || message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push({ event: message.method, ...message.params })
      }
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
    })
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }))
    })
    async function evaluate(expression) {
      const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
      if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || 'page exception')
      return value.result.value
    }
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 950, deviceScaleFactor: 1, mobile: false })
    const session = { url: 'http://127.0.0.1:8820', token: 'cache-admin', expiresAt: Date.now() + 3600000,
      user: { id: 'cache-admin', login: 'cache-admin', name: null, avatarUrl: null, role: 'admin', status: 'active', createdAt: 1, lastLoginAt: 1 } }
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin==='http://127.0.0.1:5220'){
      localStorage.setItem('nav_session',${JSON.stringify(JSON.stringify(session))}); window.confirm=()=>true;
      localStorage.setItem('nav_server_url','http://127.0.0.1:8820');
      window.__cacheRead=(table,key)=>new Promise((resolve,reject)=>{
        const open=indexedDB.open('nav-workspace-v2-u-cache-admin');
        open.onerror=()=>reject(open.error); open.onsuccess=()=>{
          const db=open.result; const tx=db.transaction(table,'readonly');
          const query=key===undefined?tx.objectStore(table).getAll():tx.objectStore(table).get(key);
          query.onsuccess=()=>resolve(query.result);query.onerror=()=>reject(query.error);
          tx.oncomplete=()=>db.close();
        };
      });
    }` })
    await send('Page.navigate', { url: 'http://127.0.0.1:5220/' })
    // Wait for the application's own boot, not an injected import racing its module graph.
    await poll(() => evaluate("Boolean(document.querySelector('[title=\"全局界面与壁纸设置\"]'))"), 'app rendered')
    await poll(() => evaluate("(async()=>{const b=await window.__cacheRead('bookmarks');return b.some(x=>x.id==='one')})()"), 'real account snapshot restored')
    await evaluate(`document.querySelector('[title="全局界面与壁纸设置"]').click()`)
    await poll(() => evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='清理本地图标缓存')`), 'cache entry')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='清理本地图标缓存').click()`)
    await poll(() => evaluate(`Boolean(document.querySelector('[aria-label="联合刷新范围"]')&&!document.querySelector('[aria-label="联合刷新范围"]').matches(':disabled'))`), 'cache protocol ready')
    await evaluate(`(()=>{const select=document.querySelector('[aria-label="联合刷新范围"]');select.value='all';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    check('UI shows confirmed scope and shared impact', await evaluate(`document.querySelector('[aria-label="本地及服务端缓存管理"]').textContent.includes('不修改已保存的书签标题')`))
    await poll(() => evaluate(`(async()=>{return Boolean((await window.__cacheRead('iconCache','cache.test'))?.blob)})()`), 'existing local icon')
    const oldIcon = await evaluate(`(async()=>{return (await window.__cacheRead('iconCache','cache.test')).blob.size})()`)
    await send('Network.enable')
    await send('Network.setBlockedURLs', { urls: ['*version=*'] })
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='确认并联合刷新').click()`)
    await poll(() => evaluate(`document.querySelector('[aria-label="本地及服务端缓存管理"]').textContent.includes('已返回')`), 'refresh result')
    check('Partial local failure retains existing IndexedDB icon', await evaluate(`(async()=>{
      return (await window.__cacheRead('iconCache','cache.test')).blob.size===${oldIcon}&&
      document.querySelector('[aria-label="本地及服务端缓存管理"]').textContent.includes('本地更新失败')
    })()`))
    const beforeRetry = upstreamCount()
    await send('Network.setBlockedURLs', { urls: [] })
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='重试失败阶段').click()`)
    await poll(() => evaluate(`document.querySelector('[aria-label="本地及服务端缓存管理"]').textContent.includes('本地已更新')`), 'local retry')
    check('Local retry does not refetch upstream', upstreamCount() === beforeRetry)
    check('UI executes refresh and installs real local icon', await evaluate(`(async()=>{
      const icon=await window.__cacheRead('iconCache','cache.test');
      return Boolean(icon?.blob)&&document.querySelector('[aria-label="本地及服务端缓存管理"]').textContent.includes('本地已更新')
    })()`))
    check('Manual icon skipped and business titles retained in UI', await evaluate(`(async()=>{
      const b=await window.__cacheRead('bookmarks');
      return b.some(x=>x.title==='SAVED TITLE')&&b.some(x=>x.title==='MANUAL TITLE'&&x.iconUrl==='data:manual-icon')&&
      document.querySelector('[aria-label="本地及服务端缓存管理"]').textContent.includes('手动图标已跳过')
    })()`))
    for (const [theme, width] of [['light', 1100], ['dark', 1100], ['light', 390], ['dark', 390]]) {
      await evaluate(`document.documentElement.classList.toggle('dark','${theme}'==='dark')`)
      await send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 500 })
      await evaluate(`document.querySelector('[aria-label="本地及服务端缓存管理"]').scrollIntoView({block:'start'})`)
      await sleep(150)
      const layout = await evaluate(`(()=>{
        const panel=document.querySelector('[aria-label="本地及服务端缓存管理"]');
        const dialog=document.querySelector('[aria-label="清理本地图标缓存"]');
        return {panelFits:panel.scrollWidth<=panel.clientWidth+1,dialogFits:dialog.scrollWidth<=dialog.clientWidth+1,
          pageFits:document.documentElement.scrollWidth<=innerWidth+1,
          controlsFit:Array.from(panel.querySelectorAll('button,input,select')).filter(e=>e.getClientRects().length)
            .every(e=>e.getBoundingClientRect().right<=dialog.getBoundingClientRect().right&&e.getBoundingClientRect().left>=dialog.getBoundingClientRect().left)}
      })()`)
      check(`Cache UI ${theme}/${width}px has no horizontal clipping`, Object.values(layout).every(Boolean), layout)
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(out, `cache-ui-${theme}-${width}.png`), Buffer.from(shot.data, 'base64'))
    }
    const panel = `[aria-label="本地及服务端缓存管理"]`
    await evaluate(`Array.from(document.querySelectorAll('${panel} details')).at(-1).open=true`)
    check('Admin invalidation requires typed confirmation', await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='确认使全部公共图标失效').disabled`))
    const readEpoch = () => fetch('http://127.0.0.1:8820/api/cache/capabilities',
      { headers: { Authorization: 'Bearer cache-admin' } }).then(r => r.json()).then(r => r.epoch)
    const beforeEpoch = await readEpoch()
    await evaluate(`document.querySelector('[aria-label="公共缓存失效确认"]').focus()`)
    await send('Input.insertText', { text: 'INVALIDATE PUBLIC ICONS' })
    await poll(() => evaluate(`!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='确认使全部公共图标失效').disabled`), 'typed admin confirmation')
    await send('Fetch.enable', { patterns: [{ urlPattern: '*api/admin/cache/invalidate-public*', requestStage: 'Response' }] })
    dropAdminResponse = true
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='确认使全部公共图标失效').click()`)
    await poll(() => evaluate(`Boolean(document.querySelector('${panel} [role="alert"]'))`), 'uncertain admin outcome')
    check('Admin network loss is reported despite server commit', await readEpoch() === beforeEpoch + 1)
    dropAdminResponse = false
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='确认使全部公共图标失效').click()`)
    let recovered = false
    try { recovered = await poll(() => evaluate(`document.querySelector('${panel}').textContent.includes('公共图标缓存已失效；')`), 'admin retry recovers commit') } catch {}
    check('Admin uncertain retry recovers success without another invalidation', recovered && await readEpoch() === beforeEpoch + 1)
    await send('Fetch.disable')
    // Verify offline/backend failure at network boundary without mocking returned cache state.
    await send('Network.setBlockedURLs', { urls: ['*api/cache/capabilities*'] })
    await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 950, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: 'about:blank' })
    await send('Page.navigate', { url: 'http://127.0.0.1:5220/' })
    await poll(() => evaluate(`Boolean(document.querySelector('[title="全局界面与壁纸设置"]'))`), 'reloaded app')
    await evaluate(`document.querySelector('[title="全局界面与壁纸设置"]').click()`)
    await poll(() => evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='清理本地图标缓存')`), 'reloaded cache entry')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='清理本地图标缓存').click()`)
    await poll(() => evaluate(`document.querySelector('${panel}')?.textContent.includes('尚未就绪')`), 'backend unavailable warning')
    check('Unavailable backend disables joint operation, never reports success', await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='确认并联合刷新').disabled`))
    await send('Browser.close').catch(() => {})
  } catch (error) {
    if (send) {
      const state = await send('Runtime.evaluate', { expression: `JSON.stringify({
        url:location.href,body:document.body.innerText.slice(0,5000),
        html:document.documentElement.outerHTML.slice(0,3000),
        modules:performance.getEntriesByType('resource').map(r=>({url:r.name,size:r.transferSize}))
      })`, returnByValue: true }).catch(() => null)
      writeFileSync(join(out, 'ui-failure.json'), JSON.stringify({ error: String(error), errors, state }, null, 2))
      const shot = await send('Page.captureScreenshot', { format: 'png' }).catch(() => null)
      if (shot) writeFileSync(join(out, 'ui-failure.png'), Buffer.from(shot.data, 'base64'))
    }
    throw error
  } finally {
    writeFileSync(join(out, 'vite.log'), viteLog)
    ws?.close()
    for (const proc of processes) if (proc.pid && proc.exitCode === null) {
      try { execFileSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }) } catch {}
    }
  }
}

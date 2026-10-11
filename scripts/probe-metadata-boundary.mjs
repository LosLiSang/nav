/**
 * #10/#12 的可重复安全边界探针：真实本地 Worker -> 无敏感数据的 loopback 夹具。
 * 期望安全实现拒绝私网抓取与匿名 force；当前基线返回非零是发现缺口，不是通过。
 * 不接触生产、开发 D1 或真实账号，不测试任何真实内网服务。
 */
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = join(root, 'artifacts', 'metadata-boundary')
const workerPort = Number(process.env.PROBE_WORKER_PORT || 8796)
const fixturePort = Number(process.env.PROBE_FIXTURE_PORT || 8797)
const workerUrl = `http://127.0.0.1:${workerPort}`
const fixtureUrl = `http://127.0.0.1:${fixturePort}/fixture`
const marker = 'NAV_LOOPBACK_FIXTURE_NOT_A_SECRET'
const results = []
const report = { workerUrl, fixtureUrl, results, upstreamRequests: 0 }
const sleep = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(output, { recursive: true })

const fixture = createServer((req, res) => {
  if (req.url !== '/fixture') {
    res.writeHead(404).end()
    return
  }
  report.upstreamRequests++
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(`<html><head><title>${marker}</title></head><body>isolated local fixture only</body></html>`)
})
let worker
let logs = ''

function record(name, safe, details) {
  results.push({ name, safe, details })
  console.log(`${safe ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(details)}`)
}

async function probe(force) {
  const before = report.upstreamRequests
  const response = await fetch(`${workerUrl}/api/title?url=${encodeURIComponent(fixtureUrl)}${force ? '&force=1' : ''}`,
    { signal: AbortSignal.timeout(15000) })
  const body = await response.json()
  return { status: response.status, body, upstreamRequests: report.upstreamRequests - before }
}

try {
  const occupied = await new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port: workerPort })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false) })
  })
  if (occupied) throw new Error(`测试 Worker 端口 ${workerPort} 已被占用，拒绝复用未知服务`)
  await new Promise((ok, fail) => {
    fixture.once('error', fail)
    fixture.listen(fixturePort, '127.0.0.1', ok)
  })
  worker = spawn(process.execPath, [
    join(root, 'worker', 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'dev',
    '--config', join(root, 'worker', 'wrangler.toml'), '--port', String(workerPort),
    '--persist-to', join(output, 'd1'), '--var', 'ALLOWED_ORIGIN:http://127.0.0.1:5199',
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  worker.stdout.on('data', value => { logs += value.toString() })
  worker.stderr.on('data', value => { logs += value.toString() })
  let ready = false
  const deadline = Date.now() + 30000
  while (Date.now() < deadline && !ready) {
    if (worker.exitCode !== null) throw new Error(`本地 Worker 提前退出：${worker.exitCode}`)
    try {
      ready = (await fetch(workerUrl, { signal: AbortSignal.timeout(1000) }).then(r => r.json())).service === 'nav'
    } catch {}
    if (!ready) await sleep(200)
  }
  if (!ready) throw new Error('本地 Worker 启动超时；不重新启动或改用生产地址')
  const normal = await probe(false)
  record('公开标题接口拒绝 loopback 目标', [400, 403].includes(normal.status) && normal.upstreamRequests === 0, normal)
  const forced = await probe(true)
  record('匿名 force 不发起源站刷新', [400, 401, 403].includes(forced.status) && forced.upstreamRequests === 0, forced)
  report.safe = results.every(result => result.safe)
  process.exitCode = report.safe ? 0 : 1
} catch (error) {
  report.error = error.message
  console.error(error.message)
  process.exitCode = 1
} finally {
  // 报告没有真实会话、密钥或用户数据；夹具字符串明确不是秘密。
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2))
  // 不落 Wrangler 原始日志，避免环境或未来变更中的秘密进入工件。
  if (report.error) console.error(logs.replace(/Using secrets defined[^\r\n]*/g, 'Using local test configuration').slice(-1800))
  if (worker?.pid && worker.exitCode === null) {
    if (process.platform === 'win32') {
      // PID 只能来自本次 spawn；终止该受控测试子树，不扫描/终止现有用户进程。
      try { execFileSync('taskkill', ['/pid', String(worker.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }) } catch {}
    } else worker.kill()
  }
  await new Promise(resolve => fixture.close(resolve))
  console.log(`可重复工件：${join(output, 'report.json')}`)
}

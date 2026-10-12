/** Real Workerd + existing local proxy; no production deployment or fixture responses. */
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { startLocalMetadataWire } from './local-metadata-wire.mjs'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'artifacts/metadata-proxy')
mkdirSync(out, { recursive: true })
for (const port of [8824, 8924, 8826]) {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => server.close(resolve))
  })
}
const proxy = new URL(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890')
if (proxy.username || proxy.password) throw new Error('Authenticated proxies are not supported by this local diagnostic')
const wireConnections = []
const wire = await startLocalMetadataWire(proxy.href, 8826, value => wireConnections.push(value))
const child = spawn(process.execPath, [join(root, 'worker/node_modules/wrangler/bin/wrangler.js'),
  'dev', '--config', join(root, 'worker/test/proxy-diagnostic.toml'), '--port', '8824',
  '--inspector-port', '8924', '--var', `LOCAL_WIRE_URL:${wire.url}`, '--var', `LOCAL_WIRE_TOKEN:${wire.token}`],
{ cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let log = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
  log += data.toString().replaceAll(wire.token, '<ephemeral-token>')
})
try {
  let ready = false
  // TCP readiness avoids starting a long diagnostic fetch as a readiness probe.
  for (let i = 0; i < 150 && !ready; i++) {
    if (child.exitCode !== null) throw new Error('Owned diagnostic Worker exited')
    const { connect } = await import('node:net')
    ready = await new Promise(resolve => {
      const socket = connect(8824, '127.0.0.1')
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => resolve(false))
    })
    if (!ready) await new Promise(resolve => setTimeout(resolve, 200))
  }
  if (!ready) throw new Error('Diagnostic Worker did not start')
  const response = await fetch('http://127.0.0.1:8824/', { signal: AbortSignal.timeout(110000) })
  const report = await response.json()
  const unauthorized = await fetch(wire.url, { method: 'POST', body: '{}' })
  report.results.push({ name: 'Local wire rejects unauthenticated requests', ok: unauthorized.status === 403, detail: unauthorized.status })
  writeFileSync(join(out, 'report.json'), JSON.stringify({ proxy: proxy.origin, ...report, wireConnections }, null, 2))
  for (const result of report.results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}: ${JSON.stringify(result.detail)}`)
  if (report.results.some(result => !result.ok)) process.exitCode = 1
} catch (error) {
  writeFileSync(join(out, 'error.json'), JSON.stringify({ error: String(error) }, null, 2))
  console.error(error)
  process.exitCode = 1
} finally {
  await wire.close()
  writeFileSync(join(out, 'worker.log'), log)
  if (child.pid && child.exitCode === null) {
    if (process.platform === 'win32') {
      try { execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }) } catch {}
    } else child.kill('SIGTERM')
  }
}

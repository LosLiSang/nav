/** Local development only; inherit the existing proxy, never alter system settings. */
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { startLocalMetadataWire } from './local-metadata-wire.mjs'

const root = resolve(import.meta.dirname, '..')
const proxy = new URL(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7890')
if (proxy.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(proxy.hostname) ||
  proxy.username || proxy.password || proxy.pathname !== '/' || proxy.search || proxy.hash) {
  throw new Error('Local development requires an unauthenticated loopback HTTP proxy')
}
console.log(`Local Worker external metadata uses ${proxy.origin}; localhost stays direct. Production config unchanged.`)
const wire = await startLocalMetadataWire(proxy.href, 8789)
const child = spawn(process.execPath, [join(root, 'worker/node_modules/wrangler/bin/wrangler.js'), 'dev',
  '--config', join(root, 'worker/local/wrangler.toml'), '--port', '8787',
  '--persist-to', join(root, 'worker/.wrangler/state'),
  '--var', `LOCAL_WIRE_URL:${wire.url}`, '--var', `LOCAL_WIRE_TOKEN:${wire.token}`],
{ cwd: join(root, 'worker'), stdio: 'inherit', windowsHide: true })
child.on('error', async error => { console.error(error); process.exitCode = 1; await wire.close() })
child.on('exit', async code => { process.exitCode = code ?? 1; await wire.close() })
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))

/** Authenticated loopback-only raw wire bridge. Never imported into production. */
import { createServer } from 'node:http'
import { connect, isIP } from 'node:net'
import { connect as connectTls, checkServerIdentity } from 'node:tls'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { once } from 'node:events'

export async function startLocalMetadataWire(proxyAddress, port, onConnect = () => {}) {
  const proxy = new URL(proxyAddress)
  if (proxy.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(proxy.hostname) ||
    proxy.username || proxy.password || proxy.pathname !== '/' || proxy.search || proxy.hash) {
    throw new Error('Only unauthenticated loopback HTTP proxies are supported')
  }
  const token = randomUUID()
  const sockets = new Set()
  let active = 0
  const server = createServer(async (req, res) => {
    const supplied = Buffer.from(String(req.headers['x-local-wire-token'] || ''))
    const expected = Buffer.from(token)
    if (req.method !== 'POST' || req.url !== '/' || req.headers.origin ||
      supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.writeHead(403).end('local_wire_forbidden'); return
    }
    if (active >= 6) { res.writeHead(429).end('local_wire_busy'); return }
    active++
    let socket
    const abort = () => socket?.destroy(new Error('local_wire_client_closed'))
    res.once('close', abort)
    try {
      let input = ''
      for await (const chunk of req) {
        input += chunk
        if (Buffer.byteLength(input) > 16384) throw new Error('local_wire_request_too_large')
      }
      const { url: raw, address, maxBytes, accept } = JSON.parse(input)
      const url = new URL(raw)
      const resolver = url.protocol === 'https:' && url.hostname === 'cloudflare-dns.com' &&
        url.pathname === '/dns-query' && address === url.hostname && accept === 'application/dns-json'
      if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password ||
        (!isIP(address) && !resolver) || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576 ||
        !['*/*', 'application/dns-json'].includes(accept)) throw new Error('invalid_local_wire_request')
      const destination = `${isIP(address) === 6 ? `[${address}]` : address}:${url.protocol === 'https:' ? 443 : 80}`
      onConnect({ host: url.hostname, address, port: url.protocol === 'https:' ? 443 : 80 })
      socket = connect({ host: proxy.hostname.replace(/^\[|\]$/g, ''), port: Number(proxy.port || 80) })
      sockets.add(socket)
      socket.on('error', () => {})
      socket.setTimeout(15000, () => socket.destroy(new Error('local_proxy_timeout')))
      await once(socket, 'connect')
      socket.write(`CONNECT ${destination} HTTP/1.1\r\nHost: ${destination}\r\n\r\n`)
      await new Promise((resolve, reject) => {
        let header = Buffer.alloc(0)
        const cleanup = () => {
          socket.off('data', data); socket.off('error', error); socket.off('end', end)
        }
        const error = value => { cleanup(); reject(value) }
        const end = () => error(new Error('proxy_connect_closed'))
        const data = chunk => {
          header = Buffer.concat([header, chunk])
          const boundary = header.indexOf('\r\n\r\n')
          if (header.length > 8192) { error(new Error('proxy_connect_headers_too_large')); return }
          if (boundary < 0) return
          cleanup()
          socket.pause()
          if (!/^HTTP\/1\.[01] 200(?: |\r)/.test(header.toString('latin1'))) {
            reject(new Error('proxy_connect_rejected')); return
          }
          if (header.length !== boundary + 4) { reject(new Error('proxy_connect_extra_data')); return }
          resolve()
        }
        socket.on('data', data); socket.once('error', error); socket.once('end', end)
      })
      if (url.protocol === 'https:') {
        const tunnel = socket
        socket = connectTls({ socket: tunnel, servername: url.hostname, rejectUnauthorized: true,
          checkServerIdentity: (_hostname, cert) => checkServerIdentity(url.hostname, cert),
          ALPNProtocols: ['http/1.1'] })
        sockets.add(socket)
        socket.on('error', () => {})
        socket.setTimeout(15000, () => socket.destroy(new Error('local_proxy_tls_timeout')))
        await once(socket, 'secureConnect')
      }
      socket.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nUser-Agent: nav-metadata/1\r\nAccept: ${accept}\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`)
      socket.resume()
      const chunks = []
      let size = 0
      for await (const chunk of socket) {
        size += chunk.length
        if (size > maxBytes + 65536) throw new Error('response_too_large')
        chunks.push(chunk)
      }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' })
      res.end(Buffer.concat(chunks))
    } catch (error) {
      if (!res.destroyed) res.writeHead(502, { 'Content-Type': 'text/plain' }).end(`${error.code || 'wire_error'}: ${error.message}`.slice(0, 2048))
    } finally {
      res.off('close', abort)
      socket?.destroy()
      for (const item of sockets) if (item.destroyed) sockets.delete(item)
      active--
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(port, '127.0.0.1', resolve)
  })
  return { url: `http://127.0.0.1:${port}/`, token,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    } }
}

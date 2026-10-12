/**
 * Local-only wire bridge. Node owns CONNECT + TLS; the actual Worker validates DNS,
 * redirects and responses. Production src/index.ts never imports this module.
 */
import { isPublicAddress, normalizeTarget, parseMetadataWire, readBounded, resolveMetadataDns } from '../src/safe-metadata-fetch'
import type { MetadataTransport } from '../src/safe-metadata-fetch'

export function createLocalProxyTransport(wireAddress: string, token: string,
  onConnect?: (value: { host: string; address: string; port: number }) => void): MetadataTransport {
  const wire = new URL(wireAddress)
  if (wire.protocol !== 'http:' || wire.hostname !== '127.0.0.1' ||
    wire.username || wire.password || wire.pathname !== '/' || wire.search || wire.hash || !token) {
    throw new Error('invalid_local_wire_bridge')
  }
  async function request(url: URL, address: string, signal: AbortSignal, maxBytes: number, accept = '*/*') {
    normalizeTarget(url.href)
    if (!isPublicAddress(address) && !(url.hostname === 'cloudflare-dns.com' && address === url.hostname)) {
      throw new Error('unsafe_proxy_target')
    }
    onConnect?.({ host: url.hostname, address, port: url.protocol === 'https:' ? 443 : 80 })
    const response = await fetch(wire, { method: 'POST', signal, redirect: 'manual',
      headers: { 'X-Local-Wire-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.href, address, maxBytes, accept }) })
    if (!response.ok) {
      const error = new TextDecoder().decode(await readBounded(response, 2048, signal))
      throw new Error(`local_proxy_wire_failed: ${error}`)
    }
    return parseMetadataWire(await readBounded(response, maxBytes + 65536, signal), maxBytes)
  }
  return {
    resolve: (host, signal) => resolveMetadataDns(host, signal, (url, signal) =>
      request(url, 'cloudflare-dns.com', signal, 16384, 'application/dns-json')),
    request,
  }
}

import { safeMetadataFetch, isPublicAddress } from '../src/safe-metadata-fetch'
import { createLocalProxyTransport } from '../local/proxy-transport'
import { extractTitleFromHtml } from '../src/fetchers'

export default {
  async fetch(_request: Request, env: { LOCAL_WIRE_URL: string; LOCAL_WIRE_TOKEN: string }) {
    const connections: Array<{ host: string; address: string; port: number }> = []
    const transport = createLocalProxyTransport(env.LOCAL_WIRE_URL, env.LOCAL_WIRE_TOKEN, value => connections.push(value))
    const results: Array<{ name: string; ok: boolean; detail: unknown }> = []
    for (const [name, url, expectedType] of [
      ['HTTP via proxy', 'http://neverssl.com/', 'text/html'],
      ['HTTPS via proxy', 'https://github.com/robots.txt', 'text/plain'],
      ['Real title HTML via proxy', 'https://github.com/login', 'text/html'],
      ['Real icon via proxy', 'https://github.com/favicon.ico', 'image/'],
    ]) {
      try {
        const { response, bytes } = await safeMetadataFetch(url, transport, AbortSignal.timeout(20000), 262144)
        const title = name === 'Real title HTML via proxy' ? extractTitleFromHtml(new TextDecoder().decode(bytes)) : undefined
        results.push({ name, ok: response.ok && bytes.length > 0 &&
          Boolean(response.headers.get('content-type')?.includes(expectedType)) && (title === undefined || title.length > 0),
        detail: { status: response.status, bytes: bytes.length, type: response.headers.get('content-type'), title } })
      } catch (error) { results.push({ name, ok: false, detail: String(error) }) }
    }
    try {
      const signal = AbortSignal.timeout(15000)
      const addresses = await transport.resolve('github.com', signal)
      if (!addresses.length || addresses.some(address => !isPublicAddress(address))) throw new Error('invalid_probe_dns')
      await transport.request(new URL('https://wrong-certificate.invalid/'), addresses[0], signal, 1024)
      results.push({ name: 'Wrong hostname certificate refused', ok: false, detail: 'accepted wrong certificate' })
    } catch (error) {
      results.push({ name: 'Wrong hostname certificate refused', ok: /ERR_TLS_CERT_ALTNAME_INVALID/.test(String(error)), detail: String(error) })
    }
    const beforeUnsafe = connections.length
    try {
      await transport.request(new URL('http://public.example/'), '127.0.0.1', AbortSignal.timeout(1000), 1024)
      results.push({ name: 'Private target refused before proxy', ok: false, detail: 'accepted private target' })
    } catch (error) {
      results.push({ name: 'Private target refused before proxy', ok: String(error).includes('unsafe_proxy_target') &&
        connections.length === beforeUnsafe, detail: String(error) })
    }
    results.push({ name: 'Target CONNECT addresses are checked IPs', ok: connections
      .filter(value => value.host !== 'cloudflare-dns.com').every(value => isPublicAddress(value.address)),
    detail: connections })
    return Response.json({ results, connections })
  },
}

/** Only DNS and the network wire are replaceable by the isolated E2E entrypoint. */
export interface MetadataTransport {
  resolve(host: string, signal: AbortSignal): Promise<string[]>
  request(url: URL, address: string, signal: AbortSignal, maxBytes: number): Promise<Response>
}

export class TargetError extends Error {}

export function normalizeTarget(raw: string): URL {
  if (raw.length > 8192) throw new TargetError('invalid_target')
  let url: URL
  try { url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`) }
  catch { throw new TargetError('invalid_target') }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
    url.port || host.length > 253 || !host.includes('.') ||
    !/^[a-z\d-]+(\.[a-z\d-]+)+$/i.test(host) || /^\d+(\.\d+)*$/.test(host) ||
    /\.(localhost|local|internal|lan|home|test-invalid)$/.test(host) ||
    host.split('.').some(label => label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    throw new TargetError('unsafe_target')
  }
  url.hostname = host
  url.hash = ''
  return url
}

/** Conservative allow policy: reject non-global, special-use and transition addresses. */
export function isPublicAddress(address: string): boolean {
  if (address.includes(':')) {
    const [first, second] = address.split(':').map(word => parseInt(word || '0', 16))
    return /^[23][a-f\d]{3}:/i.test(address) &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) && first !== 0x2002 && first !== 0x3fff &&
      !address.includes('.') && /^[a-f\d:]+$/i.test(address)
  }
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false
  const [a, b, c] = parts.map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113))
}

export async function readBounded(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('response_too_large')
      chunks.push(value)
    }
    signal.throwIfAborted()
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return bytes
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => {})
  }
}

/**
 * Production egress uses the supported platform HTTP/TLS implementation.
 * DNS preflight is defense in depth, NOT IP pinning. global_fetch_strictly_public
 * and the platform's public-network egress are the final SSRF/rebinding boundary.
 * No private-origin binding, credentials, Host override or automatic redirects.
 */
async function requestPublic(url: URL, _address: string, signal: AbortSignal, maxBytes: number): Promise<Response> {
  const response = await fetch(url, { signal, redirect: 'manual', cache: 'no-store',
    headers: { Accept: '*/*', 'User-Agent': 'nav-metadata/1' } })
  const bytes = await readBounded(response, maxBytes, signal)
  const headers = new Headers(response.headers)
  // fetch supplies decoded body bytes; don't expose upstream wire encoding/length.
  headers.delete('content-encoding')
  headers.delete('content-length')
  headers.delete('transfer-encoding')
  return new Response([204, 205, 304].includes(response.status) ? null : bytes,
    { status: response.status, headers })
}

/** Production sockets and local proxy wire both use this bounded HTTP parser. */
export function parseMetadataWire(wire: Uint8Array, maxBytes: number): Response {
    const text = new TextDecoder('iso-8859-1').decode(wire)
    const boundary = text.indexOf('\r\n\r\n')
    if (boundary < 0 || boundary > 16384) throw new Error('invalid_upstream_headers')
    const lines = text.slice(0, boundary).split('\r\n')
    const status = Number(lines.shift()?.match(/^HTTP\/1\.[01] (\d{3}) /)?.[1])
    if (!status || status < 200 || status > 599) throw new Error('invalid_upstream_status')
    const headers = new Headers()
    for (const line of lines) {
      const index = line.indexOf(':')
      if (index <= 0) throw new Error('invalid_upstream_headers')
      headers.append(line.slice(0, index), line.slice(index + 1).trim())
    }
    if (headers.has('content-encoding') && headers.get('content-encoding') !== 'identity') {
      throw new Error('unsupported_content_encoding')
    }
    let body = wire.slice(boundary + 4)
    if (headers.get('transfer-encoding')?.toLowerCase() === 'chunked') {
      const chunks: Uint8Array[] = []
      let offset = 0, size = 0
      while (true) {
        const rest = new TextDecoder('iso-8859-1').decode(body.slice(offset, offset + 100))
        const end = rest.indexOf('\r\n')
        const digits = rest.slice(0, end).split(';')[0]
        if (end < 0 || !/^[\da-f]+$/i.test(digits)) throw new Error('invalid_chunk')
        const length = parseInt(digits, 16)
        offset += end + 2
        if (length === 0) break
        size += length
        if (size > maxBytes || offset + length + 2 > body.length) throw new Error('response_too_large')
        chunks.push(body.slice(offset, offset + length))
        offset += length
        if (body[offset] !== 13 || body[offset + 1] !== 10) throw new Error('invalid_chunk')
        offset += 2
      }
      body = new Uint8Array(size)
      let cursor = 0
      for (const chunk of chunks) { body.set(chunk, cursor); cursor += chunk.length }
    }
    if (body.length > maxBytes) throw new Error('response_too_large')
    const expected = headers.get('content-length')
    if (expected && (!/^\d+$/.test(expected) || Number(expected) !== body.length)) throw new Error('truncated_response')
    headers.delete('transfer-encoding')
    headers.delete('content-encoding')
    headers.delete('content-length')
    return new Response([204, 205, 304].includes(status) ? null : body, { status, headers })
}

/** Fixed, trusted resolver only. Local development can replace its outbound wire. */
export async function resolveMetadataDns(host: string, signal: AbortSignal,
  request: (url: URL, signal: AbortSignal) => Promise<Response> = (url, signal) =>
    fetch(url, { headers: { Accept: 'application/dns-json' }, signal, redirect: 'manual' })) {
    const results = await Promise.all([1, 28].map(async type => {
      const res = await request(new URL(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`), signal)
      if (!res.ok) throw new Error(`dns_failed_${res.status}`)
      const body = JSON.parse(new TextDecoder().decode(await readBounded(res, 16384, signal))) as {
        Status?: number; Answer?: Array<{ type: number; data: string }>
      }
      if (body.Status !== 0) throw new Error('dns_failed')
      return (body.Answer ?? []).filter(a => a.type === type).map(a => a.data)
    }))
    return results.flat()
}

export const publicTransport: MetadataTransport = {
  resolve: resolveMetadataDns,
  request: requestPublic,
}

export async function safeMetadataFetch(raw: string, transport: MetadataTransport, signal: AbortSignal, maxBytes: number) {
  let url = normalizeTarget(raw)
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted()
    const addresses = await transport.resolve(url.hostname, signal)
    if (!addresses.length || addresses.some(a => !isPublicAddress(a))) throw new TargetError('unsafe_dns_target')
    const response = await transport.request(url, addresses[0], signal, maxBytes)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || hop === 3) throw new TargetError('unsafe_redirect')
      url = normalizeTarget(new URL(location, url).href)
      continue
    }
    const bytes = await readBounded(response, maxBytes, signal)
    return { response, bytes }
  }
  throw new TargetError('unsafe_redirect')
}

import { sha256Hex } from './crypto'
import { extractTitleFromHtml } from './fetchers'
import { normalizeTarget, safeMetadataFetch, type MetadataTransport, TargetError } from './safe-metadata-fetch'

export type MetadataKind = 'icon' | 'title'
type CacheRow = {
  key: string; kind: MetadataKind; scope: string; epoch: number; generation: number
  value: number[] | null; title: string | null; content_type: string | null
  fresh_until: number; stale_until: number; retry_at: number; error: string | null
}
export type MetadataValue = {
  bytes?: Uint8Array; title?: string; contentType: string; version: string
  cache: 'HIT' | 'MISS' | 'STALE' | 'NEGATIVE' | 'PENDING' | 'NONE'
  error?: string; retryAfter?: number; refreshed?: boolean
}
const DAY = 86400000
// Logical UI batches contain <=20 resources; each HTTP invocation does one resource.
// This keeps D1/subrequest work bounded even on a Free Worker. Three requests may run concurrently.
export const CACHE_LIMITS = { batch: 20, requestBatch: 1, concurrent: 3, refreshPerMinute: 20, cooldownSeconds: 60 }

export class MetadataCache {
  constructor(readonly db: D1Database, readonly transport: MetadataTransport) {}

  async epoch(): Promise<number> {
    const row = await this.db.prepare("SELECT epoch FROM metadata_state WHERE id='public-icons'").first<{ epoch: number }>()
    if (!row) throw new Error('metadata_upgrade_required')
    return row.epoch
  }

  async quota(id: string, amount: number, limit: number, windowMs = 60000): Promise<boolean> {
    const now = Date.now()
    const row = await this.db.prepare(`INSERT INTO metadata_limits (id, used, reset_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        used = CASE WHEN reset_at <= ? THEN excluded.used ELSE used + excluded.used END,
        reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
      WHERE reset_at <= ? OR used + excluded.used <= ?
      RETURNING id`).bind(id, amount, now + windowMs, now, now, now, limit).first()
    return Boolean(row)
  }

  target(kind: MetadataKind, raw: string): string {
    const url = normalizeTarget(raw)
    return kind === 'icon' ? `https://${url.hostname}` : url.href
  }

  async identity(kind: MetadataKind, raw: string, uid?: string) {
    const target = this.target(kind, raw)
    const scope = kind === 'icon' ? 'public' : uid
    return { target, scope, key: await sha256Hex(`v1:${kind}:${scope ?? 'anonymous'}:${target}`) }
  }

  private fromRow(row: CacheRow, cache: MetadataValue['cache']): MetadataValue {
    return {
      bytes: cache !== 'NEGATIVE' && row.value ? new Uint8Array(row.value) : undefined,
      title: cache !== 'NEGATIVE' ? row.title ?? undefined : undefined,
      contentType: row.content_type || 'application/octet-stream',
      version: `${row.epoch}.${row.generation}`, cache,
      error: cache === 'STALE' || cache === 'NEGATIVE' ? row.error ?? 'fetch_failed' : undefined,
      retryAfter: Math.max(0, Math.ceil((row.retry_at - Date.now()) / 1000)),
    }
  }

  private async fetchValue(kind: MetadataKind, target: string) {
    const signal = AbortSignal.timeout(12000)
    if (kind === 'title') {
      const { response, bytes } = await safeMetadataFetch(target, this.transport, signal, 256 * 1024)
      if (!response.ok) throw new Error('upstream_failed')
      const type = response.headers.get('content-type')?.toLowerCase() || ''
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('not_html')
      const preview = new TextDecoder('ascii').decode(bytes.slice(0, 4096))
      let charset = type.match(/charset=["']?([\w-]+)/)?.[1] ||
        preview.match(/<meta[^>]*charset=["']?([\w-]+)/i)?.[1] || 'utf-8'
      if (charset === 'gb2312') charset = 'gbk'
      let html: string
      try { html = new TextDecoder(charset).decode(bytes) }
      catch { html = new TextDecoder().decode(bytes) }
      const title = extractTitleFromHtml(html)
      if (!title || new TextEncoder().encode(title).length > 2048) throw new Error('no_valid_title')
      return { title, bytes: new Uint8Array(), contentType: 'application/json', size: new TextEncoder().encode(title).length }
    }
    const host = new URL(target).hostname
    const candidates = [`${target}/favicon.ico`, `https://icons.duckduckgo.com/ip3/${host}.ico`,
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`]
    for (const candidate of candidates) {
      try {
        const { response, bytes } = await safeMetadataFetch(candidate, this.transport, signal, 256 * 1024)
        if (!response.ok) continue
        // Do not store SVG, HTML, unknown executables or source-controlled Content-Type.
        const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        const ico = bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0
        if (bytes.length < 40 || (!png && !jpeg && !ico)) continue
        return { bytes, contentType: png ? 'image/png' : jpeg ? 'image/jpeg' : 'image/x-icon', size: bytes.length }
      } catch (error) {
        if (error instanceof TargetError || signal.aborted) throw error
      }
    }
    throw new Error('no_valid_icon')
  }

  async read(kind: MetadataKind, raw: string, uid: string | undefined, client: string, refresh = false): Promise<MetadataValue> {
    const { key, target, scope } = await this.identity(kind, raw, uid)
    if (!scope) {
      if (!await this.quota(`read:${client}`, 1, 60)) return { cache: 'NONE', contentType: '', version: '0', error: 'rate_limited', retryAfter: 60 }
      try { return { ...await this.fetchValue(kind, target), cache: 'NONE', version: '0' } }
      catch (error) {
        if (error instanceof TargetError) throw error
        return { cache: 'NONE', contentType: '', version: '0', error: 'fetch_failed' }
      }
    }
    const epoch = kind === 'icon' ? await this.epoch() : 1
    const now = Date.now()
    const row = await this.db.prepare('SELECT * FROM metadata_cache WHERE key=?').bind(key).first<CacheRow>()
    const valid = row?.epoch === epoch ? row : null
    const hasValue = valid && (valid.title !== null || valid.value !== null)
    if (!refresh && valid) {
      if (hasValue && valid.fresh_until > now) return this.fromRow(valid, 'HIT')
      if (valid.retry_at > now) return this.fromRow(valid, hasValue && valid.stale_until > now ? 'STALE' : 'NEGATIVE')
    }
    if (!await this.quota(`read:${client}`, 1, 60)) {
      return { cache: 'PENDING', contentType: '', version: '0', error: 'rate_limited', retryAfter: 60 }
    }
    // Expired values, quotas and journals are reclaimed in bounded batches only.
    await this.db.batch([
      this.db.prepare(`DELETE FROM metadata_cache WHERE key IN
        (SELECT key FROM metadata_cache WHERE stale_until < ? AND retry_at < ? AND lease_until < ?
          AND touched_at < ? ORDER BY touched_at LIMIT 100)`).bind(now, now, now, now - 7 * DAY),
      this.db.prepare('DELETE FROM metadata_limits WHERE id IN (SELECT id FROM metadata_limits WHERE reset_at < ? LIMIT 100)').bind(now - DAY),
      this.db.prepare('DELETE FROM metadata_operations WHERE rowid IN (SELECT rowid FROM metadata_operations WHERE expires_at < ? LIMIT 100)').bind(now),
      this.db.prepare('DELETE FROM metadata_audit WHERE id IN (SELECT id FROM metadata_audit WHERE created_at < ? LIMIT 100)').bind(now - 7 * DAY),
    ])
    await this.db.prepare(`INSERT OR IGNORE INTO metadata_cache (key, kind, scope, epoch, touched_at)
      SELECT ?, ?, ?, ?, ? WHERE
        (SELECT COUNT(*) FROM metadata_cache) < 10000 AND
        (?='icon' OR (SELECT COUNT(*) FROM metadata_cache WHERE scope=? AND kind='title') < 1000)`)
      .bind(key, kind, scope, epoch, now, kind, scope).run()
    const owner = crypto.randomUUID()
    const lease = await this.db.prepare(`UPDATE metadata_cache SET lease_owner=?, lease_until=?, touched_at=?,
        epoch=?, value=CASE WHEN epoch=? THEN value ELSE NULL END,
        title=CASE WHEN epoch=? THEN title ELSE NULL END, byte_size=CASE WHEN epoch=? THEN byte_size ELSE 0 END
      WHERE key=? AND lease_until <= ? AND
        (SELECT COUNT(*) FROM metadata_cache WHERE lease_until > ?) < ?
      RETURNING key`).bind(owner, now + 30000, now, epoch, epoch, epoch, epoch, key, now, now, CACHE_LIMITS.concurrent).first()
    if (!lease) {
      if (hasValue && valid.stale_until > now) return this.fromRow(valid, 'STALE')
      const exists = await this.db.prepare('SELECT key FROM metadata_cache WHERE key=?').bind(key).first()
      return { cache: 'PENDING', contentType: '', version: '0', error: exists ? 'pending' : 'capacity_limit', retryAfter: 2 }
    }
    try {
      const value = await this.fetchValue(kind, target)
      const finished = Date.now()
      const saved = await this.db.prepare(`UPDATE metadata_cache SET value=?, title=?, content_type=?, byte_size=?,
          generation=generation+1, fresh_until=?, stale_until=?, retry_at=0, error=NULL, lease_owner=NULL, lease_until=0
        WHERE key=? AND lease_owner=? AND lease_until > ? AND epoch=?
          AND (?='title' OR epoch=(SELECT epoch FROM metadata_state WHERE id='public-icons'))
          AND (SELECT COALESCE(SUM(byte_size),0) FROM metadata_cache) - byte_size + ? <= 104857600
        RETURNING *`).bind(kind === 'icon' ? Array.from(value.bytes) : null, 'title' in value ? value.title : null,
          value.contentType, value.size, finished + (kind === 'icon' ? 7 * DAY : DAY), finished + 7 * DAY,
          key, owner, finished, epoch, kind, value.size).first<CacheRow>()
      if (!saved) {
        await this.db.prepare('UPDATE metadata_cache SET lease_owner=NULL, lease_until=0 WHERE key=? AND lease_owner=?').bind(key, owner).run()
        return { cache: 'PENDING', contentType: '', version: '0', error: 'superseded_or_capacity', retryAfter: 2 }
      }
      return { ...this.fromRow(saved, 'MISS'), refreshed: true }
    } catch (error) {
      const code = error instanceof TargetError ? error.message : 'fetch_failed'
      const failed = await this.db.prepare(`UPDATE metadata_cache SET error=?, retry_at=?, lease_owner=NULL, lease_until=0
        WHERE key=? AND lease_owner=? AND epoch=?
          AND (?='title' OR epoch=(SELECT epoch FROM metadata_state WHERE id='public-icons'))
        RETURNING *`).bind(code, Date.now() + 300000, key, owner, epoch, kind).first<CacheRow>()
      if (error instanceof TargetError) throw error
      if (failed) return this.fromRow(failed, hasValue && failed.stale_until > Date.now() ? 'STALE' : 'NEGATIVE')
      return { cache: 'PENDING', contentType: '', version: '0', error: 'superseded', retryAfter: 2 }
    }
  }
}

export function metadataResponse(value: MetadataValue, kind: MetadataKind): Response {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Metadata-Cache': value.cache,
    'X-Metadata-Version': value.version,
    ...(value.retryAfter ? { 'Retry-After': String(value.retryAfter) } : {}),
  }
  const exists = kind === 'title' ? Boolean(value.title) : Boolean(value.bytes?.length)
  if (!exists) {
    return Response.json({ ok: false, error: value.error || 'fetch_failed', retryAfter: value.retryAfter },
      { status: value.error === 'rate_limited' ? 429 : value.cache === 'PENDING' ? 202 : 502, headers })
  }
  if (kind === 'title') return Response.json({ ok: true, title: value.title, source: 'page',
    stale: value.cache === 'STALE', error: value.error, version: value.version }, { headers })
  return new Response(value.bytes, { headers: { ...headers, 'Content-Type': value.contentType, 'X-Content-Type-Options': 'nosniff' } })
}

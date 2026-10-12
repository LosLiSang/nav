import { sha256Hex } from './crypto'
import { CACHE_LIMITS, MetadataCache, type MetadataKind } from './metadata-cache'
import { TargetError } from './safe-metadata-fetch'

type Target = { bookmarkId: string; kind: MetadataKind; expectedUrl?: string }
type Bookmark = { id: string; url: string; iconUrl?: string }
export type RefreshResult = Target & {
  status: 'refreshed' | 'retained_old' | 'failed' | 'pending' | 'rate_limited' | 'manual_skipped'
  version?: string; title?: string; retryAfter?: number; error?: string
}
export class ManagementError extends Error {
  constructor(readonly status: 400 | 403 | 409 | 429, message: string) { super(message) }
}
type OperationRow = { request_hash: string; results: string | null }

export class MetadataManagement {
  constructor(readonly cache: MetadataCache) {}

  private async begin(actor: string, operationId: unknown, request: unknown) {
    if (typeof operationId !== 'string' || !/^[a-z\d-]{8,80}$/i.test(operationId)) {
      throw new ManagementError(400, 'invalid_operation_id')
    }
    const requestHash = await sha256Hex(JSON.stringify(request))
    const now = Date.now()
    await this.cache.db.batch([
      this.cache.db.prepare(`DELETE FROM metadata_operations WHERE rowid IN
        (SELECT rowid FROM metadata_operations WHERE expires_at < ? LIMIT 100)`).bind(now),
      this.cache.db.prepare(`DELETE FROM metadata_audit WHERE id IN
        (SELECT id FROM metadata_audit WHERE created_at < ? LIMIT 100)`).bind(now - 7 * 86400000),
    ])
    const inserted = await this.cache.db.prepare(`INSERT OR IGNORE INTO metadata_operations
      (actor,id,request_hash,expires_at) SELECT ?,?,?,? WHERE
        (SELECT COUNT(*) FROM metadata_operations) < 10000 AND
        (SELECT COUNT(*) FROM metadata_operations WHERE actor=?) < 1000 AND
        (SELECT COUNT(*) FROM metadata_audit) < 20000
      RETURNING id`)
      .bind(actor, operationId, requestHash, now + 180000, actor).first()
    if (inserted) return { id: operationId, fresh: true, saved: null }
    const old = await this.cache.db.prepare('SELECT request_hash,results FROM metadata_operations WHERE actor=? AND id=?')
      .bind(actor, operationId).first<OperationRow>()
    if (!old) throw new ManagementError(429, 'operation_capacity_limit')
    if (old.request_hash !== requestHash) throw new ManagementError(409, 'operation_id_reused')
    return { id: operationId, fresh: false, saved: old.results ? JSON.parse(old.results) : null }
  }

  private async finish(actor: string, id: string, body: unknown) {
    await this.cache.db.prepare('UPDATE metadata_operations SET results=?, expires_at=? WHERE actor=? AND id=?')
      .bind(JSON.stringify(body), Date.now() + 7 * 86400000, actor, id).run()
    return body
  }

  async refresh(actor: string, input: { operationId?: unknown; targets?: unknown }) {
    if (!Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > CACHE_LIMITS.batch) {
      throw new ManagementError(400, 'invalid_batch_size')
    }
    if (input.targets.length > CACHE_LIMITS.requestBatch) throw new ManagementError(400, 'batch_requires_chunking')
    const targets = input.targets as Target[]
    if (targets.some(t => !t || typeof t.bookmarkId !== 'string' || t.bookmarkId.length > 200 ||
      !['icon', 'title'].includes(t.kind))) throw new ManagementError(400, 'invalid_target')
    const snapshot = await this.cache.db.prepare('SELECT doc FROM user_docs WHERE user_id=?').bind(actor).first<{ doc: string }>()
    const bookmarks = snapshot ? (JSON.parse(snapshot.doc) as { bookmarks?: Bookmark[] }).bookmarks ?? [] : []
    if (targets.some(t => !bookmarks.some(b => b.id === t.bookmarkId))) {
      throw new ManagementError(403, 'bookmark_not_synced_or_not_owned')
    }
    if (targets.some(t => t.expectedUrl !== undefined &&
      (typeof t.expectedUrl !== 'string' || t.expectedUrl !== bookmarks.find(b => b.id === t.bookmarkId)!.url))) {
      throw new ManagementError(409, 'bookmark_changed_sync_first')
    }
    const operation = await this.begin(actor, input.operationId, { action: 'refresh', targets })
    if (!operation.fresh) return { pending: !operation.saved, body: operation.saved ?? { ok: false, error: 'operation_pending', retryAfter: 3 } }
    const results: RefreshResult[] = []
    const unique = new Map<string, Promise<Omit<RefreshResult, 'bookmarkId' | 'kind'>>>()
    const keys = await Promise.all(targets.filter(t => !(t.kind === 'icon' && bookmarks.find(b => b.id === t.bookmarkId)!.iconUrl?.trim()))
      .map(t => this.cache.identity(t.kind, bookmarks.find(b => b.id === t.bookmarkId)!.url, actor).then(v => v.key)))
    if (keys.length && !await this.cache.quota(`refresh:${actor}`, new Set(keys).size, CACHE_LIMITS.refreshPerMinute)) {
      const body = await this.finish(actor, operation.id, { ok: true, results: targets.map(t => ({
        bookmarkId: t.bookmarkId, kind: t.kind, status: 'rate_limited', retryAfter: 60,
      })) })
      return { pending: false, body }
    }
    let index = 0
    const work = async () => {
      while (index < targets.length) {
        const t = targets[index++]
        const bookmark = bookmarks.find(b => b.id === t.bookmarkId)!
        if (t.kind === 'icon' && bookmark.iconUrl?.trim()) {
          results.push({ bookmarkId: t.bookmarkId, kind: t.kind, status: 'manual_skipped' })
          continue
        }
        try {
          const { key } = await this.cache.identity(t.kind, bookmark.url, actor)
          let task = unique.get(key)
          if (!task) {
            task = (async () => {
              if (!await this.cache.quota(`resource:${key}`, 1, 1, CACHE_LIMITS.cooldownSeconds * 1000)) {
                return { status: 'rate_limited' as const, retryAfter: CACHE_LIMITS.cooldownSeconds }
              }
              const value = await this.cache.read(t.kind, bookmark.url, actor, actor, true)
              const status = value.refreshed ? 'refreshed' : value.cache === 'STALE' ? 'retained_old' :
                value.error === 'rate_limited' ? 'rate_limited' : value.cache === 'PENDING' ? 'pending' : 'failed'
              await this.cache.db.prepare(`INSERT INTO metadata_audit
                (actor,resource_hash,kind,operation_id,result,created_at) VALUES (?,?,?,?,?,?)`)
                .bind(actor, key, t.kind, operation.id, status, Date.now()).run()
              return { status, version: value.version, title: value.title, retryAfter: value.retryAfter, error: value.error }
            })()
            unique.set(key, task)
          }
          results.push({ bookmarkId: t.bookmarkId, kind: t.kind, ...await task })
        } catch (error) {
          results.push({ bookmarkId: t.bookmarkId, kind: t.kind, status: 'failed', error: error instanceof TargetError ? error.message : 'refresh_failed' })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(targets.length, CACHE_LIMITS.concurrent) }, work))
    const body = await this.finish(actor, operation.id, { ok: true, operationId: operation.id, results })
    return { pending: false, body }
  }

  async invalidatePublic(actor: string, input: { operationId?: unknown; expectedEpoch?: unknown; confirmation?: unknown }) {
    if (input.confirmation !== 'INVALIDATE PUBLIC ICONS' || typeof input.expectedEpoch !== 'number' ||
      !Number.isSafeInteger(input.expectedEpoch) || input.expectedEpoch < 1) throw new ManagementError(400, 'confirmation_required')
    const operation = await this.begin(actor, input.operationId, { action: 'invalidate_public', epoch: input.expectedEpoch })
    if (!operation.fresh) return { pending: !operation.saved, body: operation.saved ?? { ok: false, error: 'operation_pending' } }
    const now = Date.now()
    const success = { ok: true, epoch: input.expectedEpoch + 1, scope: 'public-icons' }
    const batch = await this.cache.db.batch([
      this.cache.db.prepare(`UPDATE metadata_state SET epoch=epoch+1, changed_at=?
      WHERE id='public-icons' AND epoch=? AND changed_at <= ? RETURNING epoch`)
        .bind(now, input.expectedEpoch, now - 300000),
      this.cache.db.prepare(`INSERT INTO metadata_audit
        (actor,kind,operation_id,result,created_at)
        SELECT ?,'public-icons',?,'invalidated',? WHERE EXISTS
          (SELECT id FROM metadata_state WHERE id='public-icons' AND epoch=? AND changed_at=?)`)
        .bind(actor, operation.id, now, input.expectedEpoch + 1, now),
      this.cache.db.prepare(`UPDATE metadata_operations SET results=?, expires_at=? WHERE actor=? AND id=?
        AND EXISTS (SELECT id FROM metadata_state WHERE id='public-icons' AND epoch=? AND changed_at=?)`)
        .bind(JSON.stringify(success), now + 7 * 86400000, actor, operation.id, input.expectedEpoch + 1, now),
    ])
    const row = batch[0].results[0]
    if (!row) {
      await this.finish(actor, operation.id, { ok: false, error: 'epoch_changed_or_cooldown', retryAfter: 300 })
      throw new ManagementError(409, 'epoch_changed_or_cooldown')
    }
    return { pending: false, body: success }
  }
}

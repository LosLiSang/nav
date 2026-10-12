import { apiRequest, loadSession, type Session } from './auth'

export type CacheKind = 'icon' | 'title'
export type CacheTarget = { bookmarkId: string; kind: CacheKind; expectedUrl?: string }
export type CacheResult = CacheTarget & {
  status: 'refreshed' | 'retained_old' | 'failed' | 'pending' | 'rate_limited' | 'manual_skipped'
  version?: string; title?: string; retryAfter?: number; error?: string
  local?: 'updated' | 'failed' | 'not_needed'
  operationId?: string
  uncertain?: boolean
}
export type CacheCapabilities = {
  ok: boolean; protocol: number; epoch: number; admin: boolean
  limits: { batch: number; requestBatch: number; concurrent: number; refreshPerMinute: number; cooldownSeconds: number }
}
function session(): Session {
  const value = loadSession()
  if (!value || value.user.status !== 'active') throw new Error('请使用已审批账号登录后操作')
  return value
}
export async function cacheCapabilities() {
  const s = session()
  const value = await apiRequest<CacheCapabilities>(s.url, '/api/cache/capabilities', { token: s.token })
  if (!value.ok || value.protocol !== 1) throw new Error('后端缓存协议尚未就绪，请先升级 Worker')
  return value
}
export async function refreshServerCache(targets: CacheTarget[], operationId: string = crypto.randomUUID(), exactOperation = false) {
  const s = session()
  const results: CacheResult[] = []
  let index = 0
  async function run() {
    while (index < targets.length) {
      const ordinal = index++
      const id = exactOperation && targets.length === 1 ? operationId : `${operationId}-${ordinal}`
      try {
        const result = await apiRequest<{ ok: boolean; results?: CacheResult[]; error?: string }>(s.url, '/api/cache/refresh',
          { token: s.token, method: 'POST', body: { targets: [targets[ordinal]], operationId: id }, timeoutMs: 20000 })
        if (!result.ok || !result.results) throw new Error(result.error || '任务尚未完成，请稍后重试')
        results.push(...result.results.map(row => ({ ...row, expectedUrl: targets[ordinal].expectedUrl, operationId: id })))
      } catch (error) {
        results.push({ ...targets[ordinal], operationId: id, uncertain: true, status: 'failed',
          error: error instanceof Error ? error.message : '任务状态未知' })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, targets.length) }, run))
  return results
}
export async function invalidatePublicCache(expectedEpoch: number, confirmation: string, operationId: string = crypto.randomUUID()) {
  const s = session()
  const result = await apiRequest<{ ok: boolean; epoch: number; error?: string }>(s.url, '/api/admin/cache/invalidate-public',
    { token: s.token, method: 'POST', body: { operationId, expectedEpoch, confirmation } })
  if (!result.ok) throw new Error(result.error || '失效未完成')
  return result
}

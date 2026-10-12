import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { useNavStore } from '../store/useNavStore'
import { cacheCapabilities, invalidatePublicCache, refreshServerCache, type CacheCapabilities, type CacheKind, type CacheResult, type CacheTarget } from '../lib/metadataCache'
import type { Bookmark } from '../types'
import { ApiError } from '../lib/auth'

const statusText: Record<CacheResult['status'], string> = {
  refreshed: '服务端刷新成功', retained_old: '刷新失败，保留旧值', failed: '服务端刷新失败',
  pending: '已有任务执行中，请稍后重试', rate_limited: '已限流或冷却中', manual_skipped: '手动图标已跳过',
}

export function ServerCachePanel({ currentPageBookmarks }: { currentPageBookmarks: Bookmark[] }) {
  const { session, bookmarks, categories, subCategories, applyServerIcon } = useNavStore()
  const [caps, setCaps] = useState<CacheCapabilities | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>(() => currentPageBookmarks.map(b => b.id))
  const [kind, setKind] = useState<CacheKind | 'both'>('icon')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<CacheResult[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [notice, setNotice] = useState('')
  const stop = useRef(false)
  const mounted = useRef(true)
  const pendingInvalidation = useRef<{ operationId: string; expectedEpoch: number } | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; stop.current = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    setCaps(null)
    if (session?.user.status !== 'active') return
    void cacheCapabilities().then(value => {
      if (!cancelled) { setCaps(value); setError('') }
    }).catch(() => {
      if (!cancelled) setError('服务端缓存功能尚未就绪。请先升级 Worker；仅本地清理仍可使用。')
    })
    return () => { cancelled = true }
  }, [session?.url, session?.user.id])

  const rawTargets: CacheTarget[] = bookmarks.filter(b => selected.includes(b.id)).flatMap(bookmark => {
    const kinds: CacheKind[] = kind === 'both' ? ['icon', 'title'] : [kind]
    return kinds.map(value => ({ bookmarkId: bookmark.id, kind: value, expectedUrl: bookmark.url }))
  })
  const targets = [...new Map(rawTargets.map(target => {
    const bookmark = bookmarks.find(b => b.id === target.bookmarkId)!
    let key = `${target.kind}:${bookmark.id}`
    try {
      const url = new URL(bookmark.url)
      url.hash = ''
      if (!(target.kind === 'icon' && bookmark.iconUrl?.trim())) {
        key = `${target.kind}:${target.kind === 'icon' ? url.hostname.toLowerCase() : url.href}`
      }
    } catch { /* Invalid targets are reported by the backend, not silently omitted. */ }
    return [key, target] as const
  })).values()]

  async function localUpdate(row: CacheResult): Promise<CacheResult> {
    if (row.kind !== 'icon' || row.status !== 'refreshed' || !row.version) return { ...row, local: 'not_needed' }
    try {
      await applyServerIcon(row.bookmarkId, row.version, row.expectedUrl)
      return { ...row, local: 'updated' }
    } catch { return { ...row, local: 'failed' } }
  }

  async function run(items = targets, previous: CacheResult[] = []) {
    if (!caps || running || !items.length) return
    if (!window.confirm(`刷新所选 ${items.length} 项自动资源？公共图标更新会影响其他用户下次读取。不修改书签标题或手动图标。`)) return
    setRunning(true); setError(''); setNotice(''); setResults(previous)
    setProgress({ done: 0, total: items.length }); stop.current = false
    const next = [...previous]
    try {
      for (let index = 0; index < items.length && !stop.current; index += caps.limits.batch) {
        const batch = items.slice(index, index + caps.limits.batch)
        const operationId = crypto.randomUUID()
        // Preserve IDs on request failure: retry can recover a completed server operation without refetching.
        try {
          const server = await refreshServerCache(batch, operationId)
          for (const row of server) next.push(await localUpdate(row))
        } catch (cause) {
          next.push(...batch.map(t => ({ ...t, operationId, uncertain: true, status: 'failed' as const, error: cause instanceof Error ? cause.message : '网络失败' })))
        }
        if (mounted.current) {
          setResults([...next]); setProgress({ done: Math.min(index + batch.length, items.length), total: items.length })
        }
        if (next.slice(-batch.length).some(row => row.status === 'rate_limited' || row.status === 'pending')) {
          stop.current = true
          if (mounted.current) setNotice('已暂停后续批次，请等待冷却后再处理剩余项。')
        }
      }
    } finally { if (mounted.current) setRunning(false) }
  }

  async function retry() {
    if (running) return
    setRunning(true); setError('')
    const next: CacheResult[] = []
    try {
      // Already successful server work only retries the local stage.
      const grouped = new Map<string, CacheResult[]>()
      for (const row of results) {
        if (row.status === 'refreshed' && row.local === 'failed') next.push(await localUpdate(row))
        else if (['failed', 'pending', 'rate_limited', 'retained_old'].includes(row.status)) {
          const id = row.operationId || crypto.randomUUID()
          grouped.set(id, [...(grouped.get(id) || []), row])
        } else next.push(row)
      }
      for (const [id, rows] of grouped) {
        const original = results.filter(row => row.operationId === id)
        const uncertain = rows.some(row => row.uncertain)
        const request = (uncertain ? original : rows).map(row => ({ bookmarkId: row.bookmarkId, kind: row.kind,
          expectedUrl: bookmarks.find(b => b.id === row.bookmarkId)?.url }))
        const server = await refreshServerCache(request, uncertain ? id : crypto.randomUUID(), uncertain)
        for (const row of server) if (rows.some(old => old.bookmarkId === row.bookmarkId && old.kind === row.kind)) next.push(await localUpdate(row))
      }
      if (mounted.current) setResults(next)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : '重试失败，旧值已保留')
    } finally { if (mounted.current) setRunning(false) }
  }

  async function invalidate() {
    if (!caps || running || confirmation !== 'INVALIDATE PUBLIC ICONS') return
    if (!window.confirm('使全部公共自动图标缓存失效？不清理用户私有标题，不删除业务数据，也不会立即抓取全部站点。')) return
    setRunning(true); setError(''); setNotice('')
    const operation = pendingInvalidation.current ?? { operationId: crypto.randomUUID(), expectedEpoch: caps.epoch }
    pendingInvalidation.current = operation
    try {
      const result = await invalidatePublicCache(operation.expectedEpoch, confirmation, operation.operationId)
      setCaps({ ...caps, epoch: result.epoch }); setConfirmation('')
      pendingInvalidation.current = null
      setNotice('公共图标缓存已失效；后续访问按需重建。其他浏览器已有缓存无法远程删除。')
    } catch (cause) {
      if (cause instanceof ApiError && cause.status < 500) pendingInvalidation.current = null
      setError(cause instanceof Error ? cause.message : '操作失败，未报告成功')
    }
    finally { if (mounted.current) setRunning(false) }
  }
  const unprocessed = targets.filter(t => !results.some(r => r.bookmarkId === t.bookmarkId && r.kind === t.kind))
  const needsRetry = results.some(r => r.local === 'failed' || ['failed', 'pending', 'rate_limited', 'retained_old'].includes(r.status))
  return (
    <section aria-label="本地及服务端缓存管理" className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
      <h3 className="flex items-center gap-2 font-medium"><RefreshCw className="h-4 w-4" />本地及服务端联合刷新</h3>
      <p className="leading-relaxed text-neutral-600 dark:text-neutral-300">先刷新服务端，成功后更新本机图标；失败保留旧值。标题仅刷新自动抓取缓存，不修改已保存的书签标题。仅处理已同步书签。</p>
      {!session || session.user.status !== 'active' ? <p>请先使用已审批的账号登录。上方仅本地清理不需要登录。</p> :
        <fieldset disabled={running || !caps} className="space-y-3 disabled:opacity-60">
          <legend className="sr-only">联合刷新范围</legend>
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-0 items-center gap-2">范围
              <select aria-label="联合刷新范围" defaultValue="current" onChange={event => {
                const value = event.target.value
                const rows = value === 'all' ? bookmarks : value === 'current' ? currentPageBookmarks :
                  bookmarks.filter(b => b.categoryId === value || b.subCategoryId === value)
                setSelected(rows.map(b => b.id)); setResults([])
              }} className="min-w-0 max-w-full rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-600">
                <option value="current">当前页</option><option value="all">全部本人书签</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                {subCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">资源
              <select aria-label="联合刷新资源" value={kind} onChange={event => { setKind(event.target.value as CacheKind | 'both'); setResults([]) }}
                className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-600">
                <option value="icon">图标</option><option value="title">标题</option><option value="both">图标和标题</option>
              </select>
            </label>
          </div>
          <details>
            <summary className="cursor-pointer">逐项选择 · 已选 {selected.length} 个书签</summary>
            <div className="mt-2 max-h-40 space-y-1 overflow-auto">
              {bookmarks.map(b => <label key={b.id} className="flex items-start gap-2 break-all">
                <input type="checkbox" checked={selected.includes(b.id)} onChange={event => {
                  setSelected(old => event.target.checked ? [...old, b.id] : old.filter(id => id !== b.id)); setResults([])
                }} className="mt-0.5 accent-orange-500" />
                <span>{b.title}</span>
              </label>)}
            </div>
          </details>
          <p>最多 {caps?.limits.batch ?? 20} 项/批，并发最多 {caps?.limits.concurrent ?? 3}。服务端按实际资源去重，受账号配额和资源冷却限制。</p>
          <button type="button" disabled={running || !caps || !targets.length} onClick={() => void run()}
            className="rounded-lg bg-orange-500 px-3 py-2 text-white disabled:opacity-40">确认并联合刷新</button>
        </fieldset>}
      {running && <div role="status" className="flex flex-wrap items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />处理进度 {progress.done}/{progress.total}
        <button type="button" onClick={() => { stop.current = true; setNotice('将在当前批次完成后停止。') }}
          className="rounded border border-neutral-300 px-2 py-1 dark:border-neutral-600">停止后续批次</button>
      </div>}
      {error && <p role="alert" className="break-words text-red-700 dark:text-red-400">{error}</p>}
      {notice && <p role="status" className="break-words">{notice}</p>}
      {results.length > 0 && <div role="status" className="space-y-2">
        <p>已返回 {results.length} 项；服务端成功 {results.filter(r => r.status === 'refreshed').length} 项，本地更新失败 {results.filter(r => r.local === 'failed').length} 项。</p>
        <ul className="max-h-44 space-y-1 overflow-y-auto break-words">
          {results.map((row, i) => <li key={`${row.bookmarkId}-${row.kind}-${i}`}>
            {bookmarks.find(b => b.id === row.bookmarkId)?.title ?? row.bookmarkId} · {row.kind === 'icon' ? '图标' : '标题'}：
            {statusText[row.status]}{row.local === 'updated' ? '；本地已更新' : row.local === 'failed' ? '；本地更新失败，旧值保留' : ''}
            {row.retryAfter ? `（${row.retryAfter} 秒后可重试）` : ''}
          </li>)}
        </ul>
        {needsRetry && <button type="button" disabled={running} onClick={() => void retry()}
          className="rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-600">重试失败阶段</button>}
        {unprocessed.length > 0 && <button type="button" disabled={running} onClick={() => void run(unprocessed, results)}
          className="ml-2 rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-600">继续剩余 {unprocessed.length} 项</button>}
      </div>}
      {caps?.admin && <details className="border-t border-neutral-200 pt-3 dark:border-neutral-700">
        <summary className="flex cursor-pointer items-center gap-2 text-red-700 dark:text-red-400"><ShieldAlert className="h-4 w-4" />管理员 · 全部公共图标失效</summary>
        <div className="mt-3 space-y-2">
          <p>影响全部公共自动图标；不涉及任何账号私有标题或业务数据。全局操作冷却 5 分钟。</p>
          <label className="block">输入 INVALIDATE PUBLIC ICONS 确认
            <input aria-label="公共缓存失效确认" value={confirmation} onChange={event => setConfirmation(event.target.value)}
              className="mt-1 block w-full min-w-0 rounded border border-neutral-300 bg-transparent px-2 py-2 dark:border-neutral-600" />
          </label>
          <button type="button" disabled={running || confirmation !== 'INVALIDATE PUBLIC ICONS'} onClick={() => void invalidate()}
            className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-40">确认使全部公共图标失效</button>
        </div>
      </details>}
    </section>
  )
}

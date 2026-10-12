import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { useNavStore } from '../store/useNavStore'
import { iconStatus, planIconCleanup, toggleSelection, type IconFilter, type IconReloadResult } from '../lib/iconCache'
import { hostnameOf } from '../lib/utils'
import type { Bookmark } from '../types'
import { ServerCachePanel } from './ServerCachePanel'

type Props = { currentPageBookmarks: Bookmark[]; onClose: () => void }

function SelectionCheckbox({ label, ids, selected, disabled, onToggle }: {
  label: string
  ids: string[]
  selected: string[]
  disabled?: boolean
  onToggle: (ids: string[], checked: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const count = ids.filter(id => selected.includes(id)).length
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && count < ids.length
  }, [count, ids.length])
  return (
    <label className="inline-flex items-center gap-2 py-1">
      <input ref={ref} type="checkbox" aria-label={label} disabled={disabled || ids.length === 0}
        checked={ids.length > 0 && count === ids.length}
        onClick={event => event.stopPropagation()}
        onChange={event => onToggle(ids, event.target.checked)} className="accent-orange-500" />
      <span>{label}</span>
    </label>
  )
}

function SelectionGroup({ label, ids, selected, onToggle, children, open = false }: {
  label: string; ids: string[]; selected: string[]; onToggle: (ids: string[], checked: boolean) => void
  children: ReactNode; open?: boolean
}) {
  return (
    <details open={open || undefined} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
      <summary className="cursor-pointer">
        <SelectionCheckbox label={label} ids={ids} selected={selected} onToggle={onToggle} />
      </summary>
      <div className="ml-4 mt-1 space-y-1">{children}</div>
    </details>
  )
}

export function IconCacheModal({ currentPageBookmarks, onClose }: Props) {
  const { bookmarks, categories, subSections, subCategories, settings, cachedIcons, failedDomains,
    loadingIconDomains, iconCleanupRunning, clearAndReloadIcons } = useNavStore()
  const [selected, setSelected] = useState(() => currentPageBookmarks
    .filter(bookmark => iconStatus(bookmark, cachedIcons, failedDomains) === 'empty')
    .map(bookmark => bookmark.id))
  const [filter, setFilter] = useState<IconFilter>('empty')
  const [error, setError] = useState('')
  const [lastRun, setLastRun] = useState<{ results: IconReloadResult[]; ids: string[] } | null>(null)
  const [runningIds, setRunningIds] = useState<string[]>([])
  const plan = planIconCleanup(bookmarks, selected, filter, cachedIcons, failedDomains)
  const automaticIds = (rows: Bookmark[]) => rows.filter(bookmark => !bookmark.iconUrl?.trim()).map(bookmark => bookmark.id)
  const sharedDomains = new Set(plan.relatedBookmarks.map(bookmark => hostnameOf(bookmark.url)))
  const failedResults = lastRun?.results.filter(result => result.status !== 'success') ?? []
  const finishedCount = runningIds.filter(domain => !loadingIconDomains[domain]).length

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !iconCleanupRunning) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [iconCleanupRunning, onClose])

  function changeSelection(ids: string[], checked: boolean) {
    setSelected(current => toggleSelection(current, ids, checked))
    setLastRun(null)
    setError('')
  }

  async function execute(ids = plan.bookmarks.map(bookmark => bookmark.id), mode = filter) {
    if (iconCleanupRunning) return
    const preview = planIconCleanup(bookmarks, ids, mode, cachedIcons, failedDomains)
    if (!preview.targets.length) return
    setError('')
    setLastRun(null)
    setRunningIds(preview.targets.map(target => target.domain))
    try {
      const results = await clearAndReloadIcons(ids, mode)
      setLastRun({ results, ids })
    } catch (cause) {
      setError(`清理失败：${cause instanceof Error ? cause.message : '请重试'}`)
    } finally {
      setRunningIds([])
    }
  }

  function renderBookmarks(rows: Bookmark[]) {
    return [...rows].sort((a, b) => a.order - b.order).map(bookmark => {
      const status = iconStatus(bookmark, cachedIcons, failedDomains)
      return (
        <div key={bookmark.id} className="flex flex-wrap items-center justify-between gap-1 text-xs">
          <SelectionCheckbox label={bookmark.title} ids={[bookmark.id]} selected={selected}
            disabled={status === 'manual'} onToggle={changeSelection} />
          <span className="text-neutral-500">{status === 'manual' ? '手动图标 · 保留'
            : loadingIconDomains[hostnameOf(bookmark.url)] ? '获取中'
            : status === 'remote' ? '已有远程图标' : '空图标'}</span>
        </div>
      )
    })
  }

  const mainRows = bookmarks.filter(bookmark => bookmark.categoryId)
  const subRows = bookmarks.filter(bookmark => bookmark.subCategoryId)
  const uncategorized = bookmarks.filter(bookmark => !bookmark.categoryId && !bookmark.subCategoryId)

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="清理本地图标缓存"
        className="nav-dialog flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-neutral-200 bg-white text-neutral-800 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="font-semibold">清理本地图标缓存</h2>
          <button type="button" aria-label="关闭缓存清理" disabled={iconCleanupRunning} onClick={onClose}
            className="rounded-lg p-1 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4 text-xs">
          <p className="leading-relaxed text-neutral-500">默认选择主分区当前页的空图标。仅清理所选网站的本地图标缓存及失败记录，随后立即重新获取并更新显示；不删除书签、手动图标或同步配置，也不清除服务器缓存。</p>
          {!iconCleanupRunning && !lastRun && <div className="space-y-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800">
            <p>将处理 {plan.bookmarks.length} 个书签，对应 {plan.targets.length} 个网站缓存。</p>
            {!plan.targets.length && <p>当前选择没有需要处理的图标，可调整范围或筛选。</p>}
            {plan.invalidBookmarks.length > 0 && <p className="text-amber-600">{plan.invalidBookmarks.length} 个书签网址无效，无法获取图标，将跳过。</p>}
            {sharedDomains.size > 0 && <div className="text-amber-700 dark:text-amber-400">
              <p>{sharedDomains.size} 个网站也被未选中的书签引用，清理及更新会联动影响它们的自动图标：</p>
              <ul className="mt-1 list-inside list-disc">{plan.relatedBookmarks.map(bookmark => <li key={bookmark.id}>{bookmark.title} · {hostnameOf(bookmark.url)}</li>)}</ul>
            </div>}
            <p className="text-neutral-500">同域名请求会去重。正常获取可能命中服务器缓存，不保证源站最新版本。</p>
          </div>}
          {iconCleanupRunning && <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />正在清理并获取图标… {finishedCount}/{runningIds.length}</p>}
          {error && <p role="alert" className="text-red-600">{error}</p>}
          {lastRun && <div role="status" className="space-y-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800">
            <p>本地清理完成；远程图标获取成功 {lastRun.results.filter(result => result.status === 'success').length} 个，未成功 {failedResults.length} 个。</p>
            {failedResults.map(result => <p key={result.domain} className="text-red-600">{result.domain}：{result.message || '请求已被替代，请重试'}</p>)}
            {failedResults.length > 0 && <button type="button" onClick={() => {
              const domains = new Set(failedResults.map(result => result.domain))
              const ids = bookmarks.filter(bookmark => lastRun.ids.includes(bookmark.id) && domains.has(hostnameOf(bookmark.url))).map(bookmark => bookmark.id)
              void execute(ids, 'all')
            }} className="rounded-lg border border-neutral-300 px-3 py-1.5 dark:border-neutral-600">重试失败项</button>}
          </div>}
          <fieldset disabled={iconCleanupRunning} className="space-y-3 disabled:opacity-60">
            <legend className="mb-2 font-medium">选择清理范围</legend>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => {
                setSelected(automaticIds(currentPageBookmarks)); setLastRun(null); setError('')
              }} className="rounded-lg border border-neutral-200 px-2 py-1 dark:border-neutral-700">主分区当前页</button>
              <SelectionCheckbox label="全部书签" ids={automaticIds(bookmarks)} selected={selected} onToggle={changeSelection} />
              <label>处理对象：<select aria-label="图标状态筛选" value={filter} onChange={event => {
                setFilter(event.target.value as IconFilter); setLastRun(null); setError('')
              }} className="rounded border border-neutral-200 bg-transparent px-2 py-1 dark:border-neutral-700">
                <option value="empty">仅空图标</option><option value="all">全部自动图标</option>
              </select></label>
            </div>
            <SelectionGroup label="主分区" ids={automaticIds(mainRows)} selected={selected} onToggle={changeSelection} open>
              {[...categories].sort((a, b) => Number(b.id === settings.activeCategoryId) - Number(a.id === settings.activeCategoryId) || a.order - b.order).map(category => {
                const rows = mainRows.filter(bookmark => bookmark.categoryId === category.id)
                return <SelectionGroup key={category.id} label={category.name} ids={automaticIds(rows)} selected={selected}
                  onToggle={changeSelection} open={rows.some(bookmark => selected.includes(bookmark.id))}>{renderBookmarks(rows)}</SelectionGroup>
              })}
            </SelectionGroup>
            <SelectionGroup label="子分区" ids={automaticIds(subRows)} selected={selected} onToggle={changeSelection}>
              {[...subSections].sort((a, b) => a.order - b.order).map(section => {
                const groups = subCategories.filter(group => group.sectionId === section.id).sort((a, b) => a.order - b.order)
                const rows = subRows.filter(bookmark => groups.some(group => group.id === bookmark.subCategoryId))
                return <SelectionGroup key={section.id} label={section.name} ids={automaticIds(rows)} selected={selected} onToggle={changeSelection}>
                  {groups.map(group => {
                    const groupRows = subRows.filter(bookmark => bookmark.subCategoryId === group.id)
                    return <SelectionGroup key={group.id} label={group.name} ids={automaticIds(groupRows)} selected={selected} onToggle={changeSelection}>
                      {renderBookmarks(groupRows)}
                    </SelectionGroup>
                  })}
                </SelectionGroup>
              })}
            </SelectionGroup>
            {uncategorized.length > 0 && <SelectionGroup label="未分组书签" ids={automaticIds(uncategorized)} selected={selected} onToggle={changeSelection}>
              {renderBookmarks(uncategorized)}
            </SelectionGroup>}
          </fieldset>

          <ServerCachePanel currentPageBookmarks={currentPageBookmarks} />
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 p-4 text-xs dark:border-neutral-800">
          <button type="button" disabled={iconCleanupRunning} onClick={onClose} className="rounded-lg px-3 py-2 disabled:opacity-40">完成</button>
          <button type="button" disabled={iconCleanupRunning || !plan.targets.length} onClick={() => void execute()}
            className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-white disabled:opacity-40">清理并立即获取</button>
        </div>
      </div>
    </div>, document.body,
  )
}

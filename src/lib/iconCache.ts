import type { Bookmark } from '../types.ts'
import { hostnameOf } from './url.ts'

export type IconFilter = 'empty' | 'all'
export type IconTarget = { domain: string; url: string }
export type IconReloadResult = {
  domain: string
  status: 'success' | 'failed' | 'superseded'
  message?: string
}

export function iconStatus(
  bookmark: Bookmark,
  cachedIcons: Record<string, string>,
  failedDomains: Record<string, boolean>,
): 'manual' | 'remote' | 'empty' {
  if (bookmark.iconUrl?.trim()) return 'manual'
  const domain = hostnameOf(bookmark.url)
  return cachedIcons[domain] && !failedDomains[domain] ? 'remote' : 'empty'
}

export function planIconCleanup(
  bookmarks: Bookmark[],
  selectedIds: string[],
  filter: IconFilter,
  cachedIcons: Record<string, string>,
  failedDomains: Record<string, boolean>,
) {
  const selected = new Set(selectedIds)
  const eligible = bookmarks.filter(bookmark => {
    if (!selected.has(bookmark.id)) return false
    const status = iconStatus(bookmark, cachedIcons, failedDomains)
    return status !== 'manual' && (filter === 'all' || status === 'empty')
  })
  const targets = new Map<string, IconTarget>()
  const valid: Bookmark[] = []
  const invalidBookmarks: Bookmark[] = []
  for (const bookmark of eligible) {
    const domain = hostnameOf(bookmark.url)
    if (!domain) {
      invalidBookmarks.push(bookmark)
      continue
    }
    valid.push(bookmark)
    if (!targets.has(domain)) targets.set(domain, { domain, url: bookmark.url })
  }
  const targetIds = new Set(valid.map(bookmark => bookmark.id))
  const relatedBookmarks = bookmarks.filter(bookmark =>
    !targetIds.has(bookmark.id) &&
    !bookmark.iconUrl?.trim() &&
    targets.has(hostnameOf(bookmark.url)),
  )
  return { bookmarks: valid, targets: [...targets.values()], relatedBookmarks, invalidBookmarks }
}

export function toggleSelection(selected: string[], ids: string[], checked: boolean): string[] {
  const next = new Set(selected)
  for (const id of ids) {
    if (checked) next.add(id)
    else next.delete(id)
  }
  return [...next]
}

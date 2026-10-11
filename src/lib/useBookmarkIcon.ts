import { useEffect, useState } from 'react'
import type { Bookmark } from '../types'
import { useNavStore } from '../store/useNavStore'
import { hostnameOf, normalizeIconUrl } from './utils'

/** All automatic loads go through the same per-domain owner, including cleanup/retry. */
export function useBookmarkIcon(bookmark: Bookmark, cachedIcon?: string, isFailedDomain?: boolean) {
  const ensureIcon = useNavStore(state => state.ensureIcon)
  const markIconFailed = useNavStore(state => state.markIconFailed)
  const domain = hostnameOf(bookmark.url)
  const loading = useNavStore(state => Boolean(state.loadingIconDomains[domain]))
  const manualIcon = normalizeIconUrl(bookmark.iconUrl?.trim())
  const remoteIcon = normalizeIconUrl(cachedIcon)
  const [brokenManualIcon, setBrokenManualIcon] = useState<string | undefined>()

  useEffect(() => {
    if (!manualIcon && !remoteIcon && !isFailedDomain && !loading) {
      void ensureIcon(bookmark.url)
    }
  }, [bookmark.url, manualIcon, remoteIcon, isFailedDomain, loading, ensureIcon])

  const effectiveIconUrl = manualIcon
    ? (manualIcon === brokenManualIcon ? undefined : manualIcon)
    : (!isFailedDomain ? remoteIcon : undefined)

  return {
    effectiveIconUrl,
    hasIcon: Boolean(effectiveIconUrl),
    onIconError: () => {
      if (manualIcon) setBrokenManualIcon(manualIcon)
      else if (cachedIcon) void markIconFailed(domain, cachedIcon)
    },
  }
}

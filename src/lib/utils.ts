import type { Settings } from '../types'

/**
 * 书签文字在暗色模式下的实际渲染颜色。
 *
 * 用户存的是一个"浅色模式用"的文字色（默认 #1f2937 深灰）。暗色下照用会变成
 * 深灰压深底、几乎看不见，所以默认深色要翻成浅色；用户显式选过的其他颜色则尊重原值。
 *
 * 抽成共用函数的原因：书签卡片（MainCategoryCard）和样式面板里的实时预览
 * 必须用同一套判断，否则预览会显示成卡片实际渲染不出来的颜色，等于骗人。
 */
export function resolveTextColor(settings: Settings): string {
  if (settings.themeMode === 'dark') {
    const color = settings.textColor
    if (!color || color === '#1f2937' || color === '#000000') return '#f3f4f6'
    return color
  }
  return settings.textColor || '#1f2937'
}

export function createId(prefix: string): string {
  const random = crypto.randomUUID().slice(0, 8)
  return `${prefix}-${random}`
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

/**
 * 修复旧版「分类图标」选择器的双重编码。
 *
 * 那版先把颜色里的 # 预转义成 %23，再对整个 SVG 做 encodeURIComponent，
 * % 于是变成 %25，存下来的 fill="%2523fff" 是非法颜色 —— SVG 规范里非法 fill
 * 回退成黑色，而模板里的 <rect> 铺满整个图标，书签上就是一整块纯黑。
 * 这里把 %2523 还原成单次编码的 %23，已存的书签刷新后即可正常显示，无需手动重选。
 */
export function normalizeIconUrl(url: string | undefined): string | undefined {
  if (!url || !url.startsWith('data:image/') || !url.includes('%2523')) return url
  return url.replace(/%2523/g, '%23')
}

export function isUrlLike(value: string): boolean {
  const trimmed = value.trim()
  if (/\s/.test(trimmed)) return false
  try {
    new URL(normalizeUrl(trimmed))
    return true
  } catch {
    return false
  }
}

export function hostnameOf(value: string): string {
  try {
    const url = new URL(normalizeUrl(value))
    return url.hostname
  } catch {
    return ''
  }
}

export function getFaviconCandidates(url: string, customIconUrl?: string): string[] {
  if (customIconUrl) return [customIconUrl]
  const host = hostnameOf(url)
  if (!host) return []

  const candidates: string[] = []

  // 1. 本地开发环境走 Vite 代理 (本地同源，无 CORS 限制，自带内存缓存)
  const isLocalEnv =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]')
  if (isLocalEnv) {
    candidates.push(`/api/icon?domain=${host}`)
  }

  // 2. 高质量公共 Favicon API (原生开放 CORS Access-Control-Allow-Origin: *，无图标时返回真实 404)
  candidates.push(`https://unavatar.io/${host}?fallback=false`)

  return candidates
}

export function faviconFor(url: string, customIconUrl?: string): string {
  if (customIconUrl) return customIconUrl
  const candidates = getFaviconCandidates(url)
  return candidates[0] || ''
}

/**
 * 方案 A：异步拉取候选源二进制 Blob，跳过 Canvas 与 Base64 转换
 * 直接支持 SVG / ICO / PNG 原始高画质持久化
 */
export async function fetchFaviconBlob(
  candidates: string[],
): Promise<{ blob: Blob; objectUrl: string } | null> {
  for (const url of candidates) {
    if (!url) continue
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      return { blob: new Blob([]), objectUrl: url }
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 3500)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)

      if (!res.ok) continue
      const blob = await res.blob()
      if (!blob || blob.size < 40) continue

      const objectUrl = URL.createObjectURL(blob)
      return { blob, objectUrl }
    } catch {
      continue
    }
  }
  return null
}

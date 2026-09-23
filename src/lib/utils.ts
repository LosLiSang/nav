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

  // 1. 目标网站根目录直连 (最权威真实，163邮箱、LeetCode 等均在根目录有官方高清图标)
  try {
    const origin = new URL(normalizeUrl(url)).origin
    if (origin) {
      candidates.push(`${origin}/favicon.ico`)
    }
  } catch {}

  // 2. 本地 Vite 代理端点 (通过本机 127.0.0.1:7890 代理拉取海外高清图标，如 YouTube、Discord 等，自带内存缓存)
  candidates.push(`/api/icon?domain=${host}`)

  // 3. 国内稳定免翻 Favicon 聚合源 (Cravatar API，自动解析页面 HTML 提取真实图标，国内 CDN 加速)
  candidates.push(`https://cravatar.com/favicon/api/index.php?url=${host}`)

  // 4. 海外优质 CDN 备选源 (浏览器直连)
  candidates.push(`https://icons.duckduckgo.com/ip3/${host}.ico`)
  candidates.push(`https://www.google.com/s2/favicons?domain=${host}&sz=64`)
  candidates.push(`https://icon.horse/icon/${host}`)

  return candidates
}

export function faviconFor(url: string, customIconUrl?: string): string {
  if (customIconUrl) return customIconUrl
  const candidates = getFaviconCandidates(url)
  return candidates[0] || ''
}

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

/** Pure page-title parsing. All network access goes through safe-metadata-fetch.ts. */
function decodeHtmlEntities(str: string): string {
  if (!str) return ''
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16))
      } catch {
        return ''
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10))
      } catch {
        return ''
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&bull;/g, '•')
    .replace(/&middot;/g, '·')
    .replace(/&hellip;/g, '…')
}


function isBlockerTitle(title: string): boolean {
  if (!title) return true
  const lower = title.toLowerCase().trim()
  const blockers = [
    'just a moment...',
    'attention required! | cloudflare',
    'attention required',
    'checking your browser...',
    'please wait... | cloudflare',
    'please wait',
    'access denied',
    '403 forbidden',
    '404 not found',
    '500 internal server error',
    '502 bad gateway',
    '503 service temporarily unavailable',
    '504 gateway timeout',
    'ddos-guard',
    'security check',
    'shieldsquare captcha',
    'cloudflare',
    'challenge validation',
    'blocked',
    'waf',
    'robot check',
    'security challenge',
    'one moment, please',
  ]
  return blockers.some((b) => lower === b || lower.startsWith(`${b} -`) || lower.startsWith(`${b}:`) || lower.endsWith(`| ${b}`))
}

function extractEmbeddedLogoTitle(html: string): string {
  if (!html) return ''
  const b64Matches = html.matchAll(/data:image\/svg\+xml;base64,([a-zA-Z0-9+/=]+)/g)
  for (const m of b64Matches) {
    try {
      const decoded = atob(m[1])
      const svgTitleMatch = decoded.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      if (svgTitleMatch && svgTitleMatch[1].trim()) {
        const clean = svgTitleMatch[1].replace(/\s*logo$/i, '').trim()
        if (clean && !isBlockerTitle(clean)) {
          return decodeHtmlEntities(clean)
        }
      }
    } catch {}
  }
  return ''
}

export function extractTitleFromHtml(html: string): string {
  if (!html) return ''
  // 1. <title> 标签
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  let raw = titleMatch ? titleMatch[1] : ''

  // 2. OpenGraph og:title 回退
  if (!raw.trim() || isBlockerTitle(raw)) {
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i)
    if (ogMatch && !isBlockerTitle(ogMatch[1])) raw = ogMatch[1]
  }

  // 3. Twitter Card title 回退
  if (!raw.trim() || isBlockerTitle(raw)) {
    const twMatch =
      html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']twitter:title["']/i)
    if (twMatch && !isBlockerTitle(twMatch[1])) raw = twMatch[1]
  }

  // 4. 标准 meta[name="title"] 回退
  if (!raw.trim() || isBlockerTitle(raw)) {
    const metaTitleMatch =
      html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']title["']/i)
    if (metaTitleMatch && !isBlockerTitle(metaTitleMatch[1])) raw = metaTitleMatch[1]
  }

  // 5. 检查嵌入的 SVG Logo（如 Cloudflare 盾页面嵌入的官方网站品牌名）
  if (!raw.trim() || isBlockerTitle(raw)) {
    const logoTitle = extractEmbeddedLogoTitle(html)
    if (logoTitle) raw = logoTitle
  }

  const cleaned = decodeHtmlEntities(raw.replace(/\s+/g, ' ').trim())
  return isBlockerTitle(cleaned) ? '' : cleaned
}

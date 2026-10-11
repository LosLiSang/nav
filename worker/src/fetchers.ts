/**
 * 图标与网页标题抓取（公开接口）。
 * 与鉴权/用户体系无关，CORS 由上层 Hono 中间件统一添加。
 */

const MULTI_PART_TLDS = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.uk', 'org.uk', 'com.hk', 'co.jp', 'com.tw', 'com.au',
])

function getDomainCandidates(rawDomain: string): string[] {
  const clean = rawDomain.trim().toLowerCase().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0]
  if (!clean) return []
  const parts = clean.split('.')
  if (parts.length <= 2) return [clean]

  const candidates = [clean]
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.')
    const remaining = parts.slice(i)
    const suffix2 = remaining.slice(-2).join('.')
    if (MULTI_PART_TLDS.has(suffix2)) {
      if (remaining.length <= 2) break
    } else {
      if (remaining.length <= 1) break
    }
    candidates.push(candidate)
  }
  return [...new Set(candidates)]
}

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


async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 4000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timer)
  }
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

function extractTitleFromHtml(html: string): string {
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

async function fetchSearchIndexTitle(hostname: string): Promise<string> {
  if (!hostname) return ''
  const searchUrls = [
    `https://html.duckduckgo.com/html/?q=site%3A${encodeURIComponent(hostname)}`,
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(hostname)}`,
  ]
  for (const sUrl of searchUrls) {
    try {
      const res = await fetch(sUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        cf: { cacheTtl: 2592000, cacheEverything: true },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const text = await res.text()
        const match = text.match(/<a[^>]+class=["']result__a["'][^>]*>([\s\S]*?)<\/a>/i)
        if (match && match[1]) {
          const raw = match[1].replace(/<[^>]+>/g, '').trim()
          const decoded = decodeHtmlEntities(raw)
          if (decoded && !isBlockerTitle(decoded)) {
            return decoded
          }
        }
      }
    } catch {}
  }
  return ''
}

function formatDomainTitle(hostname: string): string {
  if (!hostname) return ''
  const clean = hostname.replace(/^www\./i, '').toLowerCase()
  const map: Record<string, string> = {
    'linux.do': 'LINUX DO',
    'github.com': 'GitHub',
    'gitlab.com': 'GitLab',
    'v2ex.com': 'V2EX',
    'zhihu.com': '知乎',
    'bilibili.com': '哔哩哔哩',
    'youtube.com': 'YouTube',
    'google.com': 'Google',
    'baidu.com': '百度',
    'juejin.cn': '稀土掘金',
    'csdn.net': 'CSDN',
    'weibo.com': '微博',
    'x.com': 'X (Twitter)',
    'twitter.com': 'Twitter',
  }
  if (map[clean]) return map[clean]
  const parts = clean.split('.')
  if (parts.length >= 2) {
    const main = parts[0]
    return main.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  return clean
}

export async function iconResponse(url: URL): Promise<Response> {
  const rawDomain = url.searchParams.get('domain')
  if (!rawDomain) {
    return new Response('Missing domain', { status: 400 })
  }
  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'
  const candidates = getDomainCandidates(rawDomain)
  const cfOptions = force
    ? { cacheTtl: 0 }
    : { cacheTtl: 2592000, cacheEverything: true }
  const fetchHeaders: HeadersInit = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(force ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {}),
  }

  for (const domain of candidates) {
    // 1. 直连目标站点根目录 (HTTPS / HTTP)
    for (const proto of ['https', 'http']) {
      try {
        const targetUrl = `${proto}://${domain}/favicon.ico`
        const res = await fetchWithTimeout(targetUrl, {
          headers: fetchHeaders,
          cf: cfOptions,
        }, 3000)
        const ct = (res.headers.get('content-type') || '').toLowerCase()
        if (res.ok && !ct.includes('text/html')) {
          const buf = await res.arrayBuffer()
          if (buf.byteLength > 50) {
            const contentType = res.headers.get('content-type') || 'image/x-icon'
            return new Response(buf, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
              },
            })
          }
        }
      } catch {}
    }

    // 2. DuckDuckGo (高可用全球图标源，带占位图过滤)
    try {
      const ddgRes = await fetchWithTimeout(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
        headers: fetchHeaders,
        cf: cfOptions,
      }, 3000)
      const ddgCt = (ddgRes.headers.get('content-type') || '').toLowerCase()
      if (ddgRes.ok && !ddgCt.includes('text/html')) {
        const buf = await ddgRes.arrayBuffer()
        const isPlaceholder =
          buf.byteLength === 1478 ||
          buf.byteLength === 1444 ||
          buf.byteLength === 726 ||
          buf.byteLength === 519 ||
          buf.byteLength < 50
        if (!isPlaceholder) {
          const contentType = ddgRes.headers.get('content-type') || 'image/png'
          return new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
            },
          })
        }
      }
    } catch {}

    // 3. Google Favicon S2 (标准 64px 源)
    try {
      const gRes = await fetchWithTimeout(
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        {
          headers: fetchHeaders,
          cf: cfOptions,
        },
        3000
      )
      const gCt = (gRes.headers.get('content-type') || '').toLowerCase()
      if (gRes.ok && !gCt.includes('text/html')) {
        const buf = await gRes.arrayBuffer()
        const isPlaceholder =
          buf.byteLength === 726 ||
          buf.byteLength === 519 ||
          buf.byteLength === 1150 ||
          buf.byteLength === 1478 ||
          buf.byteLength === 1444 ||
          buf.byteLength < 50
        if (!isPlaceholder) {
          const contentType = gRes.headers.get('content-type') || 'image/png'
          return new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
            },
          })
        }
      }
    } catch {}

    // 4. Unavatar 高清源
    try {
      const uRes = await fetchWithTimeout(`https://unavatar.io/${domain}?fallback=false`, {
        headers: fetchHeaders,
        cf: cfOptions,
      }, 3000)
      const uCt = (uRes.headers.get('content-type') || '').toLowerCase()
      if (uRes.ok && !uCt.includes('text/html')) {
        const buf = await uRes.arrayBuffer()
        if (buf.byteLength > 50) {
          const contentType = uRes.headers.get('content-type') || 'image/png'
          return new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
            },
          })
        }
      }
    } catch {}

    // 5. Favicon.im
    try {
      const fimRes = await fetchWithTimeout(`https://favicon.im/${domain}`, {
        headers: fetchHeaders,
        cf: cfOptions,
      }, 3000)
      const fimCt = (fimRes.headers.get('content-type') || '').toLowerCase()
      if (fimRes.ok && !fimCt.includes('text/html')) {
        const buf = await fimRes.arrayBuffer()
        if (buf.byteLength > 300) {
          return new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': 'image/png',
              'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
            },
          })
        }
      }
    } catch {}
  }

  return new Response('Not found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

export async function titleResponse(url: URL): Promise<Response> {
  const rawTargetUrl = url.searchParams.get('url')
  if (!rawTargetUrl) {
    return Response.json({ ok: false, error: 'missing_url' }, { status: 400 })
  }

  const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'
  let targetUrl = rawTargetUrl.trim()
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`
  }

  let hostname = ''
  try {
    hostname = new URL(targetUrl).hostname
  } catch {
    return Response.json({ ok: false, error: 'invalid_url' }, { status: 400 })
  }

  const cfOptions = force
    ? { cacheTtl: 0 }
    : { cacheTtl: 2592000, cacheEverything: true }

  const fetchHeaders: HeadersInit = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    ...(force ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {}),
  }

  let title = ''

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(targetUrl, {
      headers: fetchHeaders,
      cf: cfOptions,
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    let buffer: Uint8Array = new Uint8Array(0)
    if (res.body) {
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let totalBytes = 0
      const MAX_BYTES = 128 * 1024

      while (totalBytes < MAX_BYTES) {
        const { done, value } = await reader.read()
        if (done || !value) break
        chunks.push(value)
        totalBytes += value.byteLength
        const quickText = new TextDecoder('ascii').decode(value)
        if (/<\/head>/i.test(quickText)) {
          break
        }
      }
      try { await reader.cancel() } catch {}

      buffer = new Uint8Array(totalBytes)
      let offset = 0
      for (const chunk of chunks) {
        buffer.set(chunk, offset)
        offset += chunk.byteLength
      }
    } else {
      buffer = new Uint8Array(await res.arrayBuffer())
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    let charset = 'utf-8'
    const headerCharsetMatch = contentType.match(/charset=([a-zA-Z0-9_-]+)/i)
    if (headerCharsetMatch) {
      charset = headerCharsetMatch[1].toLowerCase()
    } else {
      const asciiPreview = new TextDecoder('ascii').decode(buffer.slice(0, 2048))
      const metaCharsetMatch =
        asciiPreview.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i) ||
        asciiPreview.match(/<meta[^>]+http-equiv=["']?Content-Type["'][^>]+content=["'][^"']*charset=([a-zA-Z0-9_-]+)/i)
      if (metaCharsetMatch) {
        charset = metaCharsetMatch[1].toLowerCase()
      }
    }

    if (charset === 'gb2312') charset = 'gbk'

    let htmlText = ''
    try {
      htmlText = new TextDecoder(charset).decode(buffer)
    } catch {
      htmlText = new TextDecoder('utf-8').decode(buffer)
    }

    title = extractTitleFromHtml(htmlText)
  } catch {}

  // 若直接抓取返回空白或反爬盾且未提取到 Logo，调用搜索引擎收录回退
  if (!title && hostname) {
    title = await fetchSearchIndexTitle(hostname)
  }

  // 终极保底：规范化域名提取
  if (!title && hostname) {
    title = formatDomainTitle(hostname)
  }

  return new Response(JSON.stringify({ title }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
    },
  })
}

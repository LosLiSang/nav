import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

function localIconProxyPlugin(): Plugin {
  const cache = new Map<string, { buffer: Buffer; contentType: string }>()

  const MULTI_PART_TLDS = new Set([
    'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
    'co.uk', 'org.uk', 'com.hk', 'co.jp', 'com.tw', 'com.au'
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

  async function fetchBuffer(url: string, timeoutSec = 4): Promise<{ buffer: Buffer; code: number }> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(timeoutSec * 1000),
        redirect: 'follow',
      })
      if (!res.ok) return { buffer: Buffer.alloc(0), code: res.status }
      const arrayBuf = await res.arrayBuffer()
      return { buffer: Buffer.from(arrayBuf), code: 0 }
    } catch {
      return { buffer: Buffer.alloc(0), code: 1 }
    }
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

  function extractTitleFromHtml(html: string): string {
    if (!html) return ''
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    let raw = titleMatch ? titleMatch[1] : ''

    if (!raw.trim()) {
      const ogMatch =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i)
      if (ogMatch) raw = ogMatch[1]
    }

    if (!raw.trim()) {
      const twMatch =
        html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']twitter:title["']/i)
      if (twMatch) raw = twMatch[1]
    }

    if (!raw.trim()) {
      const metaTitleMatch =
        html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']*)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']title["']/i)
      if (metaTitleMatch) raw = metaTitleMatch[1]
    }

    return decodeHtmlEntities(raw.replace(/\s+/g, ' ').trim())
  }

  return {
    name: 'local-icon-proxy',
    configureServer(server) {
      server.middlewares.use('/api/icon', async (req, res) => {
        const urlObj = new URL(req.url || '', 'http://127.0.0.1:5173')
        const rawDomain = urlObj.searchParams.get('domain')
        if (!rawDomain) {
          res.statusCode = 400
          res.end('Missing domain')
          return
        }

        const force = urlObj.searchParams.get('force') === '1' || urlObj.searchParams.get('force') === 'true'
        if (force) {
          cache.delete(rawDomain)
        }

        const cached = cache.get(rawDomain)
        if (cached && !force) {
          res.setHeader('Content-Type', cached.contentType)
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.end(cached.buffer)
          return
        }

        const candidates = getDomainCandidates(rawDomain)
        for (const domain of candidates) {
          // 1. Direct target site
          for (const proto of ['https', 'http']) {
            const { buffer, code } = await fetchBuffer(`${proto}://${domain}/favicon.ico`, 3)
            const textPreview = buffer.slice(0, 200).toString('utf-8').toLowerCase()
            if (code === 0 && buffer.length > 50 && !textPreview.includes('<html') && !textPreview.includes('<!doctype')) {
              const contentType = 'image/x-icon'
              cache.set(rawDomain, { buffer, contentType })
              res.setHeader('Content-Type', contentType)
              res.setHeader('Cache-Control', force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400')
              res.end(buffer)
              return
            }
          }

          // 2. DuckDuckGo
          const { buffer: ddgBuf, code: ddgCode } = await fetchBuffer(`https://icons.duckduckgo.com/ip3/${domain}.ico`, 3)
          const isPlaceholder =
            ddgBuf.length === 1478 || ddgBuf.length === 1444 || ddgBuf.length === 726 || ddgBuf.length === 519 || ddgBuf.length === 1150
          if (ddgCode === 0 && ddgBuf.length > 100 && !isPlaceholder) {
            const contentType = 'image/x-icon'
            cache.set(rawDomain, { buffer: ddgBuf, contentType })
            res.setHeader('Content-Type', contentType)
            res.setHeader('Cache-Control', force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400')
            res.end(ddgBuf)
            return
          }

          // 3. Google S2
          const { buffer: gBuf, code: gCode } = await fetchBuffer(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`, 3)
          const isGPlaceholder =
            gBuf.length === 726 || gBuf.length === 519 || gBuf.length === 1150 || gBuf.length === 1478
          if (gCode === 0 && gBuf.length > 100 && !isGPlaceholder) {
            const contentType = 'image/png'
            cache.set(rawDomain, { buffer: gBuf, contentType })
            res.setHeader('Content-Type', contentType)
            res.setHeader('Cache-Control', force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400')
            res.end(gBuf)
            return
          }
        }

        res.statusCode = 404
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.end('Not found')
      })

      // API to fetch website title (支持 /api/title 与 /api/fetch-title)
      const handleTitleApi = async (req: any, res: any) => {
        const urlObj = new URL(req.url || '', 'http://127.0.0.1:5173')
        const targetUrl = urlObj.searchParams.get('url')
        if (!targetUrl) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'Missing url' }))
          return
        }

        const normalized = /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`
        try {
          const response = await fetch(normalized, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            signal: AbortSignal.timeout(8000),
            redirect: 'follow',
          })

          const contentType = (response.headers.get('content-type') || '').toLowerCase()
          const arrayBuf = await response.arrayBuffer()
          const buffer = Buffer.from(arrayBuf)

          let charset = 'utf-8'
          const headerCharsetMatch = contentType.match(/charset=([a-zA-Z0-9_-]+)/i)
          if (headerCharsetMatch) {
            charset = headerCharsetMatch[1].toLowerCase()
          } else {
            const asciiPreview = buffer.slice(0, 2048).toString('ascii')
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
            htmlText = buffer.toString('utf-8')
          }

          const title = extractTitleFromHtml(htmlText)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ title }))
        } catch (err: any) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ title: '', error: err?.message || 'fetch_failed' }))
        }
      }

      server.middlewares.use('/api/title', handleTitleApi)
      server.middlewares.use('/api/fetch-title', handleTitleApi)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), localIconProxyPlugin()],
})

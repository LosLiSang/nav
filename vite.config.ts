import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { spawn } from 'child_process'

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

  function fetchCurl(url: string, timeoutSec = 4): Promise<{ buffer: Buffer; code: number }> {
    return new Promise((resolve) => {
      const curl = spawn('curl.exe', [
        '-x',
        'http://127.0.0.1:7890',
        '--connect-timeout',
        '2',
        '--max-time',
        String(timeoutSec),
        '-s',
        '-L',
        url,
      ])
      const chunks: Buffer[] = []
      curl.stdout.on('data', (d) => chunks.push(d))
      curl.on('close', (code) => {
        resolve({ buffer: Buffer.concat(chunks), code: code ?? 1 })
      })
      curl.on('error', () => {
        resolve({ buffer: Buffer.concat(chunks), code: 1 })
      })
    })
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
            const { buffer, code } = await fetchCurl(`${proto}://${domain}/favicon.ico`, 3)
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
          const { buffer: ddgBuf, code: ddgCode } = await fetchCurl(`https://icons.duckduckgo.com/ip3/${domain}.ico`, 3)
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
          const { buffer: gBuf, code: gCode } = await fetchCurl(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`, 3)
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

      // API to fetch website title
      server.middlewares.use('/api/fetch-title', (req, res) => {
        const urlObj = new URL(req.url || '', 'http://127.0.0.1:5173')
        const targetUrl = urlObj.searchParams.get('url')
        if (!targetUrl) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing url' }))
          return
        }

        const normalized = /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`
        const curl = spawn('curl.exe', [
          '-x',
          'http://127.0.0.1:7890',
          '--connect-timeout',
          '4',
          '--max-time',
          '10',
          '-s',
          '-L',
          '-H',
          'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          normalized,
        ])

        const chunks: Buffer[] = []
        let finished = false
        function sendTitle(rawTitle: string) {
          if (finished) return
          finished = true
          try { curl.kill() } catch {}
          let title = rawTitle.replace(/\s+/g, ' ')
          title = title
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ title }))
        }

        curl.stdout.on('data', (d) => {
          if (finished) return
          chunks.push(d)
          const text = Buffer.concat(chunks).toString('utf-8')
          const m = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
          if (m) {
            sendTitle(m[1].trim())
          }
        })
        curl.on('close', () => {
          if (!finished) {
            sendTitle('')
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), localIconProxyPlugin()],
})

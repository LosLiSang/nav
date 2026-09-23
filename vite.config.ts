import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { spawn } from 'child_process'

function localIconProxyPlugin(): Plugin {
  const cache = new Map<string, { buffer: Buffer; contentType: string }>()

  return {
    name: 'local-icon-proxy',
    configureServer(server) {
      server.middlewares.use('/api/icon', (req, res) => {
        const urlObj = new URL(req.url || '', 'http://127.0.0.1:5173')
        const domain = urlObj.searchParams.get('domain')
        if (!domain) {
          res.statusCode = 400
          res.end('Missing domain')
          return
        }

        const cached = cache.get(domain)
        if (cached) {
          res.setHeader('Content-Type', cached.contentType)
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.end(cached.buffer)
          return
        }

        // Fetch via local proxy 127.0.0.1:7890
        const ddgUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`
        const curl = spawn('curl.exe', [
          '-x',
          'http://127.0.0.1:7890',
          '--connect-timeout',
          '2',
          '--max-time',
          '4',
          '-s',
          '-L',
          ddgUrl,
        ])

        const chunks: Buffer[] = []
        curl.stdout.on('data', (d) => chunks.push(d))
        curl.on('close', (code) => {
          const buf = Buffer.concat(chunks)
          const isPlaceholder =
            buf.length === 1478 || buf.length === 1444 || buf.length === 726 || buf.length === 519 || buf.length === 1150
          if (code === 0 && buf.length > 100 && !isPlaceholder) {
            const contentType = 'image/x-icon'
            cache.set(domain, { buffer: buf, contentType })
            res.setHeader('Content-Type', contentType)
            res.setHeader('Cache-Control', 'public, max-age=86400')
            res.end(buf)
          } else {
            // Fallback to Google Favicon via 127.0.0.1:7890
            const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
            const curlGoogle = spawn('curl.exe', [
              '-x',
              'http://127.0.0.1:7890',
              '--connect-timeout',
              '2',
              '--max-time',
              '4',
              '-s',
              '-L',
              googleUrl,
            ])
            const gChunks: Buffer[] = []
            curlGoogle.stdout.on('data', (d) => gChunks.push(d))
            curlGoogle.on('close', (gCode) => {
              const gBuf = Buffer.concat(gChunks)
              const isGPlaceholder =
                gBuf.length === 726 || gBuf.length === 519 || gBuf.length === 1150 || gBuf.length === 1478
              if (gCode === 0 && gBuf.length > 100 && !isGPlaceholder) {
                const contentType = 'image/png'
                cache.set(domain, { buffer: gBuf, contentType })
                res.setHeader('Content-Type', contentType)
                res.setHeader('Cache-Control', 'public, max-age=86400')
                res.end(gBuf)
              } else {
                res.statusCode = 404
                res.end('Not found')
              }
            })
          }
        })
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

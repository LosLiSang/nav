/**
 * nav-sync —— 个人导航页的远程数据服务（Cloudflare Worker + D1 / 托管 SQLite）
 *
 * 设计要点：
 * 1. 单行文档模型。整个导航页快照（分类/书签/备忘录/TOTP/外观设置）序列化成
 *    一个 JSON 存在 nav_docs 里，写入是原子的，不需要增量 diff。
 * 2. 冲突策略是 last-write-wins，但拒绝静默覆盖：客户端的 updatedAt 不比服务端
 *    新时返回 409 并把服务端当前版本一起带回去，由前端决定用哪边。
 * 3. 鉴权用 Authorization: Bearer <SYNC_TOKEN>。token 只存在于 Worker secret 和
 *    用户自己浏览器的 localStorage 里，从不写进仓库。
 * 4. 没配 SYNC_TOKEN 时直接 500 拒绝服务（fail closed），不会变成公开数据库。
 */

type D1PreparedLike = {
  bind(...values: unknown[]): D1PreparedLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
}

type D1Like = {
  prepare(query: string): D1PreparedLike
}

type Env = {
  DB: D1Like
  SYNC_TOKEN?: string
  ALLOWED_ORIGIN?: string
}

const DOC_ID = 'default'
const MAX_BODY_BYTES = 4 * 1024 * 1024

type DocRow = {
  doc: string
  updated_at: number
  rev: number
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGIN || '*'
  const origin = request.headers.get('Origin')
  const allowOrigin = allowed === '*' ? '*' : origin === allowed ? allowed : allowed

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(
  body: unknown,
  status: number,
  request: Request,
  env: Env,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
    },
  })
}

/** 定长比较，避免 token 校验提前 return 泄露前缀长度信息 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function authorized(request: Request, env: Env): boolean {
  const expected = (env.SYNC_TOKEN || '').trim()
  if (!expected) return false

  const header = request.headers.get('Authorization') || ''
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (!match) return false
  return safeEqual(match[1].trim(), expected)
}

async function readRow(env: Env): Promise<DocRow | null> {
  return env.DB.prepare(
    'SELECT doc, updated_at, rev FROM nav_docs WHERE id = ?',
  )
    .bind(DOC_ID)
    .first<DocRow>()
}

function parseDoc(row: DocRow | null): unknown {
  if (!row) return null
  try {
    return JSON.parse(row.doc)
  } catch {
    return null
  }
}

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

function extractTitleFromHtml(html: string): string {
  if (!html) return ''
  // 1. <title> 标签
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  let raw = titleMatch ? titleMatch[1] : ''

  // 2. OpenGraph og:title 回退
  if (!raw.trim()) {
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i)
    if (ogMatch) raw = ogMatch[1]
  }

  // 3. Twitter Card title 回退
  if (!raw.trim()) {
    const twMatch =
      html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']twitter:title["']/i)
    if (twMatch) raw = twMatch[1]
  }

  // 4. 标准 meta[name="title"] 回退
  if (!raw.trim()) {
    const metaTitleMatch =
      html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']title["']/i)
    if (metaTitleMatch) raw = metaTitleMatch[1]
  }

  return decodeHtmlEntities(raw.replace(/\s+/g, ' ').trim())
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) })
    }

    // 健康检查：不鉴权，但也不泄露任何数据
    if (url.pathname === '/' && request.method === 'GET') {
      return json(
        {
          ok: true,
          service: 'nav-sync',
          configured: Boolean((env.SYNC_TOKEN || '').trim()),
          endpoints: [
            'GET /api/data',
            'PUT /api/data',
            'GET /api/icon?domain=',
            'GET /api/title?url=',
          ],
        },
        200,
        request,
        env,
      )
    }

   // 图标代理：利用 Cloudflare 边缘节点代理抓取并免费缓存 30 天，无并发与速率限制
   if (url.pathname === '/api/icon' && request.method === 'GET') {
      const rawDomain = url.searchParams.get('domain')
      if (!rawDomain) {
        return new Response('Missing domain', { status: 400, headers: corsHeaders(request, env) })
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
            const res = await fetch(targetUrl, {
              headers: fetchHeaders,
              cf: cfOptions,
            })
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
                    ...corsHeaders(request, env),
                  },
                })
              }
            }
          } catch {}
        }

        // 2. Google Favicon S2 (针对海外服务及各类子域名)
        try {
          const gRes = await fetch(
            `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=64`,
            {
              headers: fetchHeaders,
              cf: cfOptions,
            },
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
                  ...corsHeaders(request, env),
                },
              })
            }
          }
        } catch {}

        // 3. Unavatar 高清源
        try {
          const uRes = await fetch(`https://unavatar.io/${domain}?fallback=false`, {
            headers: fetchHeaders,
            cf: cfOptions,
          })
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
                  ...corsHeaders(request, env),
                },
              })
            }
          }
        } catch {}

        // 4. DuckDuckGo (带占位图字节过滤)
        try {
          const ddgRes = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
            headers: fetchHeaders,
            cf: cfOptions,
          })
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
              return new Response(buf, {
                status: 200,
                headers: {
                  'Content-Type': 'image/x-icon',
                  'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
                  ...corsHeaders(request, env),
                },
              })
            }
          }
        } catch {}

        // 5. Favicon.im
        try {
          const fimRes = await fetch(`https://favicon.im/${domain}`, {
            headers: fetchHeaders,
            cf: cfOptions,
          })
          const fimCt = (fimRes.headers.get('content-type') || '').toLowerCase()
          if (fimRes.ok && !fimCt.includes('text/html')) {
            const buf = await fimRes.arrayBuffer()
            if (buf.byteLength > 300) {
              return new Response(buf, {
                status: 200,
                headers: {
                  'Content-Type': 'image/png',
                  'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
                  ...corsHeaders(request, env),
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
          ...corsHeaders(request, env),
        },
      })
    }

    // 网页标题抓取：利用 Cloudflare 边缘节点代理抓取并免费缓存 30 天，无并发与速率限制
    if ((url.pathname === '/api/title' || url.pathname === '/api/fetch-title') && request.method === 'GET') {
      const rawTargetUrl = url.searchParams.get('url')
      if (!rawTargetUrl) {
        return json({ ok: false, error: 'missing_url' }, 400, request, env)
      }

      const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'
      let targetUrl = rawTargetUrl.trim()
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`
      }

      try {
        new URL(targetUrl)
      } catch {
        return json({ ok: false, error: 'invalid_url' }, 400, request, env)
      }

      const cfOptions = force
        ? { cacheTtl: 0 }
        : { cacheTtl: 2592000, cacheEverything: true }

      const fetchHeaders: HeadersInit = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...(force ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {}),
      }

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

        if (!res.ok) {
          return new Response(JSON.stringify({ title: '', error: `HTTP ${res.status}` }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              ...corsHeaders(request, env),
            },
          })
        }

        const contentType = (res.headers.get('content-type') || '').toLowerCase()
        if (
          contentType &&
          !contentType.includes('text/html') &&
          !contentType.includes('application/xhtml+xml') &&
          !contentType.includes('text/plain') &&
          !contentType.includes('application/xml')
        ) {
          return new Response(JSON.stringify({ title: '' }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
              ...corsHeaders(request, env),
            },
          })
        }

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

        const title = extractTitleFromHtml(htmlText)

        return new Response(JSON.stringify({ title }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': force ? 'no-cache, no-store, must-revalidate' : 'public, max-age=2592000',
            ...corsHeaders(request, env),
          },
        })
      } catch (err: any) {
        return new Response(JSON.stringify({ title: '', error: err?.message || 'fetch_failed' }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            ...corsHeaders(request, env),
          },
        })
      }
    }

    if (url.pathname !== '/api/data') {
      return json({ ok: false, error: 'not_found' }, 404, request, env)
    }

    if (!(env.SYNC_TOKEN || '').trim()) {
      return json(
        { ok: false, error: 'server_not_configured', hint: 'run: npx wrangler secret put SYNC_TOKEN' },
        500,
        request,
        env,
      )
    }

    if (!authorized(request, env)) {
      return json({ ok: false, error: 'unauthorized' }, 401, request, env)
    }

    if (request.method === 'GET') {
      const row = await readRow(env)
      return json(
        {
          ok: true,
          doc: parseDoc(row),
          updatedAt: row?.updated_at ?? 0,
          rev: row?.rev ?? 0,
        },
        200,
        request,
        env,
      )
    }

    if (request.method === 'PUT') {
      const raw = await request.text()
      if (raw.length > MAX_BODY_BYTES) {
        return json({ ok: false, error: 'payload_too_large' }, 413, request, env)
      }

      let payload: {
        doc?: unknown
        updatedAt?: unknown
        expectedUpdatedAt?: unknown
        force?: unknown
      }
      try {
        payload = JSON.parse(raw)
      } catch {
        return json({ ok: false, error: 'invalid_json' }, 400, request, env)
      }

      if (!payload.doc || typeof payload.doc !== 'object') {
        return json({ ok: false, error: 'missing_doc' }, 400, request, env)
      }

      const current = await readRow(env)
      const now = Date.now()
      const incoming =
        typeof payload.updatedAt === 'number' && Number.isFinite(payload.updatedAt)
          ? payload.updatedAt
          : now
      const force = payload.force === true
      const expected =
        typeof payload.expectedUpdatedAt === 'number' &&
        Number.isFinite(payload.expectedUpdatedAt)
          ? payload.expectedUpdatedAt
          : null

      /**
       * 乐观并发：客户端必须声明它是在哪个云端版本的基础上写的。
       * 只要云端已经不是那个版本，说明别的设备推进过数据，就拒绝这次写入并
       * 把当前版本原样返回 —— 由人决定用哪边，而不是让同步逻辑猜。
       * 这一步是「清 cookie 不丢数据」的前提：宁可报冲突，也不能静默覆盖。
       */
      if (current && !force && expected !== null && expected !== current.updated_at) {
        return json(
          {
            ok: false,
            error: 'conflict',
            doc: parseDoc(current),
            updatedAt: current.updated_at,
            rev: current.rev,
          },
          409,
          request,
          env,
        )
      }

      const nextUpdatedAt = current ? Math.max(incoming, current.updated_at + 1) : incoming

      await env.DB.prepare(
        `INSERT INTO nav_docs (id, doc, updated_at, rev, updated_by)
         VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           doc = excluded.doc,
           updated_at = excluded.updated_at,
           rev = nav_docs.rev + 1,
           updated_by = excluded.updated_by`,
      )
        .bind(DOC_ID, JSON.stringify(payload.doc), nextUpdatedAt, request.headers.get('User-Agent') || '')
        .run()

      const saved = await readRow(env)
      return json(
        { ok: true, updatedAt: saved?.updated_at ?? nextUpdatedAt, rev: saved?.rev ?? 1 },
        200,
        request,
        env,
      )
    }

    return json({ ok: false, error: 'method_not_allowed' }, 405, request, env)
  },
}

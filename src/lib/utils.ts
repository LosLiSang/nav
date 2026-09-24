import type { Settings } from '../types'
import { DEFAULT_SYNC_URL, loadSyncConfig } from './sync'

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
  if (!url || typeof url !== 'string') return url
  if (!url.startsWith('data:image/svg+xml')) return url

  try {
    const commaIndex = url.indexOf(',')
    if (commaIndex === -1) return url
    const prefix = url.slice(0, commaIndex + 1)
    let body = url.slice(commaIndex + 1)

    // 反复完全解码直到还原为纯净的 SVG XML 文本
    let decoded = body
    for (let i = 0; i < 5; i++) {
      try {
        const next = decodeURIComponent(decoded)
        if (next === decoded) break
        decoded = next
      } catch {
        break
      }
    }

    // 1. 将在 SVG 属性里错误写成 %23 或 %2523 的颜色代码恢复为真实 # 符号
    decoded = decoded
      .replace(/fill=["']%2523([0-9a-fA-F]+)["']/g, 'fill="#$1"')
      .replace(/fill=["']%23([0-9a-fA-F]+)["']/g, 'fill="#$1"')
      .replace(/stroke=["']%2523([0-9a-fA-F]+)["']/g, 'stroke="#$1"')
      .replace(/stroke=["']%23([0-9a-fA-F]+)["']/g, 'stroke="#$1"')
      .replace(/%2523/g, '#')
      .replace(/%23/g, '#')

    // 2. 将脱离页面的 currentColor 替换为明确的主题橙色
    decoded = decoded.replace(/currentColor/g, '#ea580c')

    // 3. 补全缺失的 xmlns 命名空间
    if (!decoded.includes('xmlns=')) {
      decoded = decoded.replace(/<svg(\s)/i, '<svg xmlns="http://www.w3.org/2000/svg" ')
    }

    // 4. 修复旧版纯黑背景由于 emoji 无法在 img 中渲染而导致整块纯黑的问题
    if (
      decoded.includes('fill="#000000"') ||
      decoded.includes('fill="#171717"') ||
      decoded.includes('fill="#24292e"') ||
      decoded.includes('fill="#333333"')
    ) {
      decoded = decoded
        .replace(/fill="#000000"/g, 'fill="#2563eb"')
        .replace(/fill="#171717"/g, 'fill="#2563eb"')
        .replace(/fill="#24292e"/g, 'fill="#2563eb"')
        .replace(/fill="#333333"/g, 'fill="#2563eb"')
    }

    return `${prefix}${encodeURIComponent(decoded)}`
  } catch {
    return url
  }
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

export function getFaviconCandidates(url: string, customIconUrl?: string, force = false): string[] {
  if (customIconUrl) return [customIconUrl]
  const host = hostnameOf(url)
  if (!host) return []

  const candidates: string[] = []
  const forceParam = force ? `&force=1&_t=${Date.now()}` : ''

  // 1. 本地开发环境走 Vite 代理 (本地同源，无 CORS 限制，自带内存缓存)
  const isLocalEnv =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]')
  if (isLocalEnv) {
    candidates.push(`/api/icon?domain=${host}${forceParam}`)
  }

  // 2. 线上统一走 Cloudflare Worker 图标代理，避免浏览器直连第三方源被限流
  const syncConfig = typeof window !== 'undefined' ? loadSyncConfig() : null
  const workerUrl = syncConfig?.url || DEFAULT_SYNC_URL || ''
  if (workerUrl) {
    candidates.push(`${workerUrl.replace(/\/+$/, '')}/api/icon?domain=${host}${forceParam}`)
  }

  return candidates
}

export function faviconFor(url: string, customIconUrl?: string): string {
  if (customIconUrl) return normalizeIconUrl(customIconUrl) || customIconUrl
  const candidates = getFaviconCandidates(url)
  return candidates[0] || ''
}

/**
 * 抓取目标网站的标题名称（优先使用云端 Cloudflare Worker 代理并享有边缘 30 天缓存；本地开发环境自动 fallback 本地）
 */
export async function fetchWebsiteTitle(rawUrl: string, force = false): Promise<string> {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''
  const normalized = normalizeUrl(trimmed)
  const encodedUrl = encodeURIComponent(normalized)
  const forceParam = force ? '&force=1' : ''

  const candidates: string[] = []

  // 1. 本地开发环境候选
  const isLocalEnv =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]')
  if (isLocalEnv) {
    candidates.push(`/api/title?url=${encodedUrl}${forceParam}`)
    candidates.push(`/api/fetch-title?url=${encodedUrl}${forceParam}`)
  }

  // 2. 线上 Cloudflare Worker 统一代理候选（与 icon 一致，边缘节点全球免翻墙直连与强缓存）
  const syncConfig = typeof window !== 'undefined' ? loadSyncConfig() : null
  const workerUrl = syncConfig?.url || DEFAULT_SYNC_URL || ''
  if (workerUrl) {
    const cleanWorker = workerUrl.replace(/\/+$/, '')
    candidates.push(`${cleanWorker}/api/title?url=${encodedUrl}${forceParam}`)
    candidates.push(`${cleanWorker}/api/fetch-title?url=${encodedUrl}${forceParam}`)
  }

  for (const endpoint of candidates) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 9000)
      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      clearTimeout(timer)
      if (res.ok) {
        const data = await res.json()
        if (data && typeof data.title === 'string' && data.title.trim()) {
          return data.title.trim()
        }
      }
    } catch {
      // 继续尝试下一个候选端点
    }
  }

  return ''
}

// ---------------------------------------------------------------------------
// 全局图标拉取并发队列与平滑节流调度（彻底防止 429 Too Many Requests）
// ---------------------------------------------------------------------------

type QueueTask = () => Promise<void>
const fetchQueue: QueueTask[] = []
let activeFetchCount = 0
const MAX_CONCURRENCY = 3
const DELAY_BETWEEN_TASKS_MS = 60

function processFetchQueue() {
  if (activeFetchCount >= MAX_CONCURRENCY || fetchQueue.length === 0) return

  activeFetchCount++
  const task = fetchQueue.shift()!

  task().finally(() => {
    activeFetchCount--
    setTimeout(processFetchQueue, DELAY_BETWEEN_TASKS_MS)
  })
}

function enqueueFetchTask<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    fetchQueue.push(async () => {
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
    processFetchQueue()
  })
}

/**
 * 方案 A：异步拉取候选源二进制 Blob，带全局并发队列控制（最多同时 3 个连接）
 * 平滑排队调度，彻底消除 50+ 个书签同时发起导致的 429 Too Many Requests 限流
 */
export function fetchFaviconBlob(
  candidates: string[],
  force = false,
): Promise<{ blob: Blob; objectUrl: string } | null> {
  return enqueueFetchTask(async () => {
    for (const url of candidates) {
      if (!url) continue
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        return { blob: new Blob([]), objectUrl: url }
      }
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 6000)
        const res = await fetch(url, {
          signal: controller.signal,
          cache: force ? 'reload' : 'default',
        })
        clearTimeout(timer)

        // 遇到 429 限流时短暂让步重试下一源
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 300))
          continue
        }

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
  })
}

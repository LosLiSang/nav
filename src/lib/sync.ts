import type { NavData, Settings } from '../types'

/**
 * 与 Cloudflare Worker（worker/ 目录）通信的同步层。
 *
 * 分工：
 * - 浏览器 IndexedDB 仍然是「读取最快的那一层」，离线可用、不做改动。
 * - Worker + D1 是「不会因为清 cookie / 换设备而丢」的那一层。
 *
 * token 只存在用户自己浏览器的 localStorage 里，永远不进仓库、不进构建产物。
 */

export type SyncConfig = {
  url: string
  token: string
}

export type RemoteSnapshot = {
  doc: NavData | null
  updatedAt: number
  rev: number
}

export type PushResult =
  | { status: 'ok'; updatedAt: number; rev: number }
  | { status: 'conflict'; doc: NavData | null; updatedAt: number; rev: number }

const CONFIG_KEY = 'nav_sync_config'
const AUTO_KEY = 'nav_sync_auto'
const LOCAL_TS_KEY = 'nav_sync_local_ts'

/**
 * 这些设置项是「这台设备当前看到哪一屏」的 UI 状态，属于本机偏好，
 * 同步过去只会让两台设备互相抢状态，所以推送时剔除。
 */
const DEVICE_LOCAL_SETTINGS: (keyof Settings)[] = [
  'activeCategoryId',
  'activeSubSectionId',
  'activeSubCategoryId',
  'activeWidgetTab',
  'isSortMode',
  'showNotice',
]

const REQUEST_TIMEOUT_MS = 15000

export const DEFAULT_SYNC_URL: string =
  (import.meta.env.VITE_SYNC_URL as string | undefined)?.trim() || 'https://nav-sync.lisang.workers.dev'

/** 允许用户只填 `xxx.workers.dev`，自动补协议、去掉结尾斜杠 */
export function normalizeSyncUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    const url = normalizeSyncUrl(parsed.url || '')
    const token = (parsed.token || '').trim()
    if (!url || !token) return null
    return { url, token }
  } catch {
    return null
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({ url: normalizeSyncUrl(config.url), token: config.token.trim() }),
  )
}

export function clearSyncConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
}

export function loadAutoSync(): boolean {
  return localStorage.getItem(AUTO_KEY) !== '0'
}

export function saveAutoSync(enabled: boolean): void {
  localStorage.setItem(AUTO_KEY, enabled ? '1' : '0')
}

export function loadLocalTimestamp(): number {
  const raw = Number(localStorage.getItem(LOCAL_TS_KEY) || 0)
  return Number.isFinite(raw) ? raw : 0
}

export function saveLocalTimestamp(ts: number): void {
  localStorage.setItem(LOCAL_TS_KEY, String(ts))
}

/** 剔除本机 UI 状态，得到真正需要跨设备一致的那份数据 */
export function stripDeviceLocalSettings(settings: Settings): Settings {
  const next: Settings = { ...settings }
  for (const key of DEVICE_LOCAL_SETTINGS) {
    delete next[key]
  }
  return next
}

/**
 * 生成规范的同步快照：数组顺序固定，保证同一份数据在不同设备上序列化结果一致，
 * 这样「内容到底有没有变过」的判断才成立（否则每次刷新都会被误判成有改动）。
 */
export function buildSyncDoc(data: {
  categories: NavData['categories']
  subSections: NavData['subSections']
  subCategories: NavData['subCategories']
  bookmarks: NavData['bookmarks']
  memos: NavData['memos']
  totpAccounts: NavData['totpAccounts']
  settings: Settings
}): NavData {
  return {
    categories: [...data.categories].sort((a, b) => a.order - b.order),
    subSections: [...data.subSections].sort((a, b) => a.order - b.order),
    subCategories: [...data.subCategories].sort((a, b) => a.order - b.order),
    bookmarks: [...data.bookmarks].sort((a, b) => a.order - b.order),
    memos: [...data.memos].sort((a, b) => a.createdAt - b.createdAt),
    totpAccounts: [...data.totpAccounts].sort((a, b) => a.createdAt - b.createdAt),
    settings: stripDeviceLocalSettings(data.settings),
  }
}

export function syncDocSignature(doc: NavData): string {
  return JSON.stringify(doc)
}

function authHeaders(config: SyncConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  }
}

export function describeSyncError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return '请求超时，检查 Worker 地址能不能访问'
  }
  if (error instanceof TypeError) {
    return '连不上同步服务，检查 Worker 地址 / 网络 / CORS'
  }
  return error instanceof Error ? error.message : String(error)
}

export async function remoteGet(config: SyncConfig): Promise<RemoteSnapshot> {
  const res = await fetch(`${config.url}/api/data`, {
    method: 'GET',
    headers: authHeaders(config),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (res.status === 401) {
    throw new Error('token 不对（服务端拒绝了这个 SYNC_TOKEN）')
  }
  if (!res.ok) {
    throw new Error(`云端返回 HTTP ${res.status}`)
  }

  const body = (await res.json()) as Partial<RemoteSnapshot> & { ok?: boolean }
  return {
    doc: (body.doc as NavData | null) ?? null,
    updatedAt: Number(body.updatedAt) || 0,
    rev: Number(body.rev) || 0,
  }
}

export async function remotePut(
  config: SyncConfig,
  doc: NavData,
  options: { updatedAt: number; expectedUpdatedAt: number; force?: boolean },
): Promise<PushResult> {
  const res = await fetch(`${config.url}/api/data`, {
    method: 'PUT',
    headers: authHeaders(config),
    body: JSON.stringify({
      doc,
      updatedAt: options.updatedAt,
      expectedUpdatedAt: options.expectedUpdatedAt,
      force: options.force === true,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (res.status === 401) {
    throw new Error('token 不对（服务端拒绝了这个 SYNC_TOKEN）')
  }

  if (res.status === 409) {
    const body = (await res.json()) as { doc?: NavData; updatedAt?: number; rev?: number }
    return {
      status: 'conflict',
      doc: body.doc ?? null,
      updatedAt: Number(body.updatedAt) || 0,
      rev: Number(body.rev) || 0,
    }
  }

  if (!res.ok) {
    throw new Error(`云端返回 HTTP ${res.status}`)
  }

  const body = (await res.json()) as { updatedAt?: number; rev?: number }
  return {
    status: 'ok',
    updatedAt: Number(body.updatedAt) || options.updatedAt,
    rev: Number(body.rev) || 0,
  }
}

/** 生成一个足够长的随机 token，方便用户直接拿去 Worker 端设置 */
export function generateSyncToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

import type { NavData, Settings } from '../types'
import { ApiError, apiRequest, currentAccountId, describeApiError } from './auth'

/**
 * 与 Cloudflare Worker（worker/ 目录）通信的同步层。
 *
 * 分工：
 * - 浏览器 IndexedDB 仍然是「读取最快的那一层」，离线可用、不做改动。
 * - Worker + D1 是「不会因为清 cookie / 换设备而丢」的那一层。
 *
 * 鉴权使用 GitHub 登录换来的会话令牌（见 auth.ts），服务端按账号隔离数据。
 */

/** 一次同步请求需要的服务地址与会话令牌 */
export type SyncConfig = {
  url: string
  token: string
}

export type SyncDoc = Omit<NavData, 'memos'> & { memos?: NavData['memos'] }
export type RemoteSnapshot = {
  doc: SyncDoc | null
  updatedAt: number
  rev: number
}

export type PushResult =
  | { status: 'ok'; updatedAt: number; rev: number }
  | { status: 'conflict'; doc: SyncDoc | null; updatedAt: number; rev: number }

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

export { DEFAULT_SYNC_URL, normalizeSyncUrl } from './sync-url'

export function loadAutoSync(): boolean {
  return localStorage.getItem(AUTO_KEY) !== '0'
}

export function saveAutoSync(enabled: boolean): void {
  localStorage.setItem(AUTO_KEY, enabled ? '1' : '0')
}

/** 本机数据对应的云端版本号按账号分开记录，账号之间互不影响 */
function localTimestampKey(): string {
  const account = currentAccountId()
  return account ? `${LOCAL_TS_KEY}:${account}` : LOCAL_TS_KEY
}

export function loadLocalTimestamp(): number {
  const raw = Number(localStorage.getItem(localTimestampKey()) || 0)
  return Number.isFinite(raw) ? raw : 0
}

export function saveLocalTimestamp(ts: number): void {
  localStorage.setItem(localTimestampKey(), String(ts))
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
  memos?: NavData['memos']
  totpAccounts: NavData['totpAccounts']
  settings: Settings
}): SyncDoc {
  return {
    categories: [...data.categories].sort((a, b) => a.order - b.order),
    subSections: [...data.subSections].sort((a, b) => a.order - b.order),
    subCategories: [...data.subCategories].sort((a, b) => a.order - b.order),
    bookmarks: [...data.bookmarks].sort((a, b) => a.order - b.order),
    totpAccounts: [...data.totpAccounts].sort((a, b) => a.createdAt - b.createdAt),
    settings: stripDeviceLocalSettings(data.settings),
  }
}

export function syncDocSignature(doc: SyncDoc): string {
  return JSON.stringify(doc)
}

export function describeSyncError(error: unknown): string {
  return describeApiError(error)
}

export async function remoteGet(config: SyncConfig): Promise<RemoteSnapshot> {
  const body = await apiRequest<Partial<RemoteSnapshot>>(config.url, '/api/data', { token: config.token })
  return {
    doc: (body.doc as SyncDoc | null) ?? null,
    updatedAt: Number(body.updatedAt) || 0,
    rev: Number(body.rev) || 0,
  }
}

export async function remotePut(
  config: SyncConfig,
  doc: SyncDoc,
  options: { updatedAt: number; expectedUpdatedAt: number; force?: boolean },
): Promise<PushResult> {
  try {
    const body = await apiRequest<{ updatedAt?: number; rev?: number }>(config.url, '/api/data', {
      method: 'PUT',
      token: config.token,
      body: {
        doc,
        updatedAt: options.updatedAt,
        expectedUpdatedAt: options.expectedUpdatedAt,
        force: options.force === true,
      },
    })
    return { status: 'ok', updatedAt: Number(body.updatedAt) || options.updatedAt, rev: Number(body.rev) || 0 }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const body = error.body as { doc?: SyncDoc; updatedAt?: number; rev?: number }
      return {
        status: 'conflict',
        doc: body.doc ?? null,
        updatedAt: Number(body.updatedAt) || 0,
        rev: Number(body.rev) || 0,
      }
    }
    throw error
  }
}

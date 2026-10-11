/**
 * 账号会话（#9）。
 *
 * - 登录走 GitHub OAuth：跳到 Worker 的 /auth/github/start，回来时地址栏 fragment 带一次性
 *   login_code，前端立刻用它换会话令牌并清掉 fragment。
 * - 会话令牌放 localStorage，请求时以 Authorization: Bearer 发送。Worker 只存它的哈希。
 * - 本模块只依赖浏览器 API，不引用 db / store，可以在应用加载前使用。
 */

import { DEFAULT_SYNC_URL, normalizeSyncUrl } from './sync-url'

export type Role = 'admin' | 'user'
export type AccountStatus = 'pending' | 'active' | 'disabled'

export type AccountUser = {
  id: string
  login: string
  name: string | null
  avatarUrl: string | null
  role: Role
  status: AccountStatus
  createdAt: number
  lastLoginAt: number
}

export type Session = {
  url: string
  token: string
  expiresAt: number
  user: AccountUser
}

export type LegacyState = { exists: boolean; claimed: boolean; claimedAt: number | null }

const SESSION_KEY = 'nav_session'
const SERVER_KEY = 'nav_server_url'
/** 单用户时代的同步配置（Worker 地址 + SYNC_TOKEN），登录后不再使用 */
const LEGACY_CONFIG_KEY = 'nav_sync_config'
const REQUEST_TIMEOUT_MS = 15000

export class ApiError extends Error {
  status: number
  code: string
  body: Record<string, unknown>
  constructor(status: number, code: string, message: string, body: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.body = body
  }
}

const ERROR_TEXT: Record<string, string> = {
  unauthorized: '登录已过期，请重新登录',
  pending_approval: '账号正在等待管理员审批，审批通过后才能云同步',
  account_disabled: '账号已被禁用',
  forbidden: '没有权限执行这个操作',
  invalid_code: '登录链接已失效，请重新登录',
  legacy_read_only: '旧同步密钥已改为只读，请使用 GitHub 登录',
  last_admin: '不能禁用或降级最后一个管理员',
  already_claimed: '旧数据已经被认领过',
  no_legacy_data: '云端没有旧版数据',
  user_doc_exists: '你的账号云端已经有数据',
  workbench_conflict: '便签或草稿在其他设备也有修改，请选择保留本机或采用云端版本',
  upgrade_required: '服务端已升级，请刷新页面使用独立便签同步',
  payload_too_large: '数据太大，超过了 4MB 上限',
}

export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return ERROR_TEXT[error.code] || error.message
  if (error instanceof DOMException && error.name === 'TimeoutError') return '请求超时，检查同步服务能不能访问'
  if (error instanceof TypeError) return '连不上同步服务，检查网络或服务地址'
  return error instanceof Error ? error.message : String(error)
}

// ---------------------------------------------------------------------------
// 本地存储
// ---------------------------------------------------------------------------

/** 同步服务地址：可在设置里覆盖，默认使用构建时的 VITE_SYNC_URL */
export function loadServerUrl(): string {
  try {
    return normalizeSyncUrl(localStorage.getItem(SERVER_KEY) || '') || DEFAULT_SYNC_URL
  } catch {
    return DEFAULT_SYNC_URL
  }
}

export function saveServerUrl(url: string): void {
  const normalized = normalizeSyncUrl(url)
  if (!normalized || normalized === DEFAULT_SYNC_URL) localStorage.removeItem(SERVER_KEY)
  else localStorage.setItem(SERVER_KEY, normalized)
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    if (!parsed.token || !parsed.url || !parsed.user?.id) return null
    return parsed as Session
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

/** 当前登录账号的 id；未登录返回 null。用于选择本地数据库与本机同步状态的存储键 */
export function currentAccountId(): string | null {
  return loadSession()?.user.id ?? null
}

/** 是否还留着单用户时代的同步配置（用于提示“改用 GitHub 登录”） */
export function hasLegacySyncConfig(): boolean {
  try {
    return Boolean(localStorage.getItem(LEGACY_CONFIG_KEY))
  } catch {
    return false
  }
}

export function clearLegacySyncConfig(): void {
  localStorage.removeItem(LEGACY_CONFIG_KEY)
}

/** 登录回跳的结果提示：页面加载前写入，store 初始化时读取一次 */
const LOGIN_NOTICE_KEY = 'nav_login_notice'

export function setLoginNotice(message: string): void {
  sessionStorage.setItem(LOGIN_NOTICE_KEY, message)
}

export function takeLoginNotice(): string {
  try {
    const message = sessionStorage.getItem(LOGIN_NOTICE_KEY) || ''
    sessionStorage.removeItem(LOGIN_NOTICE_KEY)
    if (message) return message
  } catch {}
  return !loadSession() && hasLegacySyncConfig() ? '云同步已改为 GitHub 账号登录，请登录后继续同步' : ''
}

// ---------------------------------------------------------------------------
// 网络
// ---------------------------------------------------------------------------

export async function apiRequest<T>(
  url: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${url}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const code = typeof body.error === 'string' ? body.error : `http_${res.status}`
    throw new ApiError(res.status, code, `同步服务返回 HTTP ${res.status}（${code}）`, body)
  }
  return body as T
}

/** 跳转 GitHub 登录；回到当前页面（不带 hash） */
export function startLogin(serverUrl = loadServerUrl()): void {
  const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`
  window.location.assign(`${serverUrl}/auth/github/start?return_to=${encodeURIComponent(returnTo)}`)
}

export type LoginResult =
  | { status: 'none' }
  | { status: 'error'; message: string }
  | { status: 'ok'; session: Session; previousAccountId: string | null }

const LOGIN_ERROR_TEXT: Record<string, string> = {
  access_denied: '你取消了 GitHub 授权',
  denied: '你取消了 GitHub 授权',
  github_failed: '没能从 GitHub 获取账号信息，请重试',
  account_disabled: '账号已被禁用',
}

/**
 * 处理 OAuth 回跳：地址栏 fragment 里的 login_code 换成会话令牌。
 * 无论成功与否都会立即清掉 fragment，避免一次性码留在历史记录里。
 */
export async function completeLoginFromLocation(): Promise<LoginResult> {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash.includes('login_code=') && !hash.includes('login_error=')) return { status: 'none' }
  const params = new URLSearchParams(hash)
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)

  const loginError = params.get('login_error')
  if (loginError) return { status: 'error', message: LOGIN_ERROR_TEXT[loginError] || `登录失败（${loginError}）` }

  const code = params.get('login_code') || ''
  const url = loadServerUrl()
  try {
    const body = await apiRequest<{ token: string; expiresAt: number; user: AccountUser }>(url, '/auth/exchange', {
      method: 'POST',
      body: { code },
    })
    const previousAccountId = currentAccountId()
    const session: Session = { url, token: body.token, expiresAt: body.expiresAt, user: body.user }
    saveSession(session)
    clearLegacySyncConfig()
    return { status: 'ok', session, previousAccountId }
  } catch (error) {
    return { status: 'error', message: describeApiError(error) }
  }
}

export async function fetchMe(session: Session): Promise<{ user: AccountUser; legacy: LegacyState | null }> {
  return apiRequest(session.url, '/api/me', { token: session.token })
}

export async function logoutRemote(session: Session): Promise<void> {
  await apiRequest(session.url, '/auth/logout', { method: 'POST', token: session.token }).catch(() => {})
}

export async function listUsers(session: Session): Promise<AccountUser[]> {
  const body = await apiRequest<{ users: AccountUser[] }>(session.url, '/api/admin/users', { token: session.token })
  return body.users
}

export async function updateUser(
  session: Session,
  id: string,
  patch: { role?: Role; status?: AccountStatus },
): Promise<AccountUser> {
  const body = await apiRequest<{ user: AccountUser }>(session.url, `/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token: session.token,
    body: patch,
  })
  return body.user
}

export async function claimLegacy(session: Session, replace = false): Promise<{ updatedAt: number }> {
  return apiRequest(session.url, '/api/admin/claim-legacy', {
    method: 'POST',
    token: session.token,
    body: { replace },
  })
}

/**
 * 账号、会话与同步写入的纯规则。
 *
 * 这里不碰 D1、fetch、Request —— 只有输入输出，方便用表驱动单测覆盖
 * （scripts/test-worker-policy.mjs）。所有跟“允许不允许”有关的判断都放这里，
 * 路由层只负责取数据、调用规则、落库。
 */

export type Role = 'admin' | 'user'
export type Status = 'pending' | 'active' | 'disabled'

export type Account = { role: Role; status: Status }

export const ROLES: readonly Role[] = ['admin', 'user']
export const STATUSES: readonly Status[] = ['pending', 'active', 'disabled']

export const DAY_MS = 24 * 3600 * 1000
export const SESSION_TTL_MS = 30 * DAY_MS
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
export const LOGIN_CODE_TTL_MS = 60 * 1000

/** 解析逗号/空白分隔的配置列表，去空、去重 */
export function parseList(value: string | undefined | null): string[] {
  if (!value) return []
  return [...new Set(value.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean))]
}

/** 规范化 origin：小写、去结尾斜杠；非法返回 null */
export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin.toLowerCase()
  } catch {
    return null
  }
}

/** 某个请求 Origin 是否在白名单里（白名单为空表示不限制，仅用于 CORS） */
export function isAllowedOrigin(origin: string | undefined | null, allowed: string[]): boolean {
  if (!origin) return false
  const normalized = normalizeOrigin(origin)
  if (!normalized) return false
  return allowed.some((item) => normalizeOrigin(item) === normalized)
}

/**
 * 校验登录完成后要跳回的前端地址。
 * 只允许 http(s) 且 origin 在白名单内，防止把一次性登录码送到别人的站点（开放重定向）。
 * 白名单为空时一律拒绝（fail closed）。返回去掉 hash 的地址。
 */
export function normalizeReturnTo(value: string, allowedOrigins: string[]): string | null {
  if (!value || allowedOrigins.length === 0) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  if (!isAllowedOrigin(url.origin, allowedOrigins)) return null
  url.hash = ''
  return url.toString()
}

/** 把参数放进 fragment（不进服务端日志 / Referer），覆盖原有 hash */
export function withFragment(returnTo: string, params: Record<string, string>): string {
  const url = new URL(returnTo)
  url.hash = new URLSearchParams(params).toString()
  return url.toString()
}

/**
 * 登录时决定账号的角色与状态。
 * - ADMIN_GITHUB_LOGINS 是管理员的唯一事实来源：名单内的人每次登录都是 admin + active。
 * - 已有账号保持现状（审批结果、禁用状态不会被登录覆盖）。
 * - 新账号默认 user + pending，等待管理员审批。
 */
export function accountOnLogin(
  login: string,
  adminLogins: string[],
  existing: Account | null,
): Account {
  const isListedAdmin = adminLogins.some((item) => item.toLowerCase() === login.toLowerCase())
  if (isListedAdmin) return { role: 'admin', status: 'active' }
  if (existing) return { role: existing.role, status: existing.status }
  return { role: 'user', status: 'pending' }
}

export function canSync(account: Account): boolean {
  return account.status === 'active'
}

export function isActiveAdmin(account: Account): boolean {
  return account.role === 'admin' && account.status === 'active'
}

export type UserPatch = { role?: unknown; status?: unknown }

export type UserUpdateResult =
  | { ok: true; next: Account }
  | { ok: false; error: 'invalid_role' | 'invalid_status' | 'empty_patch' | 'last_admin' }

/**
 * 管理员修改账号。不能让系统失去最后一个可用管理员。
 * activeAdminCount 为当前（修改前）active admin 的数量。
 */
export function checkUserUpdate(
  target: Account,
  patch: UserPatch,
  activeAdminCount: number,
): UserUpdateResult {
  if (patch.role === undefined && patch.status === undefined) return { ok: false, error: 'empty_patch' }
  if (patch.role !== undefined && !ROLES.includes(patch.role as Role)) {
    return { ok: false, error: 'invalid_role' }
  }
  if (patch.status !== undefined && !STATUSES.includes(patch.status as Status)) {
    return { ok: false, error: 'invalid_status' }
  }
  const next: Account = {
    role: (patch.role as Role | undefined) ?? target.role,
    status: (patch.status as Status | undefined) ?? target.status,
  }
  if (isActiveAdmin(target) && !isActiveAdmin(next) && activeAdminCount <= 1) {
    return { ok: false, error: 'last_admin' }
  }
  return { ok: true, next }
}

export function isExpired(expiresAt: number, now: number): boolean {
  return expiresAt <= now
}

/** 滑动续期：剩余不足一半有效期时续到 now + ttl，否则不动（减少写入） */
export function renewedExpiry(expiresAt: number, now: number, ttl = SESSION_TTL_MS): number | null {
  if (isExpired(expiresAt, now)) return null
  return expiresAt - now < ttl / 2 ? now + ttl : null
}

export type WritePlan = { conflict: true } | { conflict: false; nextUpdatedAt: number }

/**
 * 乐观并发：客户端声明它基于哪个云端版本（expected）写入。
 * 云端已被推进且不是强制覆盖时拒绝，交给用户选择；
 * 新版本时间戳保证严格递增。
 */
export function planWrite(input: {
  currentUpdatedAt: number | null
  expected: number | null
  incoming: number | null
  force: boolean
  now: number
}): WritePlan {
  const { currentUpdatedAt, expected, force, now } = input
  const incoming = input.incoming ?? now
  if (currentUpdatedAt !== null && !force && expected !== null && expected !== currentUpdatedAt) {
    return { conflict: true }
  }
  const nextUpdatedAt =
    currentUpdatedAt === null ? incoming : Math.max(incoming, currentUpdatedAt + 1)
  return { conflict: false, nextUpdatedAt }
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

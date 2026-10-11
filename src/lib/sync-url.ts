/** 同步服务（Worker）地址。非机密，可以写进构建产物。 */
export const DEFAULT_SYNC_URL: string =
  (import.meta.env.VITE_SYNC_URL as string | undefined)?.trim() || 'https://nav.lisang.workers.dev'

/** 允许用户只填 `xxx.workers.dev`，自动补协议、去掉结尾斜杠；旧地址 nav-sync 自动迁移 */
export function normalizeSyncUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return url.replace(/^https:\/\/nav-sync\.lisang\.workers\.dev$/i, 'https://nav.lisang.workers.dev')
}

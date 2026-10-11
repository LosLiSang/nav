import { useEffect, useState } from 'react'
import {
  Cloud,
  CloudOff,
  Download,
  HelpCircle,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import {
  describeApiError,
  listUsers,
  loadServerUrl,
  saveServerUrl,
  updateUser,
  type AccountStatus,
  type AccountUser,
} from '../lib/auth'
import { DEFAULT_SYNC_URL, normalizeSyncUrl } from '../lib/sync'
import { useNavStore, type ImportChoice, type SyncStatus } from '../store/useNavStore'
import { SyncHelp } from './SyncHelp'
import { WorkbenchSyncStatus } from './WorkbenchSyncStatus'

const GITHUB_PATH =
  'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z'

function Github({ className }: { className?: string }) {
  return (
    <svg className={`${className ?? ''} fill-current`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={GITHUB_PATH} />
    </svg>
  )
}

const STATUS_STYLE: Record<SyncStatus, { label: string; className: string }> = {
  off: { label: '未开启', className: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400' },
  idle: { label: '待同步', className: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400' },
  syncing: { label: '同步中', className: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' },
  synced: { label: '已同步', className: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' },
  error: { label: '出错了', className: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' },
  conflict: { label: '需要处理', className: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' },
}

const ACCOUNT_STATUS_TEXT: Record<AccountStatus, string> = {
  active: '已启用',
  pending: '待审批',
  disabled: '已禁用',
}

const BUTTON =
  'flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition shadow-sm disabled:opacity-50'

function formatTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function syncStatusDot(status: SyncStatus): string {
  if (status === 'synced') return 'bg-emerald-500'
  if (status === 'error') return 'bg-red-500'
  if (status === 'syncing') return 'bg-blue-500 animate-pulse'
  return 'bg-neutral-400'
}

/** 云同步设置页：GitHub 账号、同步状态与操作、管理员的用户审批 */
export function SyncTab() {
  const {
    account,
    accountMessage,
    importOffer,
    syncConfig,
    autoSync,
    syncStatus,
    syncMessage,
    localUpdatedAt,
    remoteUpdatedAt,
    lastSyncedAt,
    login,
    logout,
    refreshAccount,
    resolveImport,
    hasUnsyncedChanges,
    setAutoSync,
    syncNow,
    pushToCloud,
    pullFromCloud,
  } = useNavStore()
  const [showHelp, setShowHelp] = useState(false)
  const [serverUrl, setServerUrl] = useState(loadServerUrl())
  const [busy, setBusy] = useState(false)
  const statusStyle = STATUS_STYLE[syncStatus]

  const handleLogout = async () => {
    if (
      hasUnsyncedChanges() &&
      !window.confirm('这个账号还有改动没有同步到云端。退出后改动保留在本机，下次登录会继续同步。确定退出吗？')
    ) {
      return
    }
    setBusy(true)
    await logout()
  }

  const handleImport = async (choice: ImportChoice) => {
    setBusy(true)
    try {
      await resolveImport(choice)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {syncConfig ? (
            <Cloud className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          ) : (
            <CloudOff className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
          )}
          <label className="font-semibold text-neutral-900 dark:text-neutral-100">账号与云同步</label>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            title="云同步说明"
            aria-label="云同步说明"
            aria-expanded={showHelp}
            className={`rounded-full p-0.5 transition ${
              showHelp ? 'text-orange-600 dark:text-orange-400' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${statusStyle.className}`}>
          {statusStyle.label}
        </span>
      </div>

      {showHelp && <SyncHelp />}
      <WorkbenchSyncStatus />

      {/* 账号 */}
      {account ? (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50 dark:bg-neutral-800/60 p-3">
          {account.avatarUrl ? (
            <img src={account.avatarUrl} alt="" className="h-9 w-9 rounded-full" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700">
              <Github className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-medium text-neutral-900 dark:text-neutral-100">
              <span className="truncate">{account.name || account.login}</span>
              {account.role === 'admin' && <ShieldCheck className="h-3.5 w-3.5 text-orange-500" aria-label="管理员" />}
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              @{account.login} · {ACCOUNT_STATUS_TEXT[account.status]}
            </div>
          </div>
          {account.status !== 'active' && (
            <button type="button" onClick={() => void refreshAccount()} className={BUTTON} title="重新检查审批状态">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => void handleLogout()} disabled={busy} className={BUTTON}>
            <LogOut className="h-3.5 w-3.5" />
            退出
          </button>
        </div>
      ) : (
        <div className="space-y-2.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50 dark:bg-neutral-800/60 p-3.5">
          <p className="leading-relaxed text-[11px] text-neutral-500 dark:text-neutral-400">
            数据默认保存在本浏览器。用 GitHub 登录后，改动会同步到云端，换设备登录同一账号即可恢复。新账号需要管理员审批后才能同步。
          </p>
          <button
            type="button"
            onClick={() => {
              saveServerUrl(serverUrl)
              login()
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-xs font-medium text-white dark:text-neutral-900 shadow-sm hover:opacity-90 transition"
          >
            <Github className="h-4 w-4" />
            使用 GitHub 登录
          </button>
          <details className="text-[11px] text-neutral-500 dark:text-neutral-400">
            <summary className="cursor-pointer select-none">自建同步服务地址</summary>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              onBlur={() => setServerUrl(normalizeSyncUrl(serverUrl) || DEFAULT_SYNC_URL)}
              placeholder={DEFAULT_SYNC_URL}
              className="mt-1.5 w-full rounded-xl border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs outline-none focus:border-orange-500 bg-transparent"
            />
          </details>
        </div>
      )}

      {accountMessage && <p className="text-[11px] text-amber-600 dark:text-amber-400">{accountMessage}</p>}

      {/* 首次进入空账号：选择初始数据 */}
      {importOffer && (
        <div className="space-y-2.5 rounded-xl border border-orange-200 dark:border-orange-900/60 bg-orange-50/60 dark:bg-orange-950/20 p-3.5">
          <div className="font-medium text-neutral-900 dark:text-neutral-100">这个账号还没有数据，从哪里开始？</div>
          <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            只在第一次进入这个账号时询问。选择前不会上传任何数据。
          </p>
          <div className="grid gap-2">
            {importOffer.legacyClaimable && (
              <button type="button" disabled={busy} onClick={() => void handleImport('legacy')} className={BUTTON}>
                <Download className="h-3.5 w-3.5" />
                认领旧版云端数据（单用户时代的同步数据）
              </button>
            )}
            {importOffer.anonymousBookmarks > 0 && (
              <button type="button" disabled={busy} onClick={() => void handleImport('local')} className={BUTTON}>
                <Upload className="h-3.5 w-3.5" />
                导入本机未登录时的数据（{importOffer.anonymousBookmarks} 个书签）
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void handleImport('skip')} className={BUTTON}>
              从默认数据开始
            </button>
          </div>
        </div>
      )}

      {/* 同步 */}
      {syncConfig && !importOffer && (
        <div className="space-y-3 rounded-2xl border border-neutral-200/80 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 p-3.5">
          <label className="flex cursor-pointer items-center justify-between font-medium text-neutral-700 dark:text-neutral-200">
            <span>改动自动上传</span>
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
          </label>

          <div className="space-y-1 font-mono text-[10px] text-neutral-500 dark:text-neutral-400 border-t border-neutral-200/60 dark:border-neutral-700/60 pt-2.5">
            <div className="flex justify-between">
              <span>本机版本</span>
              <span>{formatTime(localUpdatedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>云端版本</span>
              <span>{formatTime(remoteUpdatedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>最近同步</span>
              <span>{formatTime(lastSyncedAt)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={() => void syncNow()} className={BUTTON}>
              <RefreshCw className="h-3.5 w-3.5" />
              立即同步
            </button>
            <button type="button" onClick={() => void pushToCloud()} className={BUTTON}>
              <Upload className="h-3.5 w-3.5" />
              上传本地
            </button>
            <button type="button" onClick={() => void pullFromCloud()} className={BUTTON}>
              <Download className="h-3.5 w-3.5" />
              从云端恢复
            </button>
            <button
              type="button"
              onClick={() => void pushToCloud(true)}
              className={`${BUTTON} !border-red-200 dark:!border-red-900/60 !text-red-600 dark:!text-red-400`}
            >
              <Upload className="h-3.5 w-3.5" />
              强制上传本地
            </button>
          </div>

          <p className="leading-relaxed text-[10px] text-neutral-400 dark:text-neutral-500 pt-1">
            同步按「谁更新谁生效」处理，两边冲突时会暂停并提示。强制上传会覆盖云端数据。
          </p>
        </div>
      )}

      {syncMessage && (
        <p
          className={`leading-relaxed text-[11px] ${
            syncStatus === 'error' || syncStatus === 'conflict'
              ? 'text-red-600 dark:text-red-400'
              : 'text-neutral-500 dark:text-neutral-400'
          }`}
        >
          {syncMessage}
        </p>
      )}

      {account?.role === 'admin' && account.status === 'active' && <UserAdmin currentUserId={account.id} />}
    </div>
  )
}

/** 管理员：审批 / 禁用 / 设为管理员 */
function UserAdmin({ currentUserId }: { currentUserId: string }) {
  const session = useNavStore((s) => s.session)
  const [users, setUsers] = useState<AccountUser[] | null>(null)
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const load = async () => {
    if (!session) return
    setError('')
    try {
      setUsers(await listUsers(session))
    } catch (e) {
      setError(describeApiError(e))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token])

  const change = async (user: AccountUser, patch: { role?: AccountUser['role']; status?: AccountStatus }) => {
    if (!session) return
    setPendingId(user.id)
    setError('')
    try {
      const updated = await updateUser(session, user.id, patch)
      setUsers((list) => list?.map((u) => (u.id === updated.id ? updated : u)) ?? null)
    } catch (e) {
      setError(describeApiError(e))
    } finally {
      setPendingId(null)
    }
  }

  const pendingCount = users?.filter((u) => u.status === 'pending').length ?? 0

  return (
    <div className="space-y-2.5 rounded-2xl border border-neutral-200/80 dark:border-neutral-700 p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
          <Users className="h-4 w-4 text-orange-500" />
          用户管理
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-950/50 px-1.5 text-[10px] text-amber-700 dark:text-amber-400">
              {pendingCount} 待审批
            </span>
          )}
        </div>
        <button type="button" onClick={() => void load()} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200" title="刷新">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      {!users && !error && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}

      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {users?.map((user) => {
          const self = user.id === currentUserId
          const busy = pendingId === user.id
          return (
            <li key={user.id} className="flex items-center gap-2.5 py-2">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-neutral-200 dark:bg-neutral-700" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-neutral-800 dark:text-neutral-100">
                  {user.login}
                  {user.role === 'admin' && <span className="ml-1 text-[10px] text-orange-500">管理员</span>}
                  {self && <span className="ml-1 text-[10px] text-neutral-400">（你）</span>}
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {ACCOUNT_STATUS_TEXT[user.status]} · 最近登录 {formatTime(user.lastLoginAt)}
                </div>
              </div>
              {!self && (
                <div className="flex gap-1.5">
                  {user.status !== 'active' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void change(user, { status: 'active' })}
                      className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {user.status === 'pending' ? '批准' : '启用'}
                    </button>
                  )}
                  {user.status !== 'disabled' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`禁用 ${user.login}？对方会立即退出登录，云端数据保留。`)) {
                          void change(user, { status: 'disabled' })
                        }
                      }}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                    >
                      禁用
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

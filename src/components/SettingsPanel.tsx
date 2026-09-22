import { useState } from 'react'
import {
  Cloud,
  CloudOff,
  Download,
  Image as ImageIcon,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'
import { WALLPAPER_PRESETS } from '../lib/defaults'
import { DEFAULT_SYNC_URL, generateSyncToken, normalizeSyncUrl } from '../lib/sync'
import type { SyncConfig } from '../lib/sync'
import type { SyncStatus } from '../store/useNavStore'
import type { CornerRadius, Settings } from '../types'

type SyncProps = {
  config: SyncConfig | null
  autoSync: boolean
  status: SyncStatus
  message: string
  lastSyncedAt: number
  localUpdatedAt: number
  remoteUpdatedAt: number
  onConfigure: (url: string, token: string) => Promise<void>
  onToggleAuto: (enabled: boolean) => void
  onDisconnect: () => void
  onSyncNow: () => Promise<void>
  onPush: (force?: boolean) => Promise<void>
  onPull: () => Promise<void>
}

type Props = {
  settings: Settings
  onClose: () => void
  onChange: (values: Partial<Settings>) => void
  sync: SyncProps
}

const STATUS_STYLE: Record<SyncStatus, { label: string; className: string }> = {
  off: { label: '未开启', className: 'bg-neutral-100 text-neutral-500' },
  idle: { label: '待同步', className: 'bg-neutral-100 text-neutral-500' },
  syncing: { label: '同步中', className: 'bg-blue-50 text-blue-600' },
  synced: { label: '已同步', className: 'bg-emerald-50 text-emerald-600' },
  error: { label: '出错了', className: 'bg-red-50 text-red-600' },
  conflict: { label: '需要处理', className: 'bg-amber-50 text-amber-600' },
}

function formatTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function SettingsPanel({ settings, onClose, onChange, sync }: Props) {
  const [customUrl, setCustomUrl] = useState(settings.wallpaperUrl)
  const [syncUrl, setSyncUrl] = useState(sync.config?.url ?? DEFAULT_SYNC_URL)
  const [syncToken, setSyncToken] = useState(sync.config?.token ?? '')

  const statusStyle = STATUS_STYLE[sync.status]
  const maskedToken = sync.config
    ? `••••••••${sync.config.token.slice(-4)}`
    : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-neutral-800 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <ImageIcon className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-neutral-900">全局界面与壁纸设置</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-5 text-xs">
          {/* 1. Wallpaper Presets */}
          <div>
            <label className="block font-medium text-neutral-800 mb-2">背景壁纸设置</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WALLPAPER_PRESETS.map((preset) => {
                const isSelected = settings.wallpaperUrl === preset.url
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setCustomUrl(preset.url)
                      onChange({ wallpaperUrl: preset.url })
                    }}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition ${
                      isSelected
                        ? 'border-orange-500 ring-2 ring-orange-500/20'
                        : 'border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    <img
                      src={preset.url}
                      alt={preset.name}
                      className="h-16 w-full object-cover"
                    />
                    <span className="truncate p-1.5 text-[11px] font-medium text-neutral-700">
                      {preset.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom URL */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="输入在线图片链接 (https://...)"
                className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-orange-500"
              />
              <button
                type="button"
                onClick={() => onChange({ wallpaperUrl: customUrl.trim() })}
                className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-orange-600"
              >
                应用链接
              </button>
            </div>
          </div>

          {/* 2. Visual Sliders: Blur, Dim, Panel Opacity */}
          <div className="space-y-3.5 rounded-2xl bg-neutral-50 p-4 border border-neutral-200/80">
            <label className="block font-medium text-neutral-800 mb-1">背景与透明度视觉调节</label>
            {[
              { key: 'wallpaperBlur', label: '壁纸模糊度 (毛玻璃)', min: 0, max: 25, unit: 'px' },
              { key: 'wallpaperDim', label: '壁纸暗度遮罩', min: 0, max: 70, unit: '%' },
              { key: 'panelOpacity', label: '主面板底色不透明度', min: 50, max: 100, unit: '%' },
            ].map((item) => (
              <div key={item.key}>
                <div className="flex justify-between font-medium text-neutral-700 mb-1.5">
                  <span>{item.label}</span>
                  <span className="font-mono text-neutral-500 font-bold">
                    {settings[item.key as keyof Settings] as number}
                    {item.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  value={settings[item.key as keyof Settings] as number}
                  onChange={(e) =>
                    onChange({ [item.key]: Number(e.target.value) } as Partial<Settings>)
                  }
                  className="w-full accent-orange-500"
                />
              </div>
            ))}
          </div>

          {/* 3. Corner Radius */}
          <div className="border-t border-neutral-100 pt-3.5">
            <label className="block font-medium text-neutral-800 mb-2">
              搜索框与卡片圆角风格
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'none', label: '方正直角', desc: '极简硬朗' },
                { id: 'md', label: '微润圆角', desc: '舒适现代' },
                { id: 'xl', label: '柔和大圆角', desc: '轻快圆润' },
              ].map((opt) => {
                const isSelected = settings.cornerRadius === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ cornerRadius: opt.id as CornerRadius })}
                    className={`flex flex-col items-center justify-center rounded-xl border py-2.5 text-xs transition ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/60 text-orange-600 ring-1 ring-orange-500 font-semibold'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[10px] text-neutral-400 mt-0.5">{opt.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 4. Cloud Sync */}
          <div className="border-t border-neutral-100 pt-3.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {sync.config ? (
                  <Cloud className="h-4 w-4 text-orange-600" />
                ) : (
                  <CloudOff className="h-4 w-4 text-neutral-400" />
                )}
                <label className="font-medium text-neutral-800">云同步（Cloudflare D1）</label>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle.className}`}
              >
                {statusStyle.label}
              </span>
            </div>

            <p className="mb-2.5 leading-relaxed text-neutral-500">
              数据默认只存在这台浏览器里，清 cookie / 清站点数据 / 换设备就会全丢。填上你自己部署的
              Worker 地址和 token，改动会自动存进云端的 SQLite（D1）；换设备只要重新填一次 token，
              整份导航就能拉回来。
            </p>

            <div className="space-y-2">
              <input
                value={syncUrl}
                onChange={(e) => setSyncUrl(e.target.value)}
                placeholder="https://nav-sync.你的账号.workers.dev"
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-orange-500"
              />
              <div className="flex gap-2">
                <input
                  value={syncToken}
                  type="password"
                  onChange={(e) => setSyncToken(e.target.value)}
                  placeholder="SYNC_TOKEN（Worker 端设置的密钥）"
                  className="min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  title="生成随机 token，复制到 wrangler secret put SYNC_TOKEN"
                  onClick={() => setSyncToken(generateSyncToken())}
                  className="rounded-xl border border-neutral-200 px-3 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  生成
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void sync.onConfigure(normalizeSyncUrl(syncUrl), syncToken)}
                  className="flex-1 rounded-xl bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-orange-600"
                >
                  {sync.config ? '保存并重新连接' : '保存并连接'}
                </button>
                {sync.config && (
                  <button
                    type="button"
                    onClick={sync.onDisconnect}
                    className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    关闭同步
                  </button>
                )}
              </div>
            </div>

            {!sync.config && sync.message && <p className="mt-2 text-red-600">{sync.message}</p>}

            {sync.config && (
              <div className="mt-3 space-y-2.5 rounded-2xl border border-neutral-200/80 bg-neutral-50 p-3.5">
                <label className="flex cursor-pointer items-center justify-between font-medium text-neutral-700">
                  <span>改动自动上传</span>
                  <input
                    type="checkbox"
                    checked={sync.autoSync}
                    onChange={(e) => sync.onToggleAuto(e.target.checked)}
                    className="h-4 w-4 accent-orange-500"
                  />
                </label>

                <div className="space-y-1 font-mono text-[10px] text-neutral-500">
                  <div className="flex justify-between">
                    <span>本机版本</span>
                    <span>{formatTime(sync.localUpdatedAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>云端版本</span>
                    <span>{formatTime(sync.remoteUpdatedAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>最近一次同步</span>
                    <span>{formatTime(sync.lastSyncedAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>当前 token</span>
                    <span>{maskedToken}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void sync.onSyncNow()}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    立即同步
                  </button>
                  <button
                    type="button"
                    onClick={() => void sync.onPush()}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    上传本地
                  </button>
                  <button
                    type="button"
                    onClick={() => void sync.onPull()}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    从云端恢复
                  </button>
                  <button
                    type="button"
                    onClick={() => void sync.onPush(true)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 font-medium text-red-600 hover:bg-red-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    强制上传本地
                  </button>
                </div>

                <p className="leading-relaxed text-[10px] text-neutral-400">
                  同步按「谁更新谁生效」处理，并且绝不会用过期的本地数据静默覆盖云端更新：两边都改过时会停下来让你选。
                  「强制上传本地」会丢弃云端版本，只在确认云端数据没用时使用。token 只保存在这台浏览器里，
                  清掉数据后需要重新填一次。TOTP 密钥也会一起同步，请把它当密码保管。
                </p>

                {sync.message && (
                  <p
                    className={`leading-relaxed ${
                      sync.status === 'error' || sync.status === 'conflict'
                        ? 'text-red-600'
                        : 'text-neutral-500'
                    }`}
                  >
                    {sync.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-neutral-100 pt-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-neutral-900 px-5 py-2 font-medium text-white shadow-sm hover:bg-neutral-800"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

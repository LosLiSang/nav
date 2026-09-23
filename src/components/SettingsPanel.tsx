import { createPortal } from 'react-dom'
import { useState } from 'react'
import {
  Cloud,
  CloudOff,
  Download,
  Image as ImageIcon,
  Palette,
  RefreshCw,
  Sliders,
  Upload,
  X,
} from 'lucide-react'
import { WALLPAPER_PRESETS } from '../lib/defaults'
import { DEFAULT_SYNC_URL, generateSyncToken, normalizeSyncUrl } from '../lib/sync'
import type { SyncConfig } from '../lib/sync'
import type { SyncStatus } from '../store/useNavStore'
import type { CornerRadius, FallbackIconMode, Settings } from '../types'
import { IconPickerModal } from './IconPickerModal'

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
  onClearIconCache?: () => Promise<void>
}

type TabType = 'appearance' | 'sync'

const STATUS_STYLE: Record<SyncStatus, { label: string; className: string }> = {
  off: { label: '未开启', className: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400' },
  idle: { label: '待同步', className: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400' },
  syncing: { label: '同步中', className: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' },
  synced: { label: '已同步', className: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' },
  error: { label: '出错了', className: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' },
  conflict: { label: '需要处理', className: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' },
}

function formatTime(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function SettingsPanel({ settings, onClose, onChange, sync, onClearIconCache }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('appearance')
  const [showFallbackIconPicker, setShowFallbackIconPicker] = useState(false)
  const [customUrl, setCustomUrl] = useState(settings.wallpaperUrl)
  const [syncUrl, setSyncUrl] = useState(sync.config?.url ?? DEFAULT_SYNC_URL)
  const [syncToken, setSyncToken] = useState(sync.config?.token ?? '')
  const [cacheCleared, setCacheCleared] = useState(false)

  const statusStyle = STATUS_STYLE[sync.status]
  const maskedToken = sync.config
    ? `••••••••${sync.config.token.slice(-4)}`
    : ''

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 shadow-2xl max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-neutral-200/80 dark:border-neutral-800">
        
        {/* Fixed Header */}
        <div className="p-6 pb-3 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                <Sliders className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">全局设置</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Segmented Control / Tabs */}
          <div className="flex rounded-xl bg-neutral-100 dark:bg-neutral-800 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('appearance')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition ${
                activeTab === 'appearance'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Palette className="h-4 w-4 text-orange-500" />
              界面与壁纸
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sync')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition ${
                activeTab === 'sync'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Cloud className="h-4 w-4 text-blue-500" />
              云端同步
              {sync.config && (
                <span
                  className={`h-2 w-2 rounded-full ${
                    sync.status === 'synced'
                      ? 'bg-emerald-500'
                      : sync.status === 'error'
                      ? 'bg-red-500'
                      : sync.status === 'syncing'
                      ? 'bg-blue-500 animate-pulse'
                      : 'bg-neutral-400'
                  }`}
                />
              )}
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {activeTab === 'appearance' ? (
            <>
              {/* 1. Wallpaper Presets */}
              <div>
                <label className="block font-medium text-neutral-800 dark:text-neutral-200 mb-2">背景壁纸设置</label>
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
                            : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.name}
                          className="h-16 w-full object-cover"
                        />
                        <span className="truncate p-1.5 text-[11px] font-medium text-neutral-700 dark:text-neutral-200">
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
                    className="min-w-0 flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs outline-none focus:border-orange-500 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ wallpaperUrl: customUrl.trim() })}
                    className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-orange-600 transition"
                  >
                    应用链接
                  </button>
                </div>
              </div>

              {/* 2. Visual Sliders */}
              <div className="space-y-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 p-4 border border-neutral-200/80 dark:border-neutral-700">
                <label className="block font-medium text-neutral-800 dark:text-neutral-200 mb-1">背景与透明度视觉调节</label>
                {[
                  { key: 'wallpaperBlur', label: '壁纸模糊度 (毛玻璃)', min: 0, max: 25, unit: 'px' },
                  { key: 'wallpaperDim', label: '壁纸暗度遮罩', min: 0, max: 70, unit: '%' },
                  { key: 'panelOpacity', label: '主面板底色不透明度', min: 50, max: 100, unit: '%' },
                ].map((item) => (
                  <div key={item.key}>
                    <div className="flex justify-between font-medium text-neutral-700 dark:text-neutral-200 mb-1.5">
                      <span>{item.label}</span>
                      <span className="font-mono text-neutral-500 dark:text-neutral-400 font-bold">
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
                      className="w-full accent-orange-500 cursor-pointer"
                    />
                  </div>
                ))}
              </div>

              {/* 3. Corner Radius */}
              <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3.5">
                <label className="block font-medium text-neutral-800 dark:text-neutral-200 mb-2">
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
                            ? 'border-orange-500 bg-orange-50/60 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 ring-1 ring-orange-500 font-semibold'
                            : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">{opt.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 3.5. Card Container Width */}
              <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-medium text-neutral-800 dark:text-neutral-200">
                      卡片区域最大宽度
                    </label>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                      调整搜索框、网址导航卡片和下方工具卡片的居中展示宽度
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-orange-600 dark:text-orange-400">
                    {settings.cardWidth === 0 ? '100% 铺满全屏' : `${settings.cardWidth ?? 1380}px`}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { label: '紧凑', desc: '1100px', value: 1100 },
                    { label: '标准', desc: '1380px', value: 1380 },
                    { label: '宽屏', desc: '1600px', value: 1600 },
                    { label: '极宽', desc: '1920px', value: 1920 },
                    { label: '铺满', desc: '100%', value: 0 },
                  ].map((preset) => {
                    const isSelected =
                      preset.value === 0
                        ? settings.cardWidth === 0
                        : (settings.cardWidth ?? 1380) === preset.value
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => onChange({ cardWidth: preset.value })}
                        className={`flex flex-col items-center justify-center rounded-xl border py-2 text-xs transition ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/60 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 ring-1 ring-orange-500 font-semibold'
                            : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <span>{preset.label}</span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">{preset.desc}</span>
                      </button>
                    )
                  })}
                </div>

                <div>
                  <input
                    type="range"
                    min={800}
                    max={2400}
                    step={20}
                    value={settings.cardWidth === 0 ? 2400 : (settings.cardWidth ?? 1380)}
                    onChange={(e) => onChange({ cardWidth: Number(e.target.value) })}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                    <span>800px (窄屏)</span>
                    <span>1380px (默认)</span>
                    <span>2400px (宽屏)</span>
                  </div>
                </div>
              </div>

              {/* 4. Fallback Placeholder Icon Mode */}
              <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-medium text-neutral-800 dark:text-neutral-200">
                    默认未获取到时的占位图标
                  </label>
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                    网站无 Favicon 时展示
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'letter', label: '首字母/品牌', desc: '文字徽章' },
                    { id: 'globe', label: '网络地球', desc: '简约 🌐' },
                    { id: 'bookmark', label: '书签标记', desc: '经典 🔖' },
                    { id: 'custom', label: '自定义图', desc: '统一指定' },
                  ].map((opt) => {
                    const isSelected = (settings.fallbackIconMode || 'letter') === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange({ fallbackIconMode: opt.id as FallbackIconMode })}
                        className={`flex flex-col items-center justify-center rounded-xl border py-2 text-xs transition ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/60 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 ring-1 ring-orange-500 font-semibold'
                            : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <span>{opt.label}</span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">{opt.desc}</span>
                      </button>
                    )
                  })}
                </div>

                {settings.fallbackIconMode === 'custom' && (
                  <div className="mt-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 p-2.5 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
                        {settings.defaultPlaceholderIconUrl ? (
                          <img src={settings.defaultPlaceholderIconUrl} alt="" className="h-5 w-5 object-contain" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-neutral-400" />
                        )}
                      </div>
                      <input
                        value={settings.defaultPlaceholderIconUrl || ''}
                        onChange={(e) => onChange({ defaultPlaceholderIconUrl: e.target.value, fallbackIconMode: 'custom' })}
                        placeholder="输入图片链接 (https://... 或 data:image/...)"
                        className="min-w-0 flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs outline-none focus:border-orange-500 text-neutral-800 dark:text-neutral-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowFallbackIconPicker(true)}
                        className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition shadow-sm flex-shrink-0"
                      >
                        从图标库选
                      </button>
                    </div>
                  </div>
                )}

                {onClearIconCache && (
                  <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-400 dark:text-neutral-500">
                    <span>清理已缓存的地球或旧图标：</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await onClearIconCache()
                        setCacheCleared(true)
                        setTimeout(() => setCacheCleared(false), 2000)
                      }}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                    >
                      {cacheCleared ? '✓ 已清空缓存' : '清空图标缓存'}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Cloud Sync Tab */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {sync.config ? (
                      <Cloud className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    ) : (
                      <CloudOff className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
                    )}
                    <label className="font-semibold text-neutral-900 dark:text-neutral-100">云同步服务（Cloudflare D1）</label>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${statusStyle.className}`}
                  >
                    {statusStyle.label}
                  </span>
                </div>

                <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/60 p-3.5 border border-neutral-200/80 dark:border-neutral-700/80">
                  <p className="leading-relaxed text-neutral-500 dark:text-neutral-400 text-[11px]">
                    数据默认保存在本地浏览器中，换设备或清理缓存会导致配置丢失。配置部署的 Worker 与密钥后，改动会自动同步至云端 SQLite（D1），换设备只需填入相同密钥即可一键恢复。
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">Worker 地址</label>
                    <input
                      value={syncUrl}
                      onChange={(e) => setSyncUrl(e.target.value)}
                      placeholder="https://nav-sync.你的账号.workers.dev"
                      className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs outline-none focus:border-orange-500 bg-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400 mb-1">同步密钥 (SYNC_TOKEN)</label>
                    <div className="flex gap-2">
                      <input
                        value={syncToken}
                        type="password"
                        onChange={(e) => setSyncToken(e.target.value)}
                        placeholder="填入在 Worker 环境变量中设置的密钥"
                        className="min-w-0 flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs outline-none focus:border-orange-500 bg-transparent"
                      />
                      <button
                        type="button"
                        title="生成随机 token，复制到 wrangler secret put SYNC_TOKEN"
                        onClick={() => setSyncToken(generateSyncToken())}
                        className="rounded-xl border border-neutral-200 dark:border-neutral-700 px-3 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
                      >
                        生成密钥
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void sync.onConfigure(normalizeSyncUrl(syncUrl), syncToken)}
                      className="flex-1 rounded-xl bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-orange-600 transition"
                    >
                      {sync.config ? '保存并重新连接' : '保存并连接'}
                    </button>
                    {sync.config && (
                      <button
                        type="button"
                        onClick={sync.onDisconnect}
                        className="rounded-xl border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
                      >
                        断开连接
                      </button>
                    )}
                  </div>
                </div>

                {!sync.config && sync.message && (
                  <p
                    className={`mt-2 ${
                      sync.status === 'error'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {sync.message}
                  </p>
                )}

                {sync.config && (
                  <div className="mt-4 space-y-3 rounded-2xl border border-neutral-200/80 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 p-3.5">
                    <label className="flex cursor-pointer items-center justify-between font-medium text-neutral-700 dark:text-neutral-200">
                      <span>改动自动上传</span>
                      <input
                        type="checkbox"
                        checked={sync.autoSync}
                        onChange={(e) => sync.onToggleAuto(e.target.checked)}
                        className="h-4 w-4 accent-orange-500"
                      />
                    </label>

                    <div className="space-y-1 font-mono text-[10px] text-neutral-500 dark:text-neutral-400 border-t border-neutral-200/60 dark:border-neutral-700/60 pt-2.5">
                      <div className="flex justify-between">
                        <span>本机版本</span>
                        <span>{formatTime(sync.localUpdatedAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>云端版本</span>
                        <span>{formatTime(sync.remoteUpdatedAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>最近同步</span>
                        <span>{formatTime(sync.lastSyncedAt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>当前密钥</span>
                        <span>{maskedToken}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void sync.onSyncNow()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition shadow-sm"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        立即同步
                      </button>
                      <button
                        type="button"
                        onClick={() => void sync.onPush()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition shadow-sm"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        上传本地
                      </button>
                      <button
                        type="button"
                        onClick={() => void sync.onPull()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition shadow-sm"
                      >
                        <Download className="h-3.5 w-3.5" />
                        从云端恢复
                      </button>
                      <button
                        type="button"
                        onClick={() => void sync.onPush(true)}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-neutral-900 px-3 py-2 font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition shadow-sm"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        强制上传本地
                      </button>
                    </div>

                    <p className="leading-relaxed text-[10px] text-neutral-400 dark:text-neutral-500 pt-1">
                      同步按「谁更新谁生效」处理，两边冲突时会暂停并提示。强制上传会覆盖云端数据。TOTP 密钥也会一同加密同步。
                    </p>

                    {sync.message && (
                      <p
                        className={`leading-relaxed text-[11px] ${
                          sync.status === 'error' || sync.status === 'conflict'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-neutral-500 dark:text-neutral-400'
                        }`}
                      >
                        {sync.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="flex justify-end border-t border-neutral-100 dark:border-neutral-800 px-6 py-3.5 bg-neutral-50/50 dark:bg-neutral-900/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-neutral-900 dark:bg-neutral-800 px-5 py-2 font-medium text-white dark:text-neutral-100 shadow-sm hover:bg-neutral-800 dark:hover:bg-neutral-700 transition border border-transparent dark:border-neutral-700"
          >
            完成
          </button>
        </div>
        {/* Fallback Icon Picker Modal */}
        {showFallbackIconPicker && (
          <IconPickerModal
            currentIconUrl={settings.defaultPlaceholderIconUrl}
            onSelectIcon={(url) => {
              onChange({ defaultPlaceholderIconUrl: url, fallbackIconMode: 'custom' })
              setShowFallbackIconPicker(false)
            }}
            onClose={() => setShowFallbackIconPicker(false)}
          />
        )}
      </div>
    </div>
  , document.body)
}

import { createPortal } from 'react-dom'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  CloudSun,
  Database,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Palette,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { WALLPAPER_PRESETS } from '../lib/defaults'
import { CONTENT_WIDTH_MAX, CONTENT_WIDTH_MIN, CONTENT_WIDTH_PRESETS, resolveContentWidth } from '../lib/contentWidth'
import { RangeInput } from './RangeInput'
import { useNavStore } from '../store/useNavStore'
import type { CornerRadius, FallbackIconMode, Settings, WeatherProvider } from '../types'
import { testWeatherConfig, type WeatherInfo } from '../lib/weather'
import { IconPickerModal } from './IconPickerModal'
import { SyncTab, syncStatusDot } from './SyncTab'
import { Group, Row, Segmented } from './settings/ui'
import { DEFAULT_AVATAR, FIELD, PRIMARY_BUTTON, SECONDARY_BUTTON } from './settings/styles'
import { ProfileSection } from './settings/ProfileSection'
import { DataSection, type DataActions } from './settings/DataSection'
import { BookmarksSection } from './settings/BookmarksSection'

export type TabType = 'profile' | 'appearance' | 'bookmarks' | 'wallpaper' | 'icons' | 'weather' | 'sync' | 'data'

type Props = DataActions & {
  settings: Settings
  initialTab?: TabType
  onClose: () => void
  onChange: (values: Partial<Settings>) => void
  onOpenIconCache?: () => void
}

/** 侧栏分组：仿 macOS「系统设置」，组与组之间留白分隔。个人资料单独放在顶部。 */
const NAV_GROUPS: { id: TabType; label: string; icon: LucideIcon }[][] = [
  [
    { id: 'appearance', label: '外观', icon: Palette },
    { id: 'bookmarks', label: '书签', icon: LayoutGrid },
    { id: 'wallpaper', label: '壁纸', icon: ImageIcon },
    { id: 'icons', label: '网站图标', icon: Globe },
  ],
  [
    { id: 'weather', label: '天气服务', icon: CloudSun },
    { id: 'sync', label: '云端同步', icon: Cloud },
    { id: 'data', label: '数据备份', icon: Database },
  ],
]

const TITLES: Record<TabType, string> = {
  profile: '个人资料',
  appearance: '外观',
  bookmarks: '书签',
  wallpaper: '壁纸',
  icons: '网站图标',
  weather: '天气服务',
  sync: '云端同步',
  data: '数据备份',
}

const ACCENTS = [
  { label: '活力橙', color: '#ff6900' },
  { label: '经典蓝', color: '#2563eb' },
  { label: '翡翠绿', color: '#10b981' },
  { label: '极客紫', color: '#8b5cf6' },
  { label: '热情红', color: '#ef4444' },
  { label: '珊瑚粉', color: '#f43f5e' },
  { label: '琥珀黄', color: '#f59e0b' },
  { label: '曜石黑', color: '#171717' },
]

const PROVIDERS: { id: WeatherProvider; name: string; desc: string }[] = [
  { id: 'open-meteo', name: 'Open-Meteo', desc: '免 Key · 全球与国内' },
  { id: 'amap', name: '高德开放平台', desc: '国内稳定 · 需 Web Key' },
  { id: 'qweather', name: '和风天气', desc: '中文气象 · 需 API Key' },
  { id: 'wttr', name: 'wttr.in', desc: '轻量极简 · 免 Key' },
  { id: 'custom', name: '自定义 API', desc: 'REST 模板与 JSON 解析' },
]

const RADIUS_OPTIONS: { value: CornerRadius; label: string }[] = [
  { value: 'none', label: '直角' },
  { value: 'md', label: '微圆' },
  { value: 'xl', label: '大圆角' },
]

const FALLBACK_OPTIONS: { value: FallbackIconMode; label: string }[] = [
  { value: 'letter', label: '首字母' },
  { value: 'globe', label: '地球' },
  { value: 'bookmark', label: '书签' },
  { value: 'custom', label: '自定义' },
]

const VISUAL_SLIDERS = [
  { key: 'wallpaperBlur', label: '模糊度', min: 0, max: 25, unit: 'px' },
  { key: 'wallpaperDim', label: '暗度遮罩', min: 0, max: 70, unit: '%' },
  { key: 'cardOpacity', label: '卡片不透明度', min: 50, max: 100, unit: '%' },
] as const

export function SettingsPanel({
  settings,
  initialTab,
  onClose,
  onChange,
  onOpenIconCache,
  onExportBackup,
  onImportBackup,
  onResetToDefaults,
  currentCategory,
  categoryBookmarks,
}: Props) {
  const syncConfig = useNavStore((s) => s.syncConfig)
  const syncStatus = useNavStore((s) => s.syncStatus)
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'appearance')
  const [showFallbackIconPicker, setShowFallbackIconPicker] = useState(false)
  const [customUrl, setCustomUrl] = useState(settings.wallpaperUrl)
  const [testCity, setTestCity] = useState(settings.weatherCity || '广州')
  const [testingWeather, setTestingWeather] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; data?: WeatherInfo; error?: string } | null>(null)

  // Esc 关闭；图标库子弹窗打开时交给子弹窗处理。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showFallbackIconPicker) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showFallbackIconPicker])

  const accent = settings.highlightColor || '#ff6900'
  const accentName = ACCENTS.find((c) => c.color === accent)?.label ?? '自定义'
  const provider = settings.weatherProvider || 'open-meteo'
  const contentWidth = resolveContentWidth(settings)

  const runWeatherTest = async () => {
    setTestingWeather(true)
    setTestResult(null)
    const res = await testWeatherConfig(settings, testCity || settings.weatherCity || '广州')
    setTestResult(res)
    setTestingWeather(false)
  }

  const appearance = (
    <>
      <Group title="主题">
        <Row label="强调色" hint={accentName}>
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => {
              const selected = accent === c.color
              return (
                <button
                  key={c.color}
                  type="button"
                  onClick={() => onChange({ highlightColor: c.color })}
                  style={{ backgroundColor: c.color }}
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={selected}
                  className={`flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset ring-black/15 transition hover:scale-110 ${
                    selected ? 'outline outline-2 outline-offset-2 outline-neutral-400 dark:outline-neutral-500' : ''
                  }`}
                >
                  {selected && (
                    <svg viewBox="0 0 6 6" className="h-1.5 w-1.5" aria-hidden>
                      <circle cx="3" cy="3" r="3" fill="#fff" />
                    </svg>
                  )}
                </button>
              )
            })}
            <label
              title="自定义颜色"
              className={`relative h-5 w-5 cursor-pointer overflow-hidden rounded-full bg-[conic-gradient(#f43f5e,#f59e0b,#10b981,#0ea5e9,#8b5cf6,#f43f5e)] ring-1 ring-inset ring-black/15 transition hover:scale-110 ${
                accentName === '自定义' ? 'outline outline-2 outline-offset-2 outline-neutral-400 dark:outline-neutral-500' : ''
              }`}
            >
              <input
                type="color"
                aria-label="自定义强调色"
                value={accent}
                onChange={(e) => onChange({ highlightColor: e.target.value })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </Row>
      </Group>

      <Group title="圆角">
        <Row label="页面卡片" hint="搜索框、书签卡片、侧边栏">
          <Segmented
            label="页面卡片圆角"
            value={settings.cornerRadius}
            options={RADIUS_OPTIONS}
            onChange={(v) => onChange({ cornerRadius: v })}
          />
        </Row>
        <Row label="对话框" hint="设置面板、编辑弹窗、右键菜单">
          <Segmented
            label="对话框圆角"
            value={settings.dialogCornerRadius ?? settings.cornerRadius}
            options={RADIUS_OPTIONS}
            onChange={(v) => onChange({ dialogCornerRadius: v })}
          />
        </Row>
      </Group>

      <Group title="布局" footer="占窗口宽度的比例，作用于搜索框与所有卡片。">
        <Row label="内容区宽度" stacked>
          <Segmented
            full
            label="内容区宽度预设"
            value={contentWidth}
            options={CONTENT_WIDTH_PRESETS}
            onChange={(v) => onChange({ contentWidth: v })}
          />
          <div className="flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">{CONTENT_WIDTH_MIN}%</span>
            <RangeInput
              aria-label="内容区宽度"
              min={CONTENT_WIDTH_MIN}
              max={CONTENT_WIDTH_MAX}
              step={1}
              value={contentWidth}
              className="min-w-0 flex-1"
              onChange={(e) => onChange({ contentWidth: Number(e.target.value) })}
            />
            <span className="w-11 text-right text-[12px] font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
              {contentWidth}%
            </span>
          </div>
        </Row>
      </Group>
    </>
  )

  const wallpaper = (
    <>
      <Group title="预设壁纸">
        <div className="grid grid-cols-2 gap-3 p-3.5 sm:grid-cols-4">
          {WALLPAPER_PRESETS.map((preset) => {
            const selected = settings.wallpaperUrl === preset.url
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                title={preset.name}
                onClick={() => {
                  setCustomUrl(preset.url)
                  onChange({ wallpaperUrl: preset.url })
                }}
                className="group flex min-w-0 flex-col items-center gap-1.5 text-center"
              >
                <span
                  className={`block w-full overflow-hidden rounded-lg ring-1 ring-black/10 dark:ring-white/10 transition ${
                    selected ? 'outline outline-[3px] outline-offset-2 outline-orange-500' : 'group-hover:opacity-90'
                  }`}
                >
                  <img src={preset.thumb} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                </span>
                <span
                  className={`w-full truncate text-[11px] ${
                    selected ? 'font-medium text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {preset.name}
                </span>
              </button>
            )
          })}
        </div>
        <Row label="在线图片" stacked>
          <div className="flex gap-2">
            <input
              aria-label="在线图片链接"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://..."
              className={FIELD}
            />
            <button type="button" onClick={() => onChange({ wallpaperUrl: customUrl.trim() })} className={PRIMARY_BUTTON}>
              应用
            </button>
          </div>
        </Row>
      </Group>

      <Group title="效果" footer="卡片不透明度作用于搜索框、书签卡片与侧边栏的毛玻璃底色，越低透出的壁纸越多。">
        {VISUAL_SLIDERS.map((item) => {
          const value = settings[item.key] as number
          return (
            <Row key={item.key} label={item.label}>
              <div className="flex w-full items-center gap-3 sm:w-64">
                <RangeInput
                  aria-label={item.label}
                  min={item.min}
                  max={item.max}
                  value={value}
                  className="min-w-0 flex-1"
                  onChange={(e) => onChange({ [item.key]: Number(e.target.value) } as Partial<Settings>)}
                />
                <span className="w-11 text-right text-[12px] tabular-nums text-neutral-500 dark:text-neutral-400">
                  {value}
                  {item.unit}
                </span>
              </div>
            </Row>
          )
        })}
      </Group>
    </>
  )

  const icons = (
    <>
      <Group title="占位图标" footer="网站没有 Favicon 时显示。">
        <Row label="样式">
          <Segmented
            label="占位图标"
            value={settings.fallbackIconMode || 'letter'}
            options={FALLBACK_OPTIONS}
            onChange={(v) => onChange({ fallbackIconMode: v })}
          />
        </Row>
        {settings.fallbackIconMode === 'custom' && (
          <Row label="自定义占位图" stacked>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 dark:bg-white/10 ring-1 ring-black/10 dark:ring-white/10">
                {settings.defaultPlaceholderIconUrl ? (
                  <img src={settings.defaultPlaceholderIconUrl} alt="" className="h-5 w-5 object-contain" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-neutral-400" />
                )}
              </div>
              <input
                aria-label="自定义占位图链接"
                value={settings.defaultPlaceholderIconUrl || ''}
                onChange={(e) => onChange({ defaultPlaceholderIconUrl: e.target.value, fallbackIconMode: 'custom' })}
                placeholder="https://... 或 data:image/..."
                className={FIELD}
              />
              <button type="button" onClick={() => setShowFallbackIconPicker(true)} className={SECONDARY_BUTTON}>
                图标库
              </button>
            </div>
          </Row>
        )}
      </Group>
      {onOpenIconCache && (
        <Group title="缓存" footer="清理缓存只影响本地保存的图标，不会改动书签与手动设置的图标。">
          <Row label="本地图标缓存" hint="按书签组或单个书签清理">
            <button type="button" onClick={onOpenIconCache} className={SECONDARY_BUTTON}>
              清理本地图标缓存
            </button>
          </Row>
        </Group>
      )}
    </>
  )

  const keyLink = (href: string, text: string) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-orange-600 dark:text-orange-400 hover:underline"
    >
      {text}
      <ExternalLink className="h-3 w-3" />
    </a>
  )

  const weather = (
    <>
      <Group
        title="数据源"
        footer={
          provider === 'open-meteo'
            ? 'Open-Meteo 面向非商业用途开放，无需注册 API Key 即可查询全球与国内城市的实时天气。'
            : provider === 'wttr'
              ? 'wttr.in 免费免 Key，直接返回城市基础天气与温度。'
              : '导航页顶栏会实时显示所选城市的气温与天气状况。'
        }
      >
        <div role="radiogroup" aria-label="天气数据源">
          {PROVIDERS.map((p, index) => {
            const selected = provider === p.id
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ weatherProvider: p.id })}
                className={`relative flex min-h-11 w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04] ${
                  index > 0
                    ? "before:absolute before:left-3.5 before:right-0 before:top-0 before:h-px before:bg-black/[0.07] dark:before:bg-white/[0.08] before:content-['']"
                    : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-[13px] text-neutral-900 dark:text-neutral-100">{p.name}</span>
                  <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">{p.desc}</span>
                </span>
                {selected && <Check className="h-4 w-4 shrink-0 stroke-[2.5] text-orange-500" />}
              </button>
            )
          })}
        </div>
      </Group>

      {provider === 'amap' && (
        <Group title="高德开放平台" footer="在「应用管理」中创建应用并添加 Key，服务类型务必选择「Web 服务」。">
          <Row label="Web 服务 Key" hint={keyLink('https://lbs.amap.com/api/webservice/guide/api/weatherinfo', '申请 Key')} stacked>
            <input
              type="password"
              aria-label="高德 Web 服务 Key"
              value={settings.weatherApiKey || ''}
              onChange={(e) => onChange({ weatherApiKey: e.target.value })}
              placeholder="填入高德控制台申请的 Web 服务 Key"
              className={FIELD}
            />
          </Row>
        </Group>
      )}

      {provider === 'qweather' && (
        <Group title="和风天气" footer="支持开发版或商业版 API，会自动按城市名称解析地点后查询实时天气。">
          <Row label="API Key" hint={keyLink('https://dev.qweather.com/', '前往和风控制台')} stacked>
            <input
              type="password"
              aria-label="和风天气 API Key"
              value={settings.weatherApiKey || ''}
              onChange={(e) => onChange({ weatherApiKey: e.target.value })}
              placeholder="填入和风天气 Web API Key"
              className={FIELD}
            />
          </Row>
        </Group>
      )}

      {provider === 'custom' && (
        <Group title="自定义接口" footer="字段路径留空时会自动探测常见 JSON 格式；返回纯文本（如「多云 26°C」）也能解析。">
          <Row
            label="请求 URL (GET)"
            hint={
              <>
                可用占位符 <code className="font-mono text-orange-600 dark:text-orange-400">{'{city}'}</code>、
                <code className="font-mono text-orange-600 dark:text-orange-400">{'{key}'}</code>
              </>
            }
            stacked
          >
            <input
              aria-label="自定义接口请求 URL"
              value={settings.weatherCustomUrl || ''}
              onChange={(e) => onChange({ weatherCustomUrl: e.target.value })}
              placeholder="https://api.example.com/weather?city={city}&key={key}"
              className={`${FIELD} font-mono text-[12px]`}
            />
          </Row>
          <Row label="鉴权密钥" hint="可选" stacked>
            <input
              type="password"
              aria-label="接口鉴权密钥"
              value={settings.weatherApiKey || ''}
              onChange={(e) => onChange({ weatherApiKey: e.target.value })}
              placeholder="URL 中包含 {key} 时填写"
              className={FIELD}
            />
          </Row>
          <Row label="字段路径" hint="可选" stacked>
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label="天气字段路径"
                value={settings.weatherCustomFieldPath || ''}
                onChange={(e) => onChange({ weatherCustomFieldPath: e.target.value })}
                placeholder="天气：now.text"
                className={`${FIELD} font-mono text-[12px]`}
              />
              <input
                aria-label="温度字段路径"
                value={settings.weatherCustomTempPath || ''}
                onChange={(e) => onChange({ weatherCustomTempPath: e.target.value })}
                placeholder="温度：now.temp"
                className={`${FIELD} font-mono text-[12px]`}
              />
            </div>
          </Row>
        </Group>
      )}

      <Group title="通用" footer="顶栏可随时点击天气快速切换城市。">
        <Row label="默认城市">
          <input
            aria-label="默认城市"
            value={settings.weatherCity || '广州'}
            onChange={(e) => {
              onChange({ weatherCity: e.target.value })
              setTestCity(e.target.value)
            }}
            placeholder="如 广州、杭州"
            className={`${FIELD} !w-40 text-right`}
          />
        </Row>
        <Row label="自动刷新">
          <Segmented
            label="自动刷新频率"
            value={settings.weatherAutoRefreshMinutes ?? 30}
            options={[
              { value: 15, label: '15 分钟' },
              { value: 30, label: '30 分钟' },
              { value: 60, label: '60 分钟' },
            ]}
            onChange={(v) => onChange({ weatherAutoRefreshMinutes: v })}
          />
        </Row>
      </Group>

      <Group title="连通性测试">
        <Row label="测试城市" stacked>
          <div className="flex gap-2">
            <input
              aria-label="测试城市"
              value={testCity}
              onChange={(e) => setTestCity(e.target.value)}
              placeholder="默认使用当前城市"
              className={FIELD}
            />
            <button type="button" disabled={testingWeather} onClick={() => void runWeatherTest()} className={SECONDARY_BUTTON}>
              {testingWeather ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {testingWeather ? '请求中…' : '测试接口'}
            </button>
          </div>
        </Row>
        {testResult && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 text-[13px]">
            {testResult.success ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            )}
            {testResult.success && testResult.data ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-neutral-900 dark:text-neutral-100">
                  {testResult.data.city} · {testResult.data.weather}{' '}
                  <span className="font-semibold tabular-nums">{testResult.data.temp}</span>
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">来源：{testResult.data.source}</span>
              </div>
            ) : (
              <p className="min-w-0 flex-1 leading-relaxed text-red-600 dark:text-red-400">
                {testResult.error || '未能获取到有效数据，请检查网络、API Key 或接口是否支持跨域 (CORS)'}
              </p>
            )}
          </div>
        )}
      </Group>
    </>
  )

  const body: Record<TabType, ReactNode> = {
    profile: <ProfileSection settings={settings} onChange={onChange} />,
    appearance,
    bookmarks: <BookmarksSection settings={settings} onChange={onChange} />,
    wallpaper,
    icons,
    weather,
    sync: (
      <div className="text-xs">
        <SyncTab />
      </div>
    ),
    data: (
      <DataSection
        onExportBackup={onExportBackup}
        onImportBackup={onImportBackup}
        onResetToDefaults={onResetToDefaults}
        currentCategory={currentCategory}
        categoryBookmarks={categoryBookmarks}
        onDone={onClose}
      />
    ),
  }

  const navItemClass = (selected: boolean) =>
    `flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition sm:w-full ${
      selected
        ? 'bg-orange-500 font-medium text-on-accent'
        : 'text-neutral-800 dark:text-neutral-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
    }`

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3 sm:p-6 backdrop-blur-[2px] animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        className="nav-dialog flex h-[min(680px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[#f5f5f7] dark:bg-[#1c1c1e] text-neutral-900 dark:text-neutral-100 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/10 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-150 sm:flex-row"
      >
        {/* 侧栏：桌面端竖排，窄屏横排 */}
        <aside className="flex shrink-0 flex-col border-b border-black/[0.06] dark:border-white/[0.08] bg-[#ececee] dark:bg-[#262628] sm:w-56 sm:border-b-0 sm:border-r">
          <div className="hidden h-12 shrink-0 items-center px-5 sm:flex">
            <span className="text-[15px] font-semibold">设置</span>
          </div>
          <nav aria-label="设置分类" className="flex gap-1 overflow-x-auto p-2 no-scrollbar sm:flex-col sm:overflow-y-auto sm:px-3 sm:pt-0">
            {/* 账户卡片，仿 Apple ID 入口 */}
            <button
              type="button"
              aria-current={activeTab === 'profile' ? 'page' : undefined}
              onClick={() => setActiveTab('profile')}
              className={`${navItemClass(activeTab === 'profile')} sm:py-2`}
            >
              <img
                src={settings.avatarUrl || DEFAULT_AVATAR}
                alt=""
                className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-black/10 sm:h-9 sm:w-9"
              />
              <span className="min-w-0 text-left">
                <span className="block truncate sm:font-medium">
                  <span className="sm:hidden">个人资料</span>
                  <span className="hidden sm:inline">{settings.userName || 'Nav 探索者'}</span>
                </span>
                <span
                  className={`hidden text-[11px] sm:block ${
                    activeTab === 'profile' ? 'opacity-80' : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  个人资料与头像
                </span>
              </span>
            </button>

            {NAV_GROUPS.map((group, gi) => (
              <Fragment key={gi}>
                <div className="hidden h-2 sm:block" aria-hidden />
                {group.map((tab) => {
                  const Icon = tab.icon
                  const selected = tab.id === activeTab
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => setActiveTab(tab.id)}
                      className={navItemClass(selected)}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${selected ? '' : 'text-neutral-500 dark:text-neutral-400'}`}
                        strokeWidth={1.75}
                      />
                      <span className="whitespace-nowrap">{tab.label}</span>
                      {tab.id === 'sync' && syncConfig && (
                        <span className={`ml-auto h-2 w-2 rounded-full ring-1 ring-white/70 ${syncStatusDot(syncStatus)}`} />
                      )}
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </nav>
        </aside>

        {/* 详情面板 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-black/[0.06] dark:border-white/[0.08] px-5">
            <h2 className="text-[15px] font-semibold">{TITLES[activeTab]}</h2>
            <button type="button" onClick={onClose} className={`${PRIMARY_BUTTON} px-4`}>
              完成
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-xl space-y-6">{body[activeTab]}</div>
          </div>
        </section>

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
    </div>,
    document.body,
  )
}

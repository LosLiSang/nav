import { createPortal } from 'react-dom'
import { useState } from 'react'
import { Bold, Check, Download, Edit2, Image as ImageIcon, Italic, Layers, Palette, RotateCcw, Trash2, Type, X } from 'lucide-react'
import { IconPickerModal } from './IconPickerModal'
import { ConfirmModal } from './ConfirmModal'

type TabType = 'typography' | 'layout' | 'manage'
import { resolveTextColor } from '../lib/utils'
import type { Bookmark, Category, FallbackIconMode, IconShape, Settings } from '../types'

type Props = {
  settings: Settings
  currentCategory?: Category
  categoryBookmarks: Bookmark[]
  onClose: () => void
  onChangeSettings: (values: Partial<Settings>) => void
  onRenameCategory?: (id: string, name: string) => void
  onDeleteCategory?: (id: string) => void
  onRefreshAllIcons?: () => void
}

const FONT_PRESETS = [
  {
    group: '基础单体字体',
    options: [
      {
        label: '系统默认',
        value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        desc: '原生系统极简无衬线',
      },
      {
        label: '苹方 / 鸿蒙',
        value: '"PingFang SC", "HarmonyOS Sans", "Noto Sans SC", sans-serif',
        desc: '视网膜高清黑体',
      },
      {
        label: '微软雅黑',
        value: '"Microsoft YaHei", "微软雅黑", sans-serif',
        desc: '经典 Windows 默认字体',
      },
      {
        label: '宋体 / 传统衬线',
        value: '"Noto Serif SC", "Source Han Serif SC", SimSun, serif',
        desc: '端庄典雅宋体风格',
      },
      {
        label: '楷体 / 书法韵味',
        value: 'KaiTi, "STKaiti", cursive',
        desc: '古典手写书法笔触',
      },
    ],
  },
  {
    group: '✨ 组合字体（精选优质中西文搭配）',
    options: [
      {
        label: '👨‍💻 极客代码 (JetBrains Mono + 苹方/微软雅黑)',
        value: '"JetBrains Mono", "Fira Code", Consolas, "PingFang SC", "Microsoft YaHei", monospace',
        desc: '英文代码等宽 + 中文高清黑体，极客首选',
      },
      {
        label: '🚀 现代极简 (Inter + 视网膜中文黑体)',
        value: '"Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        desc: '国际化无衬线西文 + 现代中文，极具国际范',
      },
      {
        label: '📖 人文雅集 (Georgia + 思源宋体)',
        value: 'Georgia, "Times New Roman", "Source Han Serif SC", SimSun, serif',
        desc: '古典英式衬线 + 传统思源宋体，书卷气息浓郁',
      },
      {
        label: '⚡ 旗舰科技 (SF Pro + 鸿蒙无衬线)',
        value: '"SF Pro Display", "Roboto", "Segoe UI", "HarmonyOS Sans", sans-serif',
        desc: 'Apple 旗舰西文字形 + 华为全场景黑体',
      },
      {
        label: '🍃 文艺随笔 (Caveat + 华文行楷)',
        value: '"Caveat", "Comic Sans MS", "STKaiti", KaiTi, cursive',
        desc: '随性英文字体 + 潇洒行书楷意',
      },
    ],
  },
]

export function BookmarkStyleModal({
  settings,
  currentCategory,
  categoryBookmarks,
  onClose,
  onChangeSettings,
  onRenameCategory,
  onDeleteCategory,
  onRefreshAllIcons,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('typography')
  const [showFallbackIconPicker, setShowFallbackIconPicker] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newCatName, setNewCatName] = useState(currentCategory?.name || '')
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(false)
  const [confirmRefreshIcons, setConfirmRefreshIcons] = useState(false)
  const [isCustomMode, setIsCustomMode] = useState(
    Boolean(
      settings.fontFamily &&
        !FONT_PRESETS.flatMap((g) => g.options).some((opt) => opt.value === settings.fontFamily),
    ),
  )
  const [customFontFamily, setCustomFontFamily] = useState(
    settings.fontFamily || 'system-ui, sans-serif',
  )
  const [customFontUrl, setCustomFontUrl] = useState(settings.customFontUrl || '')

  const matchedPreset = FONT_PRESETS.flatMap((g) => g.options).find(
    (opt) => opt.value === settings.fontFamily,
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 shadow-2xl max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-neutral-200/80 dark:border-neutral-800">
        
        {/* Fixed Header */}
        <div className="p-6 pb-3 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                <Type className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">书签展示与排版</h2>
                {currentCategory && (
                  <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                    当前分类：{currentCategory.name}
                  </span>
                )}
              </div>
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
              onClick={() => setActiveTab('typography')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition ${
                activeTab === 'typography'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Type className="h-4 w-4 text-orange-500" />
              字体排版
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('layout')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition ${
                activeTab === 'layout'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Palette className="h-4 w-4 text-blue-500" />
              视觉与布局
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manage')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition ${
                activeTab === 'manage'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Layers className="h-4 w-4 text-emerald-500" />
              分类与维护
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {activeTab === 'typography' && (
            <>
          {/* 1. Typography: Font Family, Size, Bold, Italic, Color */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block font-medium text-neutral-800 dark:text-neutral-200">
                书签字体与排版样式
              </label>
              {matchedPreset && (
                <span className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">
                  {matchedPreset.desc}
                </span>
              )}
            </div>

            {/* Font Family Selection Row */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-neutral-500 dark:text-neutral-400 font-medium flex-shrink-0">
                  字体系列:
                </span>
                <select
                  value={isCustomMode ? 'custom' : settings.fontFamily || ''}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === 'custom') {
                      setIsCustomMode(true)
                    } else {
                      setIsCustomMode(false)
                      onChangeSettings({ fontFamily: val })
                    }
                  }}
                  className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 px-3 py-1.5 text-xs outline-none focus:border-orange-500"
                >
                  {FONT_PRESETS.map((grp) => (
                    <optgroup key={grp.group} label={grp.group}>
                      {grp.options.map((opt) => (
                        <option key={opt.label} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <optgroup label="自定义设置">
                    <option value="custom">✍ 自定义字体（本地安装或在线 Web 字体）...</option>
                  </optgroup>
                </select>
              </div>

              {/* Custom font input fields if in custom mode */}
              {isCustomMode && (
                <div className="space-y-2 rounded-lg border border-orange-200 dark:border-orange-950/60 bg-orange-50/40 dark:bg-orange-950/20 p-2.5">
                  <div>
                    <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 block mb-1">
                      字体族名 (CSS font-family，如: "霞鹜文楷", "LXGW WenKai", sans-serif)
                    </label>
                    <input
                      value={customFontFamily}
                      onChange={(e) => {
                        setCustomFontFamily(e.target.value)
                        onChangeSettings({ fontFamily: e.target.value })
                      }}
                      placeholder='例如："Fira Code", "霞鹜文楷", sans-serif'
                      className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs outline-none focus:border-orange-500 text-neutral-800 dark:text-neutral-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 block mb-1">
                      在线 Web 字体 CSS 链接 (可选，例如 Google Fonts 或字体 CDN)
                    </label>
                    <input
                      value={customFontUrl}
                      onChange={(e) => {
                        setCustomFontUrl(e.target.value)
                        onChangeSettings({ customFontUrl: e.target.value })
                      }}
                      placeholder="https://fonts.googleapis.com/css2?family=... 或 CDN 链接"
                      className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs outline-none focus:border-orange-500 text-neutral-800 dark:text-neutral-200"
                    />
                  </div>
                </div>
              )}

              {/* Real-time typography preview */}
              <div
                style={{
                  fontFamily: isCustomMode ? customFontFamily : settings.fontFamily || undefined,
                  fontSize: settings.fontSize ? `${settings.fontSize}px` : undefined,
                  fontWeight: settings.isBold ? 700 : undefined,
                  fontStyle: settings.isItalic ? 'italic' : undefined,
                  // 用与书签卡片一致的解析结果，否则暗色下预览会显示成实际渲染不出来的颜色
                  color: resolveTextColor(settings),
                }}
                className="rounded-lg border border-neutral-200/80 dark:border-neutral-700 bg-white dark:bg-neutral-900/90 p-2.5 text-xs leading-relaxed"
              >
                <div className="font-semibold">
                  Aa Bb 1234567890 · 快速的狐狸跳过懒惰的狗
                </div>
                <div className="text-[11px] opacity-75 mt-0.5">
                  GitHub · 哔哩哔哩 · LeetCode · 知乎 · 百度网盘
                </div>
              </div>
            </div>

            {/* Controls: Size, Bold, Italic, Color */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50/50 dark:bg-neutral-800/40">
              {/* Font size */}
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500 dark:text-neutral-400 font-medium">字号:</span>
                <select
                  value={settings.fontSize}
                  onChange={(e) => onChangeSettings({ fontSize: Number(e.target.value) })}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs outline-none focus:border-orange-500"
                >
                  <option value={12}>12px (紧凑)</option>
                  <option value={13}>13px (默认)</option>
                  <option value={14}>14px (舒适)</option>
                  <option value={15}>15px (放大)</option>
                  <option value={16}>16px (大号)</option>
                </select>
              </div>

              {/* Bold */}
              <button
                type="button"
                onClick={() => onChangeSettings({ isBold: !settings.isBold })}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition ${
                  settings.isBold
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }`}
                title="文字加粗"
              >
                <Bold className="h-4 w-4" />
              </button>

              {/* Italic */}
              <button
                type="button"
                onClick={() => onChangeSettings({ isItalic: !settings.isItalic })}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs italic transition ${
                  settings.isItalic
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                    : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                }`}
                title="文字斜体"
              >
                <Italic className="h-4 w-4" />
              </button>

              {/* Color */}
              <div className="flex items-center gap-1.5">
                {[
                  { color: '#1f2937', title: '默认黑灰' },
                  { color: '#2563eb', title: '科技蓝' },
                  { color: '#ea580c', title: '活力橙' },
                  { color: '#059669', title: '青翠绿' },
                  { color: '#7c3aed', title: '优雅紫' },
                ].map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => onChangeSettings({ textColor: c.color })}
                    style={{ backgroundColor: c.color }}
                    className={`h-5 w-5 rounded-full transition ${
                      settings.textColor === c.color
                        ? 'ring-2 ring-orange-500 ring-offset-1 scale-110'
                        : 'hover:opacity-80'
                    }`}
                    title={c.title}
                  />
                ))}
              </div>
            </div>
          </div>

            </>
          )}

          {activeTab === 'layout' && (
            <>
              {/* Highlight Color (书签栏展示的高亮色) */}
          <div>
            <label className="block font-medium text-neutral-800 dark:text-neutral-200 mb-2">
              书签栏展示的高亮色
            </label>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50/50 dark:bg-neutral-800/40">
              {[
                { label: '经典蓝', color: '#2563eb' },
                { label: '活力橙', color: '#ff6900' },
                { label: '翡翠绿', color: '#10b981' },
                { label: '极客紫', color: '#8b5cf6' },
                { label: '热情红', color: '#ef4444' },
                { label: '曜石黑', color: '#171717' },
              ].map((c) => {
                const isSelected = (settings.highlightColor || '#2563eb') === c.color
                return (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => onChangeSettings({ highlightColor: c.color })}
                    style={{ backgroundColor: c.color }}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-white transition ${
                      isSelected ? 'ring-2 ring-offset-2 ring-neutral-400 scale-110 shadow-sm' : 'hover:scale-105'
                    }`}
                    title={c.label}
                  >
                    {isSelected && <Check className="h-4 w-4 stroke-[3]" />}
                  </button>
                )
              })}
              <label className="ml-auto flex items-center gap-1.5 cursor-pointer text-neutral-600 dark:text-neutral-300 text-[11px]">
                <span>自定义:</span>
                <input
                  type="color"
                  value={settings.highlightColor || '#2563eb'}
                  onChange={(e) => onChangeSettings({ highlightColor: e.target.value })}
                  className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                />
              </label>
            </div>
          </div>

          {/* 2. Icon Shape */}
          <div>
            <label className="block font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
              图标角标形状
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'square', label: '直角方块', desc: '无圆角' },
                { id: 'rounded', label: '圆角方块', desc: '轻度圆角' },
                { id: 'circle', label: '圆形徽章', desc: '正圆' },
              ].map((opt) => {
                const isSelected = settings.iconShape === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeSettings({ iconShape: opt.id as IconShape })}
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

                    {/* 2.5. Fallback Placeholder Icon */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-medium text-neutral-800 dark:text-neutral-200">
                默认占位图标（未获取到图标时）
              </label>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                当网站无官方 Favicon 时展示
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'letter', label: '首字母/品牌', desc: '彩色文字徽章' },
                { id: 'globe', label: '网络地球', desc: '简约网标 🌐' },
                { id: 'bookmark', label: '书签标记', desc: '经典徽章 🔖' },
                { id: 'custom', label: '自定义图标', desc: '指定统一图片' },
              ].map((opt) => {
                const isSelected = (settings.fallbackIconMode || 'letter') === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeSettings({ fallbackIconMode: opt.id as FallbackIconMode })}
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

            {settings.fallbackIconMode === 'custom' && (
              <div className="mt-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
                    {settings.defaultPlaceholderIconUrl ? (
                      <img src={settings.defaultPlaceholderIconUrl} alt="" className="h-5 w-5 object-contain" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-neutral-400" />
                    )}
                  </div>
                   <input
                     value={settings.defaultPlaceholderIconUrl || ''}
                     onChange={(e) => onChangeSettings({ defaultPlaceholderIconUrl: e.target.value, fallbackIconMode: 'custom' })}
                     placeholder="输入图片链接 (https://... 或 data:image/...)"
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs outline-none focus:border-orange-500 text-neutral-800 dark:text-neutral-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFallbackIconPicker(true)}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition shadow-sm flex-shrink-0"
                  >
                    从图标库选
                  </button>
                </div>
                <p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-relaxed">
                  可直接粘贴任何在线图片链接，或点击「从图标库选」选择精选品牌/分类矢量图标作为全局统一的默认占位符。
                </p>
              </div>
            )}
          </div>

          {/* 3. Card Opacity & Columns */}
          <div className="grid grid-cols-2 gap-3">
            {/* Card Opacity */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50/50 dark:bg-neutral-800/40">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-neutral-800 dark:text-neutral-200">卡片底色不透明度</span>
                <span className="font-mono text-neutral-600 dark:text-neutral-300 font-bold">{settings.cardOpacity}%</span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                value={settings.cardOpacity}
                onChange={(e) => onChangeSettings({ cardOpacity: Number(e.target.value) })}
                className="w-full accent-orange-500"
              />
            </div>

            {/* Columns */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50/50 dark:bg-neutral-800/40">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-neutral-800 dark:text-neutral-200">单行书签列数</span>
                <span className="font-mono text-neutral-600 dark:text-neutral-300 font-bold">
                  {settings.columnMode === 'auto' ? '自适应' : `${settings.manualColumns || 7} 列`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => onChangeSettings({ columnMode: 'auto' })}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                    settings.columnMode === 'auto'
                      ? 'bg-orange-500 text-white'
                      : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  自适应
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSettings({ columnMode: 'manual' })}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                    settings.columnMode !== 'auto'
                      ? 'bg-orange-500 text-white'
                      : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  固定
                </button>
                {settings.columnMode !== 'auto' && (
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeSettings({
                          manualColumns: Math.max(3, (settings.manualColumns || 7) - 1),
                        })
                      }
                      className="flex h-6 w-6 items-center justify-center rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="w-4 text-center font-bold">{settings.manualColumns || 7}</span>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeSettings({
                          manualColumns: Math.min(12, (settings.manualColumns || 7) + 1),
                        })
                      }
                      className="flex h-6 w-6 items-center justify-center rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Card Container Width */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-neutral-800 dark:text-neutral-200">卡片区整体宽度</span>
              <span className="font-mono text-neutral-600 dark:text-neutral-300 font-bold">
                {settings.cardWidth === 0 ? '100% 铺满全屏' : `${settings.cardWidth ?? 1380}px`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '紧凑 (1100px)', value: 1100 },
                { label: '标准 (1380px)', value: 1380 },
                { label: '宽屏 (1600px)', value: 1600 },
                { label: '极宽 (1920px)', value: 1920 },
                { label: '铺满全屏 (100%)', value: 0 },
              ].map((preset) => {
                const isSelected =
                  preset.value === 0
                    ? settings.cardWidth === 0
                    : (settings.cardWidth ?? 1380) === preset.value
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onChangeSettings({ cardWidth: preset.value })}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      isSelected
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
            <div className="pt-1">
              <input
                type="range"
                min={800}
                max={2400}
                step={20}
                value={settings.cardWidth === 0 ? 2400 : (settings.cardWidth ?? 1380)}
                onChange={(e) => onChangeSettings({ cardWidth: Number(e.target.value) })}
                className="w-full accent-orange-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                <span>800px (最窄)</span>
                <span>1380px (默认)</span>
                <span>2400px (最宽)</span>
              </div>
            </div>
          </div>

            </>
          )}

          {activeTab === 'manage' && (
            <div className="space-y-4">
              {/* 4. Category Quick Actions */}
          {currentCategory && (
            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3.5">
              <span className="font-medium text-neutral-700 dark:text-neutral-200 block mb-2">
                当前分类快捷管理
              </span>
              <div className="flex flex-wrap gap-2">
                {!renaming ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNewCatName(currentCategory.name)
                      setRenaming(true)
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <Edit2 className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                    <span>重命名分类</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="rounded-lg border border-orange-500 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 px-2.5 py-1 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newCatName.trim() && onRenameCategory) {
                          onRenameCategory(currentCategory.id, newCatName.trim())
                        }
                        setRenaming(false)
                      }}
                      className="rounded-lg bg-orange-500 px-3 py-1 text-white"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(false)}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-2 py-1 text-neutral-500 dark:text-neutral-400"
                    >
                      取消
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const data = JSON.stringify(categoryBookmarks, null, 2)
                    const blob = new Blob([data], { type: 'application/json' })
                    const u = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = u
                    a.download = `${currentCategory.name}-bookmarks.json`
                    a.click()
                    URL.revokeObjectURL(u)
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Download className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                  <span>导出此分类 ({categoryBookmarks.length} 个网址)</span>
                </button>

                {onRefreshAllIcons && (
                  <button
                    type="button"
                    onClick={() => setConfirmRefreshIcons(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
                    <span>重新获取全部图标</span>
                  </button>
                )}

                {onDeleteCategory && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCat(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/40 px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 ml-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    <span>删除分类</span>
                  </button>
                )}
              </div>
            </div>
          )}
            </div>
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
               onChangeSettings({ defaultPlaceholderIconUrl: url, fallbackIconMode: 'custom' })
               setShowFallbackIconPicker(false)
             }}
             onClose={() => setShowFallbackIconPicker(false)}
           />
         )}

        {/* Confirm Delete Category Modal */}
        <ConfirmModal
          open={confirmDeleteCat}
          isDanger
          title="删除分类确认"
          message={`确认删除分类「${currentCategory?.name}」及其全部网址？删除后不可撤销。`}
          confirmText="确认删除"
          onConfirm={() => {
            if (currentCategory && onDeleteCategory) {
              onDeleteCategory(currentCategory.id)
              onClose()
            }
            setConfirmDeleteCat(false)
          }}
          onCancel={() => setConfirmDeleteCat(false)}
        />

        {/* Confirm Refresh All Icons Modal */}
        <ConfirmModal
          open={confirmRefreshIcons}
          title="重新获取图标"
          message="确定要清除所有本地图标缓存并在后台重新抓取吗？"
          confirmText="开始重新获取"
          onConfirm={() => {
            onRefreshAllIcons?.()
            setConfirmRefreshIcons(false)
          }}
          onCancel={() => setConfirmRefreshIcons(false)}
        />
      </div>
    </div>
  , document.body)
}

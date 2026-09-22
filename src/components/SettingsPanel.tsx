import { useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'
import { WALLPAPER_PRESETS } from '../lib/defaults'
import type { CornerRadius, Settings } from '../types'

type Props = {
  settings: Settings
  onClose: () => void
  onChange: (values: Partial<Settings>) => void
}

export function SettingsPanel({ settings, onClose, onChange }: Props) {
  const [customUrl, setCustomUrl] = useState(settings.wallpaperUrl)

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

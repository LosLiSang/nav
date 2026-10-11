import type { Settings } from '../types'
import { RangeInput } from './RangeInput'
import {
  CONTENT_WIDTH_MAX,
  CONTENT_WIDTH_MIN,
  CONTENT_WIDTH_PRESETS,
  resolveContentWidth,
} from '../lib/contentWidth'

/** 「内容区宽度」设置：按窗口宽度百分比调节（设置面板、样式弹窗、网址样式弹窗共用）。 */
export function ContentWidthControl({
  settings,
  onChange,
  compact = false,
}: {
  settings: Settings
  onChange: (updates: Partial<Settings>) => void
  compact?: boolean
}) {
  const value = resolveContentWidth(settings)
  const set = (contentWidth: number) => onChange({ contentWidth })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className={`font-medium text-neutral-800 dark:text-neutral-100 ${compact ? 'text-sm' : ''}`}>
            内容区宽度
          </span>
          <p className="text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            占窗口宽度的比例，作用于搜索框与所有卡片
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs font-bold text-orange-600 dark:text-orange-400">
          {value}%
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {CONTENT_WIDTH_PRESETS.map((preset) => {
          const selected = value === preset.value
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => set(preset.value)}
              className={`flex flex-col items-center justify-center rounded-lg border text-xs transition ${
                compact ? 'py-1' : 'py-1.5'
              } ${
                selected
                  ? 'border-orange-500 bg-orange-50/60 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-semibold'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              <span>{preset.label}</span>
              {!compact && (
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{preset.value}%</span>
              )}
            </button>
          )
        })}
      </div>

      <div>
        <RangeInput
          aria-label="内容区宽度"
          min={CONTENT_WIDTH_MIN}
          max={CONTENT_WIDTH_MAX}
          step={1}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
        />
        <div className="flex justify-between text-[10px] text-neutral-400 dark:text-neutral-500">
          <span>{CONTENT_WIDTH_MIN}%</span>
          <span>{CONTENT_WIDTH_MAX}%</span>
        </div>
      </div>
    </div>
  )
}

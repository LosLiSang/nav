import { useState } from 'react'
import { Bold, Italic, Minus, Plus } from 'lucide-react'
import { resolveTextColor } from '../../lib/utils'
import type { IconShape, Settings } from '../../types'
import { Group, Row, Segmented } from './ui'
import { FIELD, SECONDARY_BUTTON } from './styles'

const FONT_PRESETS = [
  { label: '系统默认', value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: '苹方 / 鸿蒙', value: '"PingFang SC", "HarmonyOS Sans", "Noto Sans SC", sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", "微软雅黑", sans-serif' },
  { label: '宋体', value: '"Noto Serif SC", "Source Han Serif SC", SimSun, serif' },
  { label: '楷体', value: 'KaiTi, "STKaiti", cursive' },
  { label: '极客代码 (JetBrains Mono)', value: '"JetBrains Mono", "Fira Code", Consolas, "PingFang SC", "Microsoft YaHei", monospace' },
  { label: '现代极简 (Inter)', value: '"Inter", -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: '人文雅集 (Georgia + 宋体)', value: 'Georgia, "Times New Roman", "Source Han Serif SC", SimSun, serif' },
  { label: '旗舰科技 (SF Pro)', value: '"SF Pro Display", "Roboto", "Segoe UI", "HarmonyOS Sans", sans-serif' },
  { label: '文艺随笔 (Caveat + 行楷)', value: '"Caveat", "Comic Sans MS", "STKaiti", KaiTi, cursive' },
]

const TEXT_COLORS = [
  { color: '#1f2937', title: '默认黑灰' },
  { color: '#2563eb', title: '科技蓝' },
  { color: '#ea580c', title: '活力橙' },
  { color: '#059669', title: '青翠绿' },
  { color: '#7c3aed', title: '优雅紫' },
]

const ICON_SHAPES: { value: IconShape; label: string }[] = [
  { value: 'square', label: '直角' },
  { value: 'rounded', label: '圆角' },
  { value: 'circle', label: '圆形' },
]

const FONT_SIZES = [12, 13, 14, 15, 16].map((v) => ({ value: v, label: String(v) }))

export function BookmarksSection({
  settings,
  onChange,
}: {
  settings: Settings
  onChange: (values: Partial<Settings>) => void
}) {
  const presetMatched = FONT_PRESETS.some((f) => f.value === settings.fontFamily)
  const [customFont, setCustomFont] = useState(Boolean(settings.fontFamily) && !presetMatched)
  const columns = settings.manualColumns || 7
  const styleToggle = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-md transition ${
      active
        ? 'bg-orange-500 text-on-accent'
        : 'bg-black/[0.06] dark:bg-white/[0.08] text-neutral-700 dark:text-neutral-200 hover:bg-black/10 dark:hover:bg-white/15'
    }`

  return (
    <>
      <Group title="显示">
        <Row label="显示图标" hint="关闭后只显示标题文字">
          <input
            type="checkbox"
            role="switch"
            aria-label="显示图标"
            checked={settings.showBookmarkIcon !== false}
            onChange={(e) => onChange({ showBookmarkIcon: e.target.checked })}
            className="nav-switch"
          />
        </Row>
        <Row label="图标形状">
          <Segmented
            label="图标形状"
            value={settings.iconShape}
            options={ICON_SHAPES}
            onChange={(v) => onChange({ iconShape: v })}
          />
        </Row>
        <Row label="每行列数" hint={settings.columnMode === 'auto' ? '按标题长度和卡片宽度自动排列' : '3–12 列'}>
          <div className="flex items-center gap-2">
            {settings.columnMode !== 'auto' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="减少列数"
                  onClick={() => onChange({ manualColumns: Math.max(3, columns - 1) })}
                  className={`${SECONDARY_BUTTON} !px-1.5`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-[13px] font-medium tabular-nums">{columns}</span>
                <button
                  type="button"
                  aria-label="增加列数"
                  onClick={() => onChange({ manualColumns: Math.min(12, columns + 1) })}
                  className={`${SECONDARY_BUTTON} !px-1.5`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <Segmented
              label="列数模式"
              value={settings.columnMode === 'auto' ? 'auto' : 'manual'}
              options={[
                { value: 'auto', label: '自适应' },
                { value: 'manual', label: '固定' },
              ]}
              onChange={(v) => onChange({ columnMode: v })}
            />
          </div>
        </Row>
      </Group>

      <Group title="文字">
        <div
          data-testid="bookmark-font-preview"
          className="px-3.5 py-3 text-[13px]"
          style={{
            fontFamily: settings.fontFamily || undefined,
            fontSize: settings.fontSize ? `${settings.fontSize}px` : undefined,
            fontWeight: settings.isBold ? 700 : undefined,
            fontStyle: settings.isItalic ? 'italic' : undefined,
            color: resolveTextColor(settings),
          }}
        >
          GitHub · 哔哩哔哩 · LeetCode · 知乎 · 百度网盘
        </div>
        <Row label="字体">
          <select
            aria-label="书签字体"
            value={customFont ? 'custom' : settings.fontFamily || FONT_PRESETS[0].value}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setCustomFont(true)
              } else {
                setCustomFont(false)
                onChange({ fontFamily: e.target.value })
              }
            }}
            className={`${FIELD} !w-56`}
          >
            {FONT_PRESETS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
            <option value="custom">自定义…</option>
          </select>
        </Row>
        {customFont && (
          <Row label="自定义字体" hint="本地已安装的字体名，可附在线 Web 字体 CSS 链接" stacked>
            <input
              aria-label="字体族名"
              value={settings.fontFamily || ''}
              onChange={(e) => onChange({ fontFamily: e.target.value })}
              placeholder='"LXGW WenKai", sans-serif'
              className={FIELD}
            />
            <input
              aria-label="Web 字体 CSS 链接"
              value={settings.customFontUrl || ''}
              onChange={(e) => onChange({ customFontUrl: e.target.value })}
              placeholder="https://fonts.googleapis.com/css2?family=..."
              className={FIELD}
            />
          </Row>
        )}
        <Row label="字号">
          <Segmented
            label="书签字号"
            value={settings.fontSize}
            options={FONT_SIZES}
            onChange={(v) => onChange({ fontSize: v })}
          />
        </Row>
        <Row label="样式">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="加粗"
              aria-pressed={settings.isBold}
              onClick={() => onChange({ isBold: !settings.isBold })}
              className={styleToggle(settings.isBold)}
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="斜体"
              aria-pressed={settings.isItalic}
              onClick={() => onChange({ isItalic: !settings.isItalic })}
              className={styleToggle(settings.isItalic)}
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
          </div>
        </Row>
        <Row label="文字颜色" hint="深色模式下会自动提亮">
          <div className="flex items-center gap-2">
            {TEXT_COLORS.map((c) => (
              <button
                key={c.color}
                type="button"
                title={c.title}
                aria-label={c.title}
                aria-pressed={settings.textColor === c.color}
                onClick={() => onChange({ textColor: c.color })}
                style={{ backgroundColor: c.color }}
                className={`h-5 w-5 rounded-full ring-1 ring-inset ring-black/15 transition hover:scale-110 ${
                  settings.textColor === c.color ? 'outline outline-2 outline-offset-2 outline-neutral-400' : ''
                }`}
              />
            ))}
          </div>
        </Row>
      </Group>
    </>
  )
}

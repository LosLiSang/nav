import { useState } from 'react'
import { Bold, Check, ChevronRight, Italic, Minus, Plus } from 'lucide-react'
import {
  CJK_FONTS,
  FONT_DESIGNS,
  LATIN_FONTS,
  LEGACY_DEFAULT_FONT_FAMILY,
  composeFontFamily,
  findDesign,
  findFont,
} from '../../lib/fonts'
import { resolveTextColor } from '../../lib/utils'
import type { IconShape, Settings } from '../../types'
import { FontSlotPicker, useLocalFontFamilies } from './FontPicker'
import { Group, Row, Segmented } from './ui'
import { FIELD, SECONDARY_BUTTON } from './styles'

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
  const localFonts = useLocalFontFamilies()
  // 应用推荐搭配时重新挂载两个字体槽，清掉「本机字体」输入态
  const [pickerEpoch, setPickerEpoch] = useState(0)
  const latin = settings.fontLatin ?? ''
  const cjk = settings.fontCjk ?? ''
  const isLegacyFont =
    settings.fontLatin === undefined &&
    settings.fontCjk === undefined &&
    Boolean(settings.fontFamily) &&
    settings.fontFamily !== LEGACY_DEFAULT_FONT_FAMILY &&
    settings.fontFamily !== composeFontFamily()
  const usesLocalFont = (latin !== '' && !findFont(LATIN_FONTS, latin)) || (cjk !== '' && !findFont(CJK_FONTS, cjk))
  const activeDesign = isLegacyFont ? undefined : findDesign(latin, cjk)
  // 默认只露出推荐字体；自己拆过西文 / 中文时自动展开
  const [customOpen, setCustomOpen] = useState(() => isLegacyFont || !activeDesign)
  const setFonts = (nextLatin: string, nextCjk: string) =>
    onChange({ fontLatin: nextLatin, fontCjk: nextCjk, fontFamily: composeFontFamily(nextLatin, nextCjk) })
  const isGlobalFont = settings.fontScope === 'global'
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

      <Group
        title="书签文字"
        footer={
          <>
            {isGlobalFont
              ? '字体已应用到全部界面；字号、样式和颜色仍只作用于书签标题。'
              : '字体只作用于书签标题（主卡片和子分类），不影响界面其它文字。'}
            汉字会自动落到「中文字体」上。
            {isLegacyFont && ' 当前沿用旧版字体设置，选择任意字体后会替换。'}
          </>
        }
      >
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
        {/* 字体列表：每一项用自己的字体写出名字，右侧打勾 */}
        <div role="radiogroup" aria-label="字体设计">
          {FONT_DESIGNS.map((d) => {
            const selected = activeDesign === d
            const family = composeFontFamily(d.latin, d.cjk)
            return (
              <button
                key={d.label}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setFonts(d.latin, d.cjk)
                  setPickerEpoch((n) => n + 1)
                }}
                className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[16px] leading-snug text-neutral-900 dark:text-neutral-100"
                    style={{ fontFamily: family }}
                  >
                    {d.label}
                    <span className="ml-2.5 text-[14px] text-neutral-500 dark:text-neutral-400">
                      The quick brown fox · 永和九年
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-neutral-500 dark:text-neutral-400">{d.hint}</span>
                </span>
                <Check
                  className={`h-4 w-4 shrink-0 text-orange-500 ${selected ? '' : 'invisible'}`}
                  strokeWidth={2.5}
                />
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-neutral-900 transition hover:bg-black/[0.03] dark:text-neutral-100 dark:hover:bg-white/[0.04]"
        >
          <span>
            分别设置西文和中文
            {!customOpen && !activeDesign && (
              <span className="ml-2 text-[11px] text-neutral-500 dark:text-neutral-400">已自定义</span>
            )}
          </span>
          <ChevronRight
            className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${customOpen ? 'rotate-90' : ''}`}
          />
        </button>
        {customOpen && (
          <>
            <FontSlotPicker
              key={`latin-${pickerEpoch}`}
              label="西文字体"
              ariaLabel="书签西文字体"
              options={LATIN_FONTS}
              value={latin}
              onChange={(v) => setFonts(v, cjk)}
              local={localFonts}
            />
            <FontSlotPicker
              key={`cjk-${pickerEpoch}`}
              label="中文字体"
              ariaLabel="书签中文字体"
              options={CJK_FONTS}
              value={cjk}
              onChange={(v) => setFonts(latin, v)}
              local={localFonts}
            />
          </>
        )}
        <Row label="应用到全部界面" hint="搜索框、侧栏、设置面板等也使用上面的字体">
          <input
            type="checkbox"
            role="switch"
            aria-label="字体应用到全部界面"
            checked={isGlobalFont}
            onChange={(e) => onChange({ fontScope: e.target.checked ? 'global' : 'bookmarks' })}
            className="nav-switch"
          />
        </Row>
        {(usesLocalFont || Boolean(settings.customFontUrl)) && (
          <Row label="在线字体 CSS" hint="可选：其它设备没装这个字体时，从这里加载 Web 字体" stacked>
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

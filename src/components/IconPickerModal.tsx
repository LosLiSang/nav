import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { Camera, Loader2, RotateCcw, Search, X } from 'lucide-react'
import type { CatalogGroup } from '../lib/iconCatalog'

type Props = {
  currentIconUrl?: string
  onSelectIcon: (iconUrl: string) => void
  onClose: () => void
}

type IconStyle = 'color' | 'line'

/** 彩色图标底色：「按分类」用每组自带的颜色，其余为 Apple 系统色。 */
const TILE_COLORS = ['#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#FF453A', '#FF9500', '#30D158', '#40C8E0', '#1C1C1E']

/** Tailwind v4 的计算色是 oklch()；写进独立 SVG 前统一转成 rgb，兼容性更稳。 */
function toRgb(cssColor: string): string {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return '#ea580c'
  ctx.fillStyle = '#ea580c'
  ctx.fillStyle = cssColor
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r},${g},${b})`
}

/**
 * 把点选时已经渲染在页面上的 lucide 图标固化成独立 SVG 数据图标。
 * 必须落成具体颜色：以 <img> 渲染时脱离页面样式，currentColor 会变成黑色。
 * data-icon 记录「名称@样式」，选中态靠它做字符串比对。
 */
function svgToIconUri(svg: SVGSVGElement | null, name: string, style: IconStyle, color: string): string | null {
  if (!svg) return null
  const inner = svg.innerHTML
  const glyph = (stroke: string) =>
    `fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
  const raw =
    style === 'color'
      ? `<svg xmlns="http://www.w3.org/2000/svg" data-icon="${name}@color" viewBox="0 0 48 48" width="48" height="48"><rect width="48" height="48" rx="11" fill="${color}"/><g transform="translate(11 11) scale(1.0833)" ${glyph('#fff')}>${inner}</g></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" data-icon="${name}" viewBox="0 0 24 24" width="24" height="24" ${glyph(color)}>${inner}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`
}

export function IconPickerModal({ currentIconUrl, onSelectIcon, onClose }: Props) {
  const [catalog, setCatalog] = useState<CatalogGroup[] | null>(null)
  const [search, setSearch] = useState('')
  const [groupId, setGroupId] = useState('all')
  const [style, setStyle] = useState<IconStyle>('color')
  const [tileColor, setTileColor] = useState<string | null>(null)
  const [customInput, setCustomInput] = useState(currentIconUrl || '')

  // 图标库较大，打开选择器时才加载。
  useEffect(() => {
    let alive = true
    void import('../lib/iconCatalog').then((m) => alive && setCatalog(m.ICON_CATALOG))
    return () => {
      alive = false
    }
  }, [])

  const total = catalog?.reduce((n, g) => n + g.icons.length, 0) ?? 0

  const visibleGroups = useMemo(() => {
    if (!catalog) return []
    const q = search.trim().toLowerCase()
    return catalog
      .filter((g) => groupId === 'all' || g.id === groupId)
      .map((g) => ({
        ...g,
        icons: q
          ? g.icons.filter(
              (i) => i.name.toLowerCase().includes(q) || i.label.includes(q) || g.label.includes(q),
            )
          : g.icons,
      }))
      .filter((g) => g.icons.length > 0)
  }, [catalog, search, groupId])

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
      active
        ? 'bg-orange-500 text-on-accent shadow-sm'
        : 'bg-black/[0.05] dark:bg-white/[0.08] text-neutral-700 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/15'
    }`

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="nav-dialog flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl bg-white dark:bg-neutral-900 p-5 text-neutral-800 dark:text-neutral-200 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">选择书签图标</h3>
            {total > 0 && <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{total} 个</span>}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3.5 flex-shrink-0 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索图标，如 代码、音乐、mail…"
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 py-1.5 pl-9 pr-3 text-xs text-neutral-800 dark:text-neutral-100 outline-none focus:border-orange-500 focus:bg-white dark:focus:bg-neutral-800"
              />
            </div>
            <div role="radiogroup" aria-label="图标样式" className="flex shrink-0 rounded-lg bg-black/[0.06] dark:bg-white/[0.08] p-0.5">
              {(['color', 'line'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={style === s}
                  onClick={() => setStyle(s)}
                  className={`rounded-md px-2.5 py-1 text-[12px] transition ${
                    style === s
                      ? 'bg-white dark:bg-white/20 font-medium text-neutral-900 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.15)]'
                      : 'text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {s === 'color' ? '彩色' : '线条'}
                </button>
              ))}
            </div>
          </div>

          {style === 'color' && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300">
              <span className="shrink-0">底色</span>
              <button
                type="button"
                aria-pressed={tileColor === null}
                onClick={() => setTileColor(null)}
                className={`shrink-0 rounded-full px-2 py-0.5 transition ${
                  tileColor === null ? 'bg-orange-500 text-on-accent' : 'bg-black/[0.05] dark:bg-white/[0.08]'
                }`}
              >
                按分类
              </button>
              {TILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`底色 ${c}`}
                  aria-pressed={tileColor === c}
                  onClick={() => setTileColor(c)}
                  style={{ backgroundColor: c }}
                  className={`h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/15 transition hover:scale-110 ${
                    tileColor === c ? 'outline outline-2 outline-offset-2 outline-neutral-400' : ''
                  }`}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button type="button" onClick={() => setGroupId('all')} className={chip(groupId === 'all')}>
                全部
              </button>
              {catalog?.map((g) => (
                <button key={g.id} type="button" onClick={() => setGroupId(g.id)} className={chip(groupId === g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
            {currentIconUrl && (
              <button
                type="button"
                onClick={() => {
                  onSelectIcon('')
                  onClose()
                }}
                className="flex shrink-0 items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                <span>恢复自动拉取</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 min-h-[220px] max-h-[340px] flex-1 overflow-y-auto pr-1">
          {!catalog ? (
            <div className="flex h-[220px] items-center justify-center text-neutral-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
              没有找到「{search}」相关的图标
            </div>
          ) : (
            <div className="space-y-4">
              {visibleGroups.map((g) => (
                <section key={g.id}>
                  {groupId === 'all' && (
                    <h4 className="sticky top-0 z-10 mb-1.5 bg-white/95 dark:bg-neutral-900/95 py-0.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                      {g.label} · {g.icons.length}
                    </h4>
                  )}
                  <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
                    {g.icons.map(({ name, label, icon: Icon }) => {
                      const color = tileColor ?? g.color
                      const marker = style === 'color' ? `data-icon="${name}@color"` : `data-icon="${name}"`
                      const selected = Boolean(currentIconUrl?.includes(encodeURIComponent(marker)) || currentIconUrl?.includes(marker))
                      return (
                        <button
                          key={name}
                          type="button"
                          title={`${label} (${name})`}
                          onClick={(e) => {
                            const svg = e.currentTarget.querySelector('svg')
                            const lineColor = svg ? toRgb(getComputedStyle(svg).color) : '#ea580c'
                            const uri = svgToIconUri(svg, name, style, style === 'color' ? color : lineColor)
                            if (!uri) return
                            onSelectIcon(uri)
                            onClose()
                          }}
                          className={`flex flex-col items-center gap-1 rounded-xl p-1.5 text-center transition hover:bg-black/[0.04] dark:hover:bg-white/[0.06] ${
                            selected ? 'bg-orange-500/10 ring-1 ring-orange-500' : ''
                          }`}
                        >
                          {style === 'color' ? (
                            <span
                              style={{ backgroundColor: color }}
                              className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.15)]"
                            >
                              <Icon className="h-5 w-5" strokeWidth={2} />
                            </span>
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400">
                              <Icon className="h-5 w-5" strokeWidth={2} />
                            </span>
                          )}
                          <span className="w-full truncate text-[10px] text-neutral-700 dark:text-neutral-300">{label}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3.5 flex-shrink-0 border-t border-neutral-100 dark:border-neutral-800 pt-3">
          <span className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-300">或输入自定义图片 URL：</span>
          <div className="flex items-center gap-2">
            <input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="https://... 或 data:image/..."
              className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-xs text-neutral-800 dark:text-neutral-100 outline-none focus:border-orange-500 focus:bg-white dark:focus:bg-neutral-800"
            />
            <button
              type="button"
              onClick={() => {
                if (customInput.trim()) {
                  onSelectIcon(customInput.trim())
                  onClose()
                }
              }}
              disabled={!customInput.trim()}
              className="rounded-xl bg-orange-500 px-3.5 py-1.5 text-xs font-medium text-on-accent shadow-sm transition hover:bg-orange-600 disabled:opacity-50"
            >
              应用
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * 书签网格列宽计算（纯函数，无 DOM 依赖）。
 *
 * 自适应模式不再按浏览器视口断点硬排列数，而是根据书签标题的实际内容
 * 估算每列需要的最小宽度，再交给 CSS Grid `auto-fill` 按卡片容器真实宽度排列。
 */

/** 图标 18px + gap 8px + 左右 padding 20px + 少量余量 */
const ITEM_CHROME_PX = 50
const ITEM_CHROME_NO_ICON_PX = 24
export const MIN_ITEM_WIDTH = 112
export const MAX_ITEM_WIDTH = 220
/** 取标题宽度分位数：照顾大多数标题完整显示，不被个别超长标题拖垮列数 */
const COVERAGE = 0.8

/** 估算单个标题的渲染宽度：CJK/全角按 1em，其余按 0.58em，粗体略宽。 */
export function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  let em = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    // CJK、全角符号、emoji 等宽字符
    em += code >= 0x2e80 ? 1 : ch === ' ' ? 0.3 : /[A-Z]/.test(ch) ? 0.68 : 0.56
  }
  return em * fontSize * (bold ? 1.06 : 1)
}

export type GridTextOptions = {
  fontSize?: number
  isBold?: boolean
  showIcon?: boolean
}

/** 让约 80% 的标题能完整显示所需的列最小宽度（px）。 */
export function autoItemMinWidth(titles: string[], opts: GridTextOptions = {}): number {
  const fontSize = opts.fontSize || 13
  const chrome = opts.showIcon === false ? ITEM_CHROME_NO_ICON_PX : ITEM_CHROME_PX
  if (titles.length === 0) return MIN_ITEM_WIDTH

  const widths = titles.map((t) => estimateTextWidth(t.trim(), fontSize, opts.isBold)).sort((a, b) => a - b)
  const idx = Math.min(widths.length - 1, Math.ceil(widths.length * COVERAGE) - 1)
  const needed = Math.ceil(widths[idx] + chrome)
  return Math.min(MAX_ITEM_WIDTH, Math.max(MIN_ITEM_WIDTH, needed))
}

/** 网格模板：自适应用 auto-fill + 内容最小宽度；手动用固定列数。 */
export function bookmarkGridTemplate(
  titles: string[],
  opts: GridTextOptions & { columnMode?: 'auto' | 'manual'; manualColumns?: number },
): string {
  if (opts.columnMode !== 'auto') {
    return `repeat(${opts.manualColumns || 7}, minmax(0, 1fr))`
  }
  // min(...,100%) 防止窄屏下单列最小宽度超过容器而溢出
  return `repeat(auto-fill, minmax(min(${autoItemMinWidth(titles, opts)}px, 100%), 1fr))`
}

/**
 * 内容区宽度：以「占窗口宽度的百分比」表示（50–100）。
 * 兼容旧数据：旧版用 cardWidth 存像素上限（0 表示铺满）。
 */

export const CONTENT_WIDTH_MIN = 50
export const CONTENT_WIDTH_MAX = 100
export const DEFAULT_CONTENT_WIDTH = 75

export const CONTENT_WIDTH_PRESETS = [
  { label: '紧凑', value: 60 },
  { label: '标准', value: 75 },
  { label: '宽屏', value: 90 },
  { label: '铺满', value: 100 },
] as const

/** 旧版像素值换算时参考的常见屏幕宽度 */
const LEGACY_REFERENCE_PX = 1920

export function clampContentWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CONTENT_WIDTH
  return Math.min(CONTENT_WIDTH_MAX, Math.max(CONTENT_WIDTH_MIN, Math.round(value)))
}

/** 读取当前内容区宽度百分比；没有新字段时从旧的像素设置换算。 */
export function resolveContentWidth(settings: { contentWidth?: number; cardWidth?: number }): number {
  if (typeof settings.contentWidth === 'number') return clampContentWidth(settings.contentWidth)
  if (settings.cardWidth === 0) return CONTENT_WIDTH_MAX
  if (typeof settings.cardWidth === 'number') {
    return clampContentWidth((settings.cardWidth / LEGACY_REFERENCE_PX) * 100)
  }
  return DEFAULT_CONTENT_WIDTH
}

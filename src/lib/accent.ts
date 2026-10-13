export const DEFAULT_ACCENT = '#ff6900'

const INK_LIGHT = '#ffffff'
const INK_DARK = '#0a0a0a'

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const full = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrastRatio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/**
 * 主题色实心背景上的文字颜色。
 * 默认橙、红、紫、蓝等沿用白字（与现有设计一致，白字对比度 ≥ 2.8）；
 * 琥珀黄、翡翠绿及更浅的自定义色白字已难以辨认，改用近黑色文字。
 */
export function accentInk(color: string): string {
  const l = luminance(color)
  if (l === null) return INK_LIGHT
  return contrastRatio(1, l) >= 2.8 ? INK_LIGHT : INK_DARK
}

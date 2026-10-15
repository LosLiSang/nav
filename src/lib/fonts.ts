/**
 * 书签字体：西文与中文分别选择，再拼成一条 font-family。
 *
 * 浏览器按字符逐个回退：西文字体不含汉字，所以汉字会落到后面的中文字体上。
 * 因此西文栈里刻意不放 system-ui —— 它在中文系统上自带汉字字形，会让中文选择失效。
 *
 * 只用电脑上本来就有的普通字体（Windows 名在前、macOS 同类字体在后），不打包 Web 字体。
 * 推荐项就是单一字体：选「宋体」就是整段文字都用宋体，不做中西文混搭。
 */

export type FontKind = 'sans' | 'serif' | 'mono' | 'script'

export interface FontOption {
  label: string
  /** CSS font-family 列表（不含通用族名） */
  stack: string
  kind: FontKind
}

export const SYSTEM_LATIN_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial'

// 常见系统字体：Windows 自带在前，macOS 对应字体在后
const HEITI = '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC"'
const SONGTI = 'SimSun, "Songti SC"'
const KAITI = 'KaiTi, STKaiti, "Kaiti SC"'
const FANGSONG = 'FangSong, STFangsong'
const MONO = 'Consolas, Menlo'

export const LATIN_FONTS: FontOption[] = [
  { label: '系统默认', stack: '', kind: 'sans' },
  { label: '微软雅黑', stack: HEITI, kind: 'sans' },
  { label: 'Arial', stack: 'Arial', kind: 'sans' },
  { label: 'Times New Roman', stack: '"Times New Roman"', kind: 'serif' },
  { label: 'Georgia', stack: 'Georgia', kind: 'serif' },
  { label: '宋体', stack: SONGTI, kind: 'serif' },
  { label: '楷体', stack: KAITI, kind: 'script' },
  { label: '仿宋', stack: FANGSONG, kind: 'script' },
  { label: 'Consolas', stack: MONO, kind: 'mono' },
]

export const CJK_FONTS: FontOption[] = [
  { label: '自动匹配西文风格', stack: '', kind: 'sans' },
  { label: '微软雅黑', stack: HEITI, kind: 'sans' },
  { label: '宋体', stack: SONGTI, kind: 'serif' },
  { label: '楷体', stack: KAITI, kind: 'script' },
  { label: '仿宋', stack: FANGSONG, kind: 'script' },
]

const AUTO_CJK: Record<FontKind, string> = {
  sans: HEITI,
  serif: SONGTI,
  mono: HEITI,
  script: KAITI,
}

const GENERIC: Record<FontKind, string> = {
  sans: 'sans-serif',
  serif: 'serif',
  mono: 'monospace',
  script: 'serif',
}

export const FONT_KIND_LABEL: Record<FontKind, string> = {
  sans: '无衬线',
  serif: '衬线',
  mono: '等宽',
  script: '楷体 / 仿宋',
}

export interface FontDesign {
  label: string
  hint: string
  latin: string
  cjk: string
}

export const FONT_DESIGNS: FontDesign[] = [
  { label: '系统默认', hint: '跟随操作系统', latin: '', cjk: '' },
  { label: '黑体', hint: '微软雅黑 / 苹方', latin: HEITI, cjk: HEITI },
  { label: '宋体', hint: 'SimSun / 宋体-简', latin: SONGTI, cjk: SONGTI },
  { label: '楷体', hint: 'KaiTi / 楷体-简', latin: KAITI, cjk: KAITI },
  { label: '仿宋', hint: 'FangSong / 仿宋', latin: FANGSONG, cjk: FANGSONG },
  // 等宽字体没有汉字，汉字仍用黑体
  { label: '等宽', hint: 'Consolas / Menlo', latin: MONO, cjk: HEITI },
]

export function findDesign(latin: string, cjk: string): FontDesign | undefined {
  return FONT_DESIGNS.find((d) => d.latin === latin && d.cjk === cjk)
}

export function findFont(list: FontOption[], stack: string | undefined): FontOption | undefined {
  return list.find((f) => f.stack === (stack ?? ''))
}

/** 本机字体名转为 CSS 族名：已带引号或逗号的原样保留。 */
export function quoteFamily(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || /[",']/.test(trimmed)) return trimmed
  return `"${trimmed}"`
}

export function unquoteFamily(stack: string): string {
  const m = stack.trim().match(/^"([^"]*)"$/)
  return m ? m[1] : stack
}

export function composeFontFamily(latin = '', cjk = ''): string {
  const kind = findFont(LATIN_FONTS, latin)?.kind ?? findFont(CJK_FONTS, cjk)?.kind ?? 'sans'
  const latinStack = latin.trim() || SYSTEM_LATIN_STACK
  const cjkStack = cjk.trim() || AUTO_CJK[kind]
  // 中西文同一字体（单一字体推荐项）时不重复
  const parts = latinStack === cjkStack ? [latinStack] : [latinStack, cjkStack]
  return [...parts, GENERIC[kind]].join(', ')
}

/** 旧版默认值；视为「未自定义」 */
export const LEGACY_DEFAULT_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

type LocalFontData = { family: string }

export function canQueryLocalFonts(): boolean {
  return typeof window !== 'undefined' && 'queryLocalFonts' in window
}

/** Local Font Access API（Chromium）；需要用户手势和权限。 */
export async function queryLocalFontFamilies(): Promise<string[]> {
  const query = (window as unknown as { queryLocalFonts?: () => Promise<LocalFontData[]> }).queryLocalFonts
  if (!query) return []
  const fonts = await query.call(window)
  return [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

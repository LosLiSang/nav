/**
 * 现代化日历与农历、节气、节日工具库
 * 基于标准浏览器原生 Intl API (zh-CN-u-ca-chinese) + 二十四节气天文算法
 * 零外部依赖，精准支持 1900-2100 年
 */

export interface CalendarDayInfo {
  date: Date
  year: number
  month: number // 1 - 12
  day: number // 1 - 31
  dayOfWeek: number // 1(周一) - 7(周日)
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  isWeekend: boolean
  lunarYearName: string // 如 "丙午"
  lunarZodiac: string // 如 "马"
  lunarMonthName: string // 如 "八月"、"闰六月"
  lunarDayName: string // 如 "初一"、"十九"
  solarTerm: string | null // 节气名称，如 "白露"、"秋分"
  holiday: string | null // 节日名称，如 "中秋节"、"国庆节"
  isHoliday: boolean
  subText: string // 优先展示：节日 > 节气 > 农历初一(月名) > 农历日
  tooltip: string // 悬浮提示：如 "2026年9月29日 丙午马年 农历八月十九 星期二"
}

const ZODIAC_MAP: Record<string, string> = {
  子: '鼠',
  丑: '牛',
  寅: '虎',
  卯: '兔',
  辰: '龙',
  巳: '蛇',
  午: '马',
  未: '羊',
  申: '猴',
  酉: '鸡',
  戌: '狗',
  亥: '猪',
}

const LUNAR_DAY_NAMES = [
  '',
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
]

const SOLAR_FESTIVALS: Record<string, string> = {
  '1-1': '元旦',
  '2-14': '情人节',
  '3-8': '妇女节',
  '3-12': '植树节',
  '4-1': '愚人节',
  '5-1': '劳动节',
  '5-4': '青年节',
  '6-1': '儿童节',
  '7-1': '建党节',
  '8-1': '建军节',
  '9-10': '教师节',
  '10-1': '国庆节',
  '10-24': '程序员节',
  '11-11': '双十一',
  '12-25': '圣诞节',
}

const LUNAR_FESTIVALS: Record<string, string> = {
  '1-1': '春节',
  '1-15': '元宵节',
  '2-2': '龙抬头',
  '5-5': '端午节',
  '7-7': '七夕',
  '7-15': '中元节',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八',
  '12-23': '小年',
}

const SOLAR_TERMS_INFO = [
  { name: '小寒', month: 1, c: 5.4055 },
  { name: '大寒', month: 1, c: 20.12 },
  { name: '立春', month: 2, c: 3.87 },
  { name: '雨水', month: 2, c: 18.73 },
  { name: '惊蛰', month: 3, c: 5.63 },
  { name: '春分', month: 3, c: 20.646 },
  { name: '清明', month: 4, c: 4.81 },
  { name: '谷雨', month: 4, c: 20.1 },
  { name: '立夏', month: 5, c: 5.52 },
  { name: '小满', month: 5, c: 21.04 },
  { name: '芒种', month: 6, c: 5.678 },
  { name: '夏至', month: 6, c: 21.37 },
  { name: '小暑', month: 7, c: 7.108 },
  { name: '大暑', month: 7, c: 22.83 },
  { name: '立秋', month: 8, c: 7.5 },
  { name: '处暑', month: 8, c: 23.13 },
  { name: '白露', month: 9, c: 7.646 },
  { name: '秋分', month: 9, c: 23.042 },
  { name: '寒露', month: 10, c: 8.318 },
  { name: '霜降', month: 10, c: 23.438 },
  { name: '立冬', month: 11, c: 7.438 },
  { name: '小雪', month: 11, c: 22.36 },
  { name: '大雪', month: 12, c: 7.18 },
  { name: '冬至', month: 12, c: 21.94 },
]

export function getSolarTerm(year: number, month: number, day: number): string | null {
  const y = year % 100
  const d = 0.2422
  for (const term of SOLAR_TERMS_INFO) {
    if (term.month === month) {
      const termDay = Math.floor(y * d + term.c) - Math.floor(y / 4)
      if (termDay === day) return term.name
    }
  }
  return null
}

export function getCalendarDayInfo(
  date: Date,
  viewYear: number,
  viewMonth: number,
  selectedDate?: Date | null
): CalendarDayInfo {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const rawDayOfWeek = date.getDay()
  const dayOfWeek = rawDayOfWeek === 0 ? 7 : rawDayOfWeek
  const isWeekend = dayOfWeek === 6 || dayOfWeek === 7

  const isCurrentMonth = year === viewYear && date.getMonth() === viewMonth
  const today = new Date()
  const isToday =
    year === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    day === today.getDate()

  const isSelected = selectedDate
    ? year === selectedDate.getFullYear() &&
      date.getMonth() === selectedDate.getMonth() &&
      day === selectedDate.getDate()
    : isToday

  // 中文农历部分
  const zhParts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).formatToParts(date)

  let lunarYearName = ''
  let lunarMonthName = ''
  for (const p of zhParts) {
    if ((p.type as string) === 'yearName') lunarYearName = p.value
    if (p.type === 'month') lunarMonthName = p.value
  }

  const lastChar = lunarYearName.slice(-1)
  const lunarZodiac = ZODIAC_MAP[lastChar] || ''

  // 获取英文数值农历信息（用于精准节日判断）
  const enParts = new Intl.DateTimeFormat('en-US-u-ca-chinese', {
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)

  let lMonth = 1
  let isLeap = false
  let lDay = 1
  for (const p of enParts) {
    if (p.type === 'month') {
      if (p.value.includes('bis')) isLeap = true
      lMonth = parseInt(p.value.replace(/[^0-9]/g, ''), 10) || 1
    }
    if (p.type === 'day') {
      lDay = parseInt(p.value, 10) || 1
    }
  }

  // 节气
  const solarTerm = getSolarTerm(year, month, day)

  // 节日判断
  let holiday: string | null = null

  // 检查是否是除夕（次日是正月初一）
  const tomorrow = new Date(date.getTime() + 86400000)
  const tomParts = new Intl.DateTimeFormat('en-US-u-ca-chinese', {
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(tomorrow)
  let tomMonth = 1
  let tomDay = 1
  for (const p of tomParts) {
    if (p.type === 'month') tomMonth = parseInt(p.value.replace(/[^0-9]/g, ''), 10) || 1
    if (p.type === 'day') tomDay = parseInt(p.value, 10) || 1
  }
  if (tomMonth === 1 && tomDay === 1) {
    holiday = '除夕'
  } else if (!isLeap && LUNAR_FESTIVALS[`${lMonth}-${lDay}`]) {
    holiday = LUNAR_FESTIVALS[`${lMonth}-${lDay}`]
  } else if (SOLAR_FESTIVALS[`${month}-${day}`]) {
    holiday = SOLAR_FESTIVALS[`${month}-${day}`]
  } else if (solarTerm) {
    holiday = solarTerm
  }

  const lunarDayName = lDay === 1 ? lunarMonthName : (LUNAR_DAY_NAMES[lDay] || `${lDay}`)
  const subText = holiday || lunarDayName

  const weekDayNames = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const tooltip = `${year}年${month}月${day}日 ${lunarYearName}${lunarZodiac ? `${lunarZodiac}年` : ''} 农历${lunarMonthName}${lunarDayName} ${weekDayNames[dayOfWeek] || ''}${holiday ? ` · ${holiday}` : ''}`

  return {
    date,
    year,
    month,
    day,
    dayOfWeek,
    isCurrentMonth,
    isToday,
    isSelected,
    isWeekend,
    lunarYearName,
    lunarZodiac,
    lunarMonthName,
    lunarDayName,
    solarTerm,
    holiday,
    isHoliday: Boolean(holiday),
    subText,
    tooltip,
  }
}

export function getMonthCalendarGrid(viewYear: number, viewMonth: number, selectedDate?: Date | null): CalendarDayInfo[] {
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1)
  const rawFirstDayOfWeek = firstDayOfMonth.getDay()
  // 周一作为 0 偏移，周日作为 6 偏移
  const offset = (rawFirstDayOfWeek + 6) % 7

  const startDate = new Date(viewYear, viewMonth, 1 - offset)
  const grid: CalendarDayInfo[] = []

  // 固定生成 42 天（6 行 7 列），保证月份切换时卡片高度稳定如一
  for (let i = 0; i < 42; i++) {
    const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i)
    grid.push(getCalendarDayInfo(currentDate, viewYear, viewMonth, selectedDate))
  }

  return grid
}

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
} from 'lucide-react'
import { generateTotp } from '../lib/totp'
import { getCalendarDayInfo, getMonthCalendarGrid } from '../lib/calendar'
import type {
  Settings,
  TotpItem,
  WidgetTab,
} from '../types'

type Props = {
  totpAccounts: TotpItem[]
  settings: Settings
  cardOpacity: number
  onSelectWidgetTab: (tab: WidgetTab) => void
  onAddTotp: (name: string, secret: string, issuer?: string) => void
  onDeleteTotp: (id: string) => void
}

export function WidgetToolsCard({
  totpAccounts,
  settings,
  cardOpacity,
  onSelectWidgetTab,
  onAddTotp,
  onDeleteTotp,
}: Props) {
  const cardRadius =
    settings.cornerRadius === 'none'
      ? 'rounded-none'
      : settings.cornerRadius === 'md'
        ? 'rounded-xl'
        : 'rounded-2xl'
  const isDark = settings.themeMode === 'dark'
  const cardBg = isDark
    ? `rgba(24, 24, 27, ${cardOpacity / 100})`
    : `rgba(255, 255, 255, ${cardOpacity / 100})`
  const accentColor = settings.highlightColor || '#ff6900'

  const [totpCodes, setTotpCodes] = useState<
    Record<string, { code: string; remainingSec: number; progress: number }>
  >({})
  const [showAddTotp, setShowAddTotp] = useState(false)
  const [newTotpName, setNewTotpName] = useState('')
  const [newTotpSecret, setNewTotpSecret] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [qrText, setQrText] = useState('https://github.com')
  const [qrDataUrl, setQrDataUrl] = useState('')

  const [devToolTab, setDevToolTab] = useState<'base64' | 'url' | 'timestamp' | 'uuid'>('base64')
  const [devInput, setDevInput] = useState('')
  const [devOutput, setDevOutput] = useState('')

  const [viewDate, setViewDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date())

  const viewYear = viewDate.getFullYear()
  const viewMonth = viewDate.getMonth()
  const [today] = useState(() => new Date())
  const calendarGrid = useMemo(
    () => getMonthCalendarGrid(viewYear, viewMonth, selectedDate),
    [viewYear, viewMonth, selectedDate]
  )

  const isViewingCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth()

  const selectedDayInfo = useMemo(() => {
    const target = selectedDate || today
    return getCalendarDayInfo(target, target.getFullYear(), target.getMonth(), target)
  }, [selectedDate, today])

  function handlePrevMonth() {
    setViewDate(new Date(viewYear, viewMonth - 1, 1))
  }
  function handleNextMonth() {
    setViewDate(new Date(viewYear, viewMonth + 1, 1))
  }
  function handleGoToday() {
    const now = new Date()
    setViewDate(now)
    setSelectedDate(now)
  }

  useEffect(() => {
    if (settings.activeWidgetTab !== 'totp' || totpAccounts.length === 0) return
    let timer: NodeJS.Timeout
    async function updateTotp() {
      const next: Record<string, { code: string; remainingSec: number; progress: number }> = {}
      for (const item of totpAccounts) {
        const res = await generateTotp(item.secret)
        next[item.id] = res
      }
      setTotpCodes(next)
    }
    updateTotp()
    timer = setInterval(updateTotp, 1000)
    return () => clearInterval(timer)
  }, [totpAccounts, settings.activeWidgetTab])

  useEffect(() => {
    if (!qrText) {
      setQrDataUrl('')
      return
    }
    QRCode.toDataURL(qrText, { width: 160, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''))
  }, [qrText])

  useEffect(() => {
    try {
      if (devToolTab === 'base64') {
        setDevOutput(devInput ? btoa(unescape(encodeURIComponent(devInput))) : '')
      } else if (devToolTab === 'url') {
        setDevOutput(devInput ? encodeURIComponent(devInput) : '')
      } else if (devToolTab === 'timestamp') {
        const ts = devInput ? Number(devInput) : Date.now()
        const date = new Date(isNaN(ts) ? Date.now() : ts)
        setDevOutput(date.toLocaleString('zh-CN'))
      } else if (devToolTab === 'uuid') {
        setDevOutput(crypto.randomUUID())
      }
    } catch {
      setDevOutput('转换失败，请检查输入')
    }
  }, [devInput, devToolTab])

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="relative w-full lg:w-[380px] flex-shrink-0">
      {/* Cute typing cat illustration */}
      <div className="pointer-events-none absolute -top-11 right-6 z-10 flex items-center">
        <svg
          width="72"
          height="48"
          viewBox="0 0 120 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-md"
        >
          <ellipse cx="60" cy="12" rx="16" ry="4" stroke="#f59e0b" strokeWidth="2.5" />
          <path
            d="M32 36C32 24 44 18 60 18C76 18 88 24 88 36C88 46 80 54 60 54C40 54 32 46 32 36Z"
            fill="#ffffff"
            stroke="#334155"
            strokeWidth="2.5"
          />
          <polygon points="36,24 28,12 44,18" fill="#ffffff" stroke="#334155" strokeWidth="2" />
          <polygon points="84,24 92,12 76,18" fill="#ffffff" stroke="#334155" strokeWidth="2" />
          <path d="M48 34C48 34 50 36 53 34" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
          <path d="M67 34C67 34 70 36 73 34" stroke="#334155" strokeWidth="2" strokeLinecap="round" />
          <circle cx="44" cy="38" r="3" fill="#fca5a5" />
          <circle cx="76" cy="38" r="3" fill="#fca5a5" />
          <path d="M57 39Q60 42 63 39" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="25" y="52" width="70" height="18" rx="3" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
          <line x1="32" y1="58" x2="88" y2="58" stroke="#94a3b8" strokeWidth="2" strokeDasharray="3 3" />
          <line x1="32" y1="64" x2="88" y2="64" stroke="#94a3b8" strokeWidth="2" strokeDasharray="3 3" />
          <ellipse cx="44" cy="50" rx="6" ry="5" fill="#ffffff" stroke="#334155" strokeWidth="2" />
          <ellipse cx="76" cy="50" rx="6" ry="5" fill="#ffffff" stroke="#334155" strokeWidth="2" />
        </svg>
      </div>

      {/* Widget Card Container */}
      <div
        className={`flex flex-col overflow-hidden border border-neutral-100/90 dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md text-neutral-800 dark:text-neutral-100 ${cardRadius}`}
        style={{ backgroundColor: cardBg }}
      >
        {/* Tabs header */}
        <div className="flex items-center gap-1 border-b border-neutral-100 dark:border-neutral-800 px-3 py-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => onSelectWidgetTab('calendar')}
            style={{
              backgroundColor: (settings.activeWidgetTab === 'calendar' || settings.activeWidgetTab === 'memo') ? `${accentColor}18` : undefined,
              color: (settings.activeWidgetTab === 'calendar' || settings.activeWidgetTab === 'memo') ? accentColor : undefined,
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              settings.activeWidgetTab === 'calendar' || settings.activeWidgetTab === 'memo'
                ? 'font-semibold'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            日历
          </button>
          <button
            type="button"
            onClick={() => onSelectWidgetTab('totp')}
            style={{
              backgroundColor: settings.activeWidgetTab === 'totp' ? `${accentColor}18` : undefined,
              color: settings.activeWidgetTab === 'totp' ? accentColor : undefined,
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              settings.activeWidgetTab === 'totp'
                ? 'font-semibold'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            2FA
          </button>
          <button
            type="button"
            onClick={() => onSelectWidgetTab('qrcode')}
            style={{
              backgroundColor: settings.activeWidgetTab === 'qrcode' ? `${accentColor}18` : undefined,
              color: settings.activeWidgetTab === 'qrcode' ? accentColor : undefined,
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              settings.activeWidgetTab === 'qrcode'
                ? 'font-semibold'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            二维码
          </button>
          <button
            type="button"
            onClick={() => onSelectWidgetTab('tools')}
            style={{
              backgroundColor: settings.activeWidgetTab === 'tools' ? `${accentColor}18` : undefined,
              color: settings.activeWidgetTab === 'tools' ? accentColor : undefined,
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              settings.activeWidgetTab === 'tools'
                ? 'font-semibold'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            开发工具
          </button>
        </div>

        {/* Tab 2: Calendar */}
        {(settings.activeWidgetTab === 'calendar' || settings.activeWidgetTab === 'memo') && (
          <div className="p-2.5 text-xs">
            <div className="flex items-center justify-between pb-1.5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
                  title="上一月"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="font-bold text-neutral-800 dark:text-neutral-200 text-xs tracking-tight">
                  {viewYear}年 {String(viewMonth + 1).padStart(2, '0')}月
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
                  title="下一月"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-normal">
                  {selectedDayInfo.lunarYearName}{selectedDayInfo.lunarZodiac ? `${selectedDayInfo.lunarZodiac}年` : ''}
                </span>
                {!isViewingCurrentMonth && (
                  <button
                    type="button"
                    onClick={handleGoToday}
                    style={{ color: accentColor }}
                    className="text-[10px] font-medium hover:underline"
                  >
                    回今天
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center font-medium text-neutral-400 py-0.5 text-[11px] border-y border-neutral-100 dark:border-neutral-800">
              <span>一</span>
              <span>二</span>
              <span>三</span>
              <span>四</span>
              <span>五</span>
              <span style={{ color: accentColor }}>六</span>
              <span style={{ color: accentColor }}>日</span>
            </div>

            <div className="mt-1 grid grid-cols-7 gap-0.5 text-center">
              {calendarGrid.map((dayInfo, idx) => {
                const isToday = dayInfo.isToday
                const isSelected = dayInfo.isSelected && !isToday
                const isHoliday = dayInfo.isHoliday

                let bgClass = 'hover:bg-neutral-100 dark:hover:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300'
                let customStyle: React.CSSProperties | undefined = undefined

                if (isToday) {
                  bgClass = 'font-bold text-white shadow-sm ring-1 ring-white/20'
                  customStyle = { backgroundColor: accentColor }
                } else if (isSelected) {
                  bgClass = 'font-semibold'
                  customStyle = {
                    backgroundColor: `${accentColor}18`,
                    color: accentColor,
                    outline: `1.5px solid ${accentColor}88`,
                  }
                } else if (!dayInfo.isCurrentMonth) {
                  bgClass = 'opacity-30 hover:opacity-75 text-neutral-400 dark:text-neutral-500'
                }

                return (
                  <button
                    key={`${dayInfo.year}-${dayInfo.month}-${dayInfo.day}-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelectedDate(dayInfo.date)
                      if (!dayInfo.isCurrentMonth) {
                        setViewDate(new Date(dayInfo.year, dayInfo.month - 1, 1))
                      }
                    }}
                    title={dayInfo.tooltip}
                    style={customStyle}
                    className={`flex flex-col items-center justify-center rounded-md py-1 transition cursor-pointer select-none ${bgClass}`}
                  >
                    <span className="text-[12px] leading-tight font-medium">{dayInfo.day}</span>
                    <span
                      style={{
                        color: isToday
                          ? 'rgba(255,255,255,0.85)'
                          : isHoliday && dayInfo.isCurrentMonth
                            ? accentColor
                            : undefined,
                      }}
                      className={`text-[8px] leading-tight mt-0.5 scale-90 truncate max-w-[95%] ${
                        isToday
                          ? 'text-white/85 font-medium'
                          : isHoliday && dayInfo.isCurrentMonth
                            ? 'font-semibold'
                            : 'text-neutral-400 dark:text-neutral-500'
                      }`}
                    >
                      {dayInfo.subText}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Bottom info strip for selected date */}
            <div className="mt-1.5 flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800/80 pt-1.5 px-0.5 text-[10.5px] text-neutral-500 dark:text-neutral-400">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {selectedDayInfo.month}月{selectedDayInfo.day}日
                </span>
                <span>·</span>
                <span>农历{selectedDayInfo.lunarMonthName}{selectedDayInfo.lunarDayName}</span>
                {selectedDayInfo.holiday && (
                  <span
                    style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
                    className="rounded px-1 py-0.2 text-[9.5px] font-semibold"
                  >
                    {selectedDayInfo.holiday}
                  </span>
                )}
              </div>
              <span className="text-[9.5px] text-neutral-400 dark:text-neutral-500 flex-shrink-0">
                {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][selectedDayInfo.date.getDay()]}
              </span>
            </div>
          </div>
        )}

        {/* Tab 3: 2FA/TOTP */}
        {settings.activeWidgetTab === 'totp' && (
          <div className="flex flex-col p-3.5 text-xs">
            <div className="flex items-center justify-between pb-3">
              <span className="text-neutral-500 font-medium text-[11px]">离线 2FA 动态口令</span>
              <button
                type="button"
                onClick={() => setShowAddTotp(!showAddTotp)}
                style={{ color: accentColor }}
                className="flex items-center gap-1 text-xs hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{showAddTotp ? '收起' : '添加账号'}</span>
              </button>
            </div>

            {showAddTotp && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newTotpName.trim() && newTotpSecret.trim()) {
                    onAddTotp(newTotpName, newTotpSecret)
                    setNewTotpName('')
                    setNewTotpSecret('')
                    setShowAddTotp(false)
                  }
                }}
                className="mb-3 space-y-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3"
              >
                <input
                  value={newTotpName}
                  onChange={(e) => setNewTotpName(e.target.value)}
                  placeholder="账号名称 (例如 GitHub / Google)"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 px-3 py-1.5 text-xs outline-none"
                  required
                />
                <input
                  value={newTotpSecret}
                  onChange={(e) => setNewTotpSecret(e.target.value)}
                  placeholder="2FA 密钥 (Base32 格式)"
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 px-3 py-1.5 text-xs font-mono outline-none"
                  required
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddTotp(false)}
                    className="rounded px-2.5 py-1 text-neutral-500"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    style={{ backgroundColor: accentColor }}
                    className="rounded-lg px-3.5 py-1 text-white shadow-sm hover:opacity-90 transition"
                  >
                    保存
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 gap-2 max-h-[240px] overflow-y-auto pr-1">
              {totpAccounts.length === 0 ? (
                <div className="py-6 text-center text-neutral-400">暂无 2FA 账号</div>
              ) : (
                totpAccounts.map((acc) => {
                  const data = totpCodes[acc.id] ?? {
                    code: '------',
                    remainingSec: 30,
                    progress: 1,
                  }
                  const formattedCode =
                    data.code.length === 6
                      ? `${data.code.slice(0, 3)} ${data.code.slice(3)}`
                      : data.code

                  return (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/60 dark:bg-[#27272a]/60 p-2.5"
                    >
                      <div>
                        <div className="font-medium text-xs text-neutral-800 dark:text-neutral-200">{acc.name}</div>
                        <div className="font-mono text-base font-bold tracking-wider text-blue-600">
                          {formattedCode}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[10px] font-bold text-neutral-600 dark:text-neutral-300"
                          title={`${data.remainingSec} 秒后刷新`}
                        >
                          <span>{data.remainingSec}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCopy(data.code, acc.id)}
                          title="复制验证码"
                          className="rounded p-1 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-200"
                        >
                          {copiedId === acc.id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteTotp(acc.id)}
                          title="删除"
                          className="rounded p-1 text-neutral-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Tab 4: QR Code */}
        {settings.activeWidgetTab === 'qrcode' && (
          <div className="flex flex-col items-center p-3.5 text-xs">
            <input
              value={qrText}
              onChange={(e) => setQrText(e.target.value)}
              placeholder="输入文本或网址生成二维码"
              className="w-full max-w-md rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#27272a] text-neutral-800 dark:text-neutral-100 px-3 py-2 text-xs outline-none focus:border-orange-400"
            />
            {qrDataUrl ? (
              <div className="mt-2.5 flex flex-col items-center">
                <img src={qrDataUrl} alt="QR Code" className="h-28 w-28 rounded-lg shadow-sm bg-white p-1" />
                <div className="mt-2 flex gap-2">
                  <a
                    href={qrDataUrl}
                    download="qrcode.png"
                    className="rounded-lg bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  >
                    下载
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy(qrText, 'qr')}
                    className="rounded-lg bg-neutral-100 dark:bg-neutral-800 px-3 py-1 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  >
                    {copiedId === 'qr' ? '已复制' : '复制内容'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-6 text-neutral-400">请输入内容生成二维码</div>
            )}
          </div>
        )}

        {/* Tab 5: Dev Tools */}
        {settings.activeWidgetTab === 'tools' && (
          <div className="flex flex-col p-3.5 text-xs">
            <div className="flex items-center gap-1 border-b border-neutral-100 dark:border-neutral-800 pb-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
              {(['base64', 'url', 'timestamp', 'uuid'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDevToolTab(tab)}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${
                    devToolTab === tab
                      ? 'bg-neutral-800 dark:bg-neutral-700 text-white'
                      : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  {tab === 'base64' && 'Base64'}
                  {tab === 'url' && 'URL'}
                  {tab === 'timestamp' && '时间戳'}
                  {tab === 'uuid' && 'UUID'}
                </button>
              ))}
            </div>

            <div className="mt-2.5 space-y-2">
              {devToolTab !== 'uuid' && (
                <input
                  value={devInput}
                  onChange={(e) => setDevInput(e.target.value)}
                  placeholder={
                    devToolTab === 'timestamp'
                      ? '毫秒时间戳 (留空即当前时间)'
                      : '输入待处理文本...'
                  }
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#27272a] text-neutral-800 dark:text-neutral-100 px-3 py-1.5 text-xs outline-none focus:border-orange-400"
                />
              )}

              <div className="relative">
                <textarea
                  readOnly
                  value={devOutput}
                  rows={3}
                  placeholder="转换结果"
                  className="w-full resize-none rounded-lg bg-neutral-50 dark:bg-[#27272a] p-2.5 font-mono text-xs text-neutral-800 dark:text-neutral-100 outline-none border border-neutral-200 dark:border-neutral-700"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(devOutput, 'dev')}
                  className="absolute right-2.5 top-2.5 rounded-lg bg-white dark:bg-neutral-700 px-2.5 py-1 text-[11px] text-neutral-600 dark:text-neutral-200 shadow hover:bg-neutral-100 dark:hover:bg-neutral-600"
                >
                  {copiedId === 'dev' ? '已复制' : '复制结果'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

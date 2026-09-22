import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, MapPin, Settings, Sun, X } from 'lucide-react'

type Props = {
  avatarUrl?: string
  city?: string
  onUpdateCity?: (city: string) => void
  onOpenSettings: () => void
  onOpenProfile: () => void
}

const POPULAR_CITIES = ['杭州', '北京', '上海', '广州', '深圳', '成都', '武汉', '南京', '西安', '重庆']

export function TopNavbar({
  avatarUrl,
  city = '杭州',
  onUpdateCity,
  onOpenSettings,
  onOpenProfile,
}: Props) {
  const [timeText, setTimeText] = useState('')
  const [showCityPicker, setShowCityPicker] = useState(false)
  const [customCityInput, setCustomCityInput] = useState('')
  const cityPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function updateTime() {
      const now = new Date()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const day = String(now.getDate()).padStart(2, '0')
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const weekDay = weekDays[now.getDay()]
      setTimeText(`${month} 月 ${day} 日 ${hours}:${minutes} ${weekDay}`)
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cityPickerRef.current && !cityPickerRef.current.contains(e.target as Node)) {
        setShowCityPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-11 w-full items-center justify-between border-b border-black/5 dark:border-white/10 bg-white/95 dark:bg-[#18181b]/90 px-4 text-[13px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur-md">
      {/* Left: Date | Weather | City (Always visible) */}
      <div className="flex items-center gap-2 sm:gap-3 text-xs text-neutral-600 dark:text-neutral-300">
        <div className="flex items-center gap-1.5 font-medium text-neutral-700 dark:text-neutral-200">
          <Calendar className="h-3.5 w-3.5 text-neutral-400" />
          <span>{timeText}</span>
        </div>

        <span className="text-neutral-300 dark:text-neutral-700">|</span>

        {/* City & Weather Switcher */}
        <div ref={cityPickerRef} className="relative">
          <button
            type="button"
            onClick={() => setShowCityPicker((prev) => !prev)}
            className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium"
            title="点击切换城市"
          >
            <MapPin className="h-3 w-3 text-orange-500" />
            <span>{city}</span>
            <Sun className="h-3.5 w-3.5 text-amber-500 ml-0.5" />
            <span className="text-neutral-600 dark:text-neutral-400 font-normal">晴 25°C</span>
            <ChevronDown className="h-3 w-3 text-neutral-400" />
          </button>

          {/* City Picker Dropdown */}
          {showCityPicker && (
            <div className="absolute left-0 top-7 z-50 w-64 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-[#18181b] p-3.5 text-xs shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800 font-medium text-neutral-800 dark:text-neutral-200">
                <span>切换城市天气</span>
                <button
                  type="button"
                  onClick={() => setShowCityPicker(false)}
                  className="text-neutral-400 hover:text-neutral-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-2.5">
                <span className="text-[11px] text-neutral-400 block mb-1.5">热门城市：</span>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_CITIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        onUpdateCity?.(c)
                        setShowCityPicker(false)
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs transition ${
                        city === c
                          ? 'bg-orange-500 text-white font-medium'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center gap-1.5">
                  <input
                    value={customCityInput}
                    onChange={(e) => setCustomCityInput(e.target.value)}
                    placeholder="输入其他城市..."
                    className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1 text-xs outline-none focus:border-orange-500 text-neutral-800 dark:text-neutral-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customCityInput.trim()) {
                        onUpdateCity?.(customCityInput.trim())
                        setCustomCityInput('')
                        setShowCityPicker(false)
                      }
                    }}
                    className="rounded-lg bg-orange-500 px-3 py-1 text-xs text-white"
                  >
                    确认
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right side: Settings button + profile avatar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center gap-1 rounded border border-neutral-200/90 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1 text-xs text-neutral-700 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-50 dark:hover:bg-neutral-700"
          title="全局界面与壁纸设置"
        >
          <Settings className="h-3 w-3" />
          <span>设置</span>
        </button>

        <div
          onClick={onOpenProfile}
          title="个人中心与数据管理"
          className="relative cursor-pointer transition hover:scale-105"
        >
          <img
            src={avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=star&backgroundColor=ffd5dc'}
            alt="Profile"
            className="h-7 w-7 rounded-full border-2 border-white object-cover shadow-sm"
          />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-amber-400 text-[8px] text-white">
            ★
          </span>
        </div>
      </div>
    </header>
  )
}

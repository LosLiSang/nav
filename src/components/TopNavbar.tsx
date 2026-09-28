import { useEffect, useRef, useState } from 'react'
import {
  Calendar,
  ChevronDown,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react'
import type { Settings as SettingsType } from '../types'
import { fetchWeather, type WeatherIconType, type WeatherInfo } from '../lib/weather'

type Props = {
  avatarUrl?: string
  city?: string
  settings?: SettingsType
  onUpdateCity?: (city: string) => void
  onOpenSettings: (tab?: 'appearance' | 'weather' | 'sync') => void
  onOpenProfile: () => void
}

const POPULAR_CITIES = ['杭州', '北京', '上海', '广州', '深圳', '成都', '武汉', '南京', '西安', '重庆']

export function TopNavbar({
  avatarUrl,
  city = '杭州',
  settings,
  onUpdateCity,
  onOpenSettings,
  onOpenProfile,
}: Props) {
  const [timeText, setTimeText] = useState('')
  const [showCityPicker, setShowCityPicker] = useState(false)
  const [customCityInput, setCustomCityInput] = useState('')
  const [weatherInfo, setWeatherInfo] = useState<WeatherInfo | null>(null)
  const [loadingWeather, setLoadingWeather] = useState(false)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const cityPickerRef = useRef<HTMLDivElement>(null)

  const loadWeather = async (force = false) => {
    setLoadingWeather(true)
    try {
      const info = await fetchWeather(city, settings || {}, { forceRefresh: force })
      setWeatherInfo(info)
      setWeatherError(null)
    } catch (err: any) {
      console.warn('天气获取失败:', err)
      setWeatherError(err.message || '获取失败')
    } finally {
      setLoadingWeather(false)
    }
  }

  useEffect(() => {
    void loadWeather(false)
  }, [city, settings?.weatherProvider, settings?.weatherApiKey, settings?.weatherCustomUrl, settings?.weatherAutoRefreshMinutes])

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

  const renderWeatherIcon = (icon?: WeatherIconType) => {
    switch (icon) {
      case 'cloud-sun':
        return <CloudSun className="h-3.5 w-3.5 text-amber-500 ml-0.5" />
      case 'cloud':
        return <Cloud className="h-3.5 w-3.5 text-sky-400 ml-0.5" />
      case 'rain':
        return <CloudRain className="h-3.5 w-3.5 text-blue-400 ml-0.5" />
      case 'lightning':
        return <CloudLightning className="h-3.5 w-3.5 text-amber-400 ml-0.5" />
      case 'snow':
        return <CloudSnow className="h-3.5 w-3.5 text-cyan-300 ml-0.5" />
      case 'fog':
        return <CloudFog className="h-3.5 w-3.5 text-neutral-400 ml-0.5" />
      case 'sun':
      default:
        return <Sun className="h-3.5 w-3.5 text-amber-500 ml-0.5" />
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-11 w-full items-center justify-between border-b border-black/5 dark:border-white/10 bg-white/95 dark:bg-[#18181b]/90 px-4 text-[13px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur-md">
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
            className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-medium cursor-pointer"
            title={`点击切换城市或刷新天气 (数据源: ${weatherInfo?.source || (loadingWeather ? '正在获取' : '未连接')})`}
          >
            <MapPin className="h-3 w-3 text-orange-500" />
            <span>{city}</span>
            {renderWeatherIcon(weatherInfo?.icon)}
            <span className="text-neutral-600 dark:text-neutral-400 font-normal">
              {weatherInfo ? (
                `${weatherInfo.weather} ${weatherInfo.temp}`
              ) : loadingWeather ? (
                <span className="text-neutral-400 animate-pulse">加载中...</span>
              ) : weatherError ? (
                <span className="text-neutral-400" title={weatherError}>待更新</span>
              ) : (
                '天气'
              )}
            </span>
            <ChevronDown className="h-3 w-3 text-neutral-400" />
          </button>

          {/* City Picker Dropdown */}
          {showCityPicker && (
            <div className="absolute left-0 top-7 z-50 w-64 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-[#18181b] p-3.5 text-xs shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800 font-medium text-neutral-800 dark:text-neutral-200">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-orange-500" />
                  <span>切换城市与天气</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="立即刷新天气"
                    disabled={loadingWeather}
                    onClick={() => void loadWeather(true)}
                    className="p-1 rounded text-neutral-400 dark:text-neutral-500 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingWeather ? 'animate-spin text-orange-500' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCityPicker(false)}
                    className="p-1 rounded text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Current weather summary banner */}
              {weatherInfo && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-orange-50/60 dark:bg-orange-950/20 px-2.5 py-1.5 border border-orange-100 dark:border-orange-900/30 text-[11px]">
                  <div className="flex items-center gap-1.5 font-medium text-neutral-800 dark:text-neutral-200">
                    {renderWeatherIcon(weatherInfo.icon)}
                    <span>{city}</span>
                    <span>{weatherInfo.weather}</span>
                    <span className="font-mono font-bold text-orange-600 dark:text-orange-400">{weatherInfo.temp}</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                    {weatherInfo.source}
                  </span>
                </div>
              )}

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

              <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setShowCityPicker(false)
                    onOpenSettings('weather')
                  }}
                  className="flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  <span>配置自定义天气 API</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right side: Settings button + profile avatar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenSettings()}
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

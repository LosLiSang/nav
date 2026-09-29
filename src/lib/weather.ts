import type { Settings, WeatherProvider } from '../types'

export type WeatherIconType = 'sun' | 'cloud-sun' | 'cloud' | 'rain' | 'lightning' | 'snow' | 'fog'

export type WeatherInfo = {
  city: string
  weather: string
  temp: string
  icon: WeatherIconType
  updatedAt: number
  source: string
}

const POPULAR_CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  '北京': { lat: 39.9042, lon: 116.4074 },
  '上海': { lat: 31.2304, lon: 121.4737 },
  '广州': { lat: 23.1291, lon: 113.2644 },
  '深圳': { lat: 22.5431, lon: 114.0579 },
  '杭州': { lat: 30.2741, lon: 120.1551 },
  '成都': { lat: 30.5728, lon: 104.0668 },
  '武汉': { lat: 30.5928, lon: 114.3055 },
  '南京': { lat: 32.0603, lon: 118.7969 },
  '西安': { lat: 34.3416, lon: 108.9398 },
  '重庆': { lat: 29.5630, lon: 106.5516 },
  '天津': { lat: 39.0842, lon: 117.2009 },
  '苏州': { lat: 31.2990, lon: 120.5853 },
  '长沙': { lat: 28.2282, lon: 112.9388 },
  '郑州': { lat: 34.7466, lon: 113.6253 },
  '东莞': { lat: 23.0207, lon: 113.7518 },
  '青岛': { lat: 36.0671, lon: 120.3826 },
  '昆明': { lat: 25.0406, lon: 102.7123 },
  '宁波': { lat: 29.8683, lon: 121.5440 },
  '合肥': { lat: 31.8206, lon: 117.2272 },
  '佛山': { lat: 23.0215, lon: 113.1214 },
  '福州': { lat: 26.0745, lon: 119.2965 },
  '厦门': { lat: 24.4798, lon: 118.0894 },
  '无锡': { lat: 31.4912, lon: 120.3119 },
  '大连': { lat: 38.9140, lon: 121.6147 },
  '沈阳': { lat: 41.8057, lon: 123.4315 },
  '济南': { lat: 36.6512, lon: 117.1201 },
  '哈尔滨': { lat: 45.8038, lon: 126.5350 },
  '长春': { lat: 43.8171, lon: 125.3235 },
  '南宁': { lat: 22.8170, lon: 108.3665 },
  '南昌': { lat: 28.6820, lon: 115.8579 },
  '贵阳': { lat: 26.6477, lon: 106.6302 },
  '太原': { lat: 37.8706, lon: 112.5489 },
  '海口': { lat: 20.0440, lon: 110.1999 },
  '三亚': { lat: 18.2528, lon: 109.5119 },
  '香港': { lat: 22.3193, lon: 114.1694 },
  '澳门': { lat: 22.1987, lon: 113.5439 },
  '台北': { lat: 25.0330, lon: 121.5654 },
}

export function matchWeatherIcon(text: string): WeatherIconType {
  const t = text.toLowerCase()
  if (t.includes('雷') || t.includes('thunder') || t.includes('storm')) return 'lightning'
  if (t.includes('雪') || t.includes('冰雹') || t.includes('snow') || t.includes('sleet') || t.includes('ice')) return 'snow'
  if (t.includes('雨') || t.includes('rain') || t.includes('drizzle') || t.includes('shower')) return 'rain'
  if (t.includes('雾') || t.includes('霾') || t.includes('沙') || t.includes('尘') || t.includes('fog') || t.includes('mist') || t.includes('haze')) return 'fog'
  if (t.includes('多云') || t.includes('少云') || t.includes('partly') || t.includes('cloudy')) return 'cloud-sun'
  if (t.includes('阴') || t.includes('overcast') || t.includes('cloud')) return 'cloud'
  if (t.includes('晴') || t.includes('sun') || t.includes('clear')) return 'sun'
  return 'cloud-sun'
}

function wmoCodeToWeather(code: number): { text: string; icon: WeatherIconType } {
  switch (code) {
    case 0:
      return { text: '晴', icon: 'sun' }
    case 1:
      return { text: '大部晴朗', icon: 'cloud-sun' }
    case 2:
      return { text: '多云', icon: 'cloud-sun' }
    case 3:
      return { text: '阴', icon: 'cloud' }
    case 45:
    case 48:
      return { text: '雾', icon: 'fog' }
    case 51:
    case 53:
    case 55:
      return { text: '小雨', icon: 'rain' }
    case 56:
    case 57:
      return { text: '冻雨', icon: 'rain' }
    case 61:
      return { text: '小雨', icon: 'rain' }
    case 63:
      return { text: '中雨', icon: 'rain' }
    case 65:
      return { text: '大雨', icon: 'rain' }
    case 66:
    case 67:
      return { text: '冻雨', icon: 'rain' }
    case 71:
      return { text: '小雪', icon: 'snow' }
    case 73:
      return { text: '中雪', icon: 'snow' }
    case 75:
      return { text: '大雪', icon: 'snow' }
    case 77:
      return { text: '雪粒', icon: 'snow' }
    case 80:
      return { text: '阵雨', icon: 'rain' }
    case 81:
      return { text: '强阵雨', icon: 'rain' }
    case 82:
      return { text: '暴雨', icon: 'rain' }
    case 85:
    case 86:
      return { text: '阵雪', icon: 'snow' }
    case 95:
      return { text: '雷阵雨', icon: 'lightning' }
    case 96:
    case 99:
      return { text: '雷暴伴冰雹', icon: 'lightning' }
    default:
      return { text: '多云', icon: 'cloud-sun' }
  }
}

export function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let cur = obj
  for (const part of parts) {
    if (cur == null) return undefined
    cur = cur[part]
  }
  return cur
}

export function autoDetectWeatherAndTemp(data: any): { weather: string; temp: string } | null {
  if (!data || typeof data !== 'object') return null

  const candidates: any[] = [
    data,
    data.data,
    data.result,
    data.now,
    data.current,
    data.current_weather,
    data.lives?.[0],
    data.current_condition?.[0],
  ].filter(Boolean)

  let foundWeather: string | undefined
  let foundTemp: string | undefined

  const weatherKeys = ['weather', 'condition', 'text', 'desc', 'description', 'info', 'weather_desc', 'weatherDesc']
  const tempKeys = ['temp', 'temperature', 'temperature_2m', 'temp_c', 'temp_C', 'current_temp', 'cur_temp', 'now_temp']

  for (const candidate of candidates) {
    if (typeof candidate !== 'object') continue
    for (const key of Object.keys(candidate)) {
      const lower = key.toLowerCase()
      if (!foundWeather && weatherKeys.some((k) => lower === k.toLowerCase())) {
        const val = candidate[key]
        if (typeof val === 'string') foundWeather = val
        else if (Array.isArray(val) && val[0]?.value) foundWeather = val[0].value
      }
      if (!foundTemp && tempKeys.some((k) => lower === k.toLowerCase())) {
        const val = candidate[key]
        if (typeof val === 'number' || typeof val === 'string') {
          foundTemp = String(val)
        }
      }
    }
    if (foundWeather && foundTemp) break
  }

  if (foundWeather || foundTemp) {
    let cleanTemp = foundTemp || '--'
    if (cleanTemp !== '--' && !cleanTemp.endsWith('°C') && !cleanTemp.endsWith('℃') && !cleanTemp.endsWith('°')) {
      const num = parseFloat(cleanTemp)
      cleanTemp = !isNaN(num) ? `${Math.round(num)}°C` : `${cleanTemp}°C`
    }
    return {
      weather: foundWeather || '晴',
      temp: cleanTemp,
    }
  }

  return null
}

const CACHE_PREFIX = 'nav_weather_cache_v1_'

export function getCachedWeather(city: string, provider: WeatherProvider): WeatherInfo | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${city}_${provider}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WeatherInfo
    return parsed
  } catch {
    return null
  }
}

export function setCachedWeather(info: WeatherInfo, provider: WeatherProvider): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${info.city}_${provider}`, JSON.stringify(info))
  } catch {}
}

export async function fetchWeather(
  city: string,
  settings: Partial<Settings>,
  options?: { forceRefresh?: boolean },
): Promise<WeatherInfo> {
  const cleanCity = city.trim() || '广州'
  const provider: WeatherProvider = settings.weatherProvider || 'open-meteo'
  const refreshMinutes = settings.weatherAutoRefreshMinutes ?? 30

  // 检查本地缓存
  if (!options?.forceRefresh) {
    const cached = getCachedWeather(cleanCity, provider)
    if (cached && Date.now() - cached.updatedAt < refreshMinutes * 60 * 1000) {
      return cached
    }
  }

  let result: WeatherInfo

  switch (provider) {
    case 'open-meteo': {
      result = await fetchOpenMeteo(cleanCity)
      break
    }
    case 'amap': {
      result = await fetchAmap(cleanCity, settings.weatherApiKey || '')
      break
    }
    case 'qweather': {
      result = await fetchQWeather(cleanCity, settings.weatherApiKey || '')
      break
    }
    case 'wttr': {
      result = await fetchWttr(cleanCity)
      break
    }
    case 'custom': {
      result = await fetchCustomWeather(
        cleanCity,
        settings.weatherCustomUrl || '',
        settings.weatherApiKey || '',
        settings.weatherCustomFieldPath || '',
        settings.weatherCustomTempPath || '',
      )
      break
    }
    default: {
      result = await fetchOpenMeteo(cleanCity)
    }
  }

  setCachedWeather(result, provider)
  return result
}

async function fetchOpenMeteo(city: string): Promise<WeatherInfo> {
  const simpleName = city.replace(/市$|区$|县$/g, '')
  let coords = POPULAR_CITY_COORDS[city] || POPULAR_CITY_COORDS[simpleName]

  if (!coords) {
    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(simpleName)}&count=1&language=zh&format=json`
      const geoRes = await fetch(geoUrl)
      if (geoRes.ok) {
        const geoData = await geoRes.json()
        if (geoData.results && geoData.results.length > 0) {
          coords = {
            lat: geoData.results[0].latitude,
            lon: geoData.results[0].longitude,
          }
        }
      }
    } catch (e) {
      console.warn('Open-Meteo 地理编码查询失败:', e)
    }
  }

  if (!coords) {
    coords = { lat: 23.1291, lon: 113.2644 } // 默认降级广州
  }

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code`
  const res = await fetch(weatherUrl)
  if (!res.ok) {
    throw new Error(`Open-Meteo 请求失败 (${res.status})`)
  }
  const data = await res.json()
  const cur = data.current
  if (!cur) {
    throw new Error('Open-Meteo 返回数据为空')
  }

  const parsed = wmoCodeToWeather(cur.weather_code ?? 0)
  const temp = `${Math.round(cur.temperature_2m)}°C`

  return {
    city,
    weather: parsed.text,
    temp,
    icon: parsed.icon,
    updatedAt: Date.now(),
    source: 'Open-Meteo (免Key)',
  }
}

async function fetchAmap(city: string, apiKey: string): Promise<WeatherInfo> {
  if (!apiKey.trim()) {
    throw new Error('未配置高德 API Key，请在设置中填入 Web 服务 Key')
  }
  const url = `https://restapi.amap.com/v3/weather/weatherInfo?city=${encodeURIComponent(city)}&key=${encodeURIComponent(apiKey.trim())}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`高德天气网络请求异常 (${res.status})`)
  }
  const data = await res.json()
  if (data.status !== '1') {
    throw new Error(data.info || '高德天气接口查询失败')
  }
  const live = data.lives?.[0]
  if (!live) {
    throw new Error(`未查询到城市「${city}」的天气信息`)
  }

  const weather = live.weather || '晴'
  const temp = `${live.temperature}°C`
  return {
    city,
    weather,
    temp,
    icon: matchWeatherIcon(weather),
    updatedAt: Date.now(),
    source: '高德开放平台',
  }
}

async function fetchQWeather(city: string, apiKey: string): Promise<WeatherInfo> {
  if (!apiKey.trim()) {
    throw new Error('未配置和风天气 API Key，请在设置中填入')
  }
  const key = apiKey.trim()
  let locationId = city
  try {
    const geoUrl = `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(city)}&key=${encodeURIComponent(key)}`
    const geoRes = await fetch(geoUrl)
    if (geoRes.ok) {
      const geoData = await geoRes.json()
      if (geoData.code === '200' && geoData.location?.[0]?.id) {
        locationId = geoData.location[0].id
      }
    }
  } catch (e) {
    console.warn('和风城市查询异常:', e)
  }

  const weatherUrl = `https://devapi.qweather.com/v7/weather/now?location=${encodeURIComponent(locationId)}&key=${encodeURIComponent(key)}`
  const res = await fetch(weatherUrl)
  if (!res.ok) {
    throw new Error(`和风天气网络请求异常 (${res.status})`)
  }
  const data = await res.json()
  if (data.code !== '200') {
    throw new Error(`和风接口返回错误码: ${data.code}`)
  }
  const now = data.now
  if (!now) {
    throw new Error('和风天气返回数据为空')
  }

  const weather = now.text || '晴'
  const temp = `${now.temp}°C`
  return {
    city,
    weather,
    temp,
    icon: matchWeatherIcon(weather),
    updatedAt: Date.now(),
    source: '和风天气',
  }
}

async function fetchWttr(city: string): Promise<WeatherInfo> {
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`wttr.in 接口响应失败 (${res.status})`)
  }
  const data = await res.json()
  const cond = data.current_condition?.[0]
  if (!cond) {
    throw new Error('wttr.in 返回数据结构异常')
  }

  let weather = cond.weatherDesc?.[0]?.value?.trim() || '晴'
  // 常见英文天气翻译
  const lower = weather.toLowerCase()
  if (lower.includes('clear') || lower.includes('sunny')) weather = '晴'
  else if (lower.includes('partly cloudy')) weather = '多云'
  else if (lower.includes('cloudy') || lower.includes('overcast')) weather = '阴'
  else if (lower.includes('rain') || lower.includes('drizzle') || lower.includes('shower')) weather = '小雨'
  else if (lower.includes('thunder') || lower.includes('storm')) weather = '雷阵雨'
  else if (lower.includes('snow') || lower.includes('sleet')) weather = '雪'
  else if (lower.includes('fog') || lower.includes('mist')) weather = '雾'

  const temp = `${cond.temp_C}°C`
  return {
    city,
    weather,
    temp,
    icon: matchWeatherIcon(weather),
    updatedAt: Date.now(),
    source: 'wttr.in (免Key)',
  }
}

async function fetchCustomWeather(
  city: string,
  customUrl: string,
  apiKey: string,
  fieldPath: string,
  tempPath: string,
): Promise<WeatherInfo> {
  if (!customUrl.trim()) {
    throw new Error('未填写自定义 API 请求地址')
  }

  let targetUrl = customUrl.trim()
  targetUrl = targetUrl.replace(/\{city\}/g, encodeURIComponent(city))
  targetUrl = targetUrl.replace(/\{key\}/g, encodeURIComponent(apiKey.trim()))

  const res = await fetch(targetUrl)
  if (!res.ok) {
    throw new Error(`自定义接口 HTTP 状态异常 (${res.status})`)
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const json = await res.json()
    let weather = fieldPath ? String(getByPath(json, fieldPath) ?? '') : ''
    let temp = tempPath ? String(getByPath(json, tempPath) ?? '') : ''

    if (!weather || !temp) {
      const detected = autoDetectWeatherAndTemp(json)
      if (detected) {
        weather = weather || detected.weather
        temp = temp || detected.temp
      }
    }

    if (!weather && !temp) {
      throw new Error('未能从接口返回的 JSON 中提取到天气与温度字段，请指定字段路径')
    }

    if (temp && !temp.endsWith('°C') && !temp.endsWith('℃') && !temp.endsWith('°')) {
      const num = parseFloat(temp)
      temp = !isNaN(num) ? `${Math.round(num)}°C` : `${temp}°C`
    }

    return {
      city,
      weather: weather || '晴',
      temp: temp || '--°C',
      icon: matchWeatherIcon(weather || '晴'),
      updatedAt: Date.now(),
      source: '自定义接口',
    }
  } else {
    // 纯文本接口，如 "晴 25°C"
    const text = (await res.text()).trim()
    const match = text.match(/(晴|多云|阴|雨|雪|雷|雾|Sunny|Clear|Cloudy|Rain)[\s,]+([+-]?\d+[\.\d]*\s*°?[C|℃]?)/i)
    if (match) {
      let t = match[2].trim()
      if (!t.includes('°')) t = `${t}°C`
      return {
        city,
        weather: match[1],
        temp: t,
        icon: matchWeatherIcon(match[1]),
        updatedAt: Date.now(),
        source: '自定义接口 (文本)',
      }
    }
    return {
      city,
      weather: text.slice(0, 10),
      temp: '--',
      icon: 'cloud-sun',
      updatedAt: Date.now(),
      source: '自定义接口 (纯文本)',
    }
  }
}

export async function testWeatherConfig(
  testSettings: Partial<Settings>,
  city: string,
): Promise<{ success: boolean; data?: WeatherInfo; error?: string }> {
  try {
    const data = await fetchWeather(city, testSettings, { forceRefresh: true })
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || '未知错误' }
  }
}

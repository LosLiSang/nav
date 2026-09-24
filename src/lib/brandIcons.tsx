import React from 'react'
import { Bookmark, Globe } from 'lucide-react'
import type { Settings } from '../types'

export function getBrandIcon(
  title: string,
  url: string,
  shape: 'square' | 'rounded' | 'circle' = 'rounded',
  settings?: Settings,
): React.ReactNode | null {
  const shapeClass =
    shape === 'square'
      ? 'rounded-none'
      : shape === 'circle'
        ? 'rounded-full'
        : 'rounded-lg'

  // 1. Custom placeholder icon if specified
  if (
    (settings?.fallbackIconMode === 'custom' || (!settings?.fallbackIconMode && settings?.defaultPlaceholderIconUrl)) &&
    settings?.defaultPlaceholderIconUrl
  ) {
    return (
      <img
        src={settings.defaultPlaceholderIconUrl}
        alt=""
        className={`h-4.5 w-4.5 flex-shrink-0 object-contain ${shapeClass}`}
      />
    )
  }

  // 2. Universal globe icon
  if (settings?.fallbackIconMode === 'globe') {
    return (
      <div
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center ${shapeClass} bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300`}
      >
        <Globe className="h-3.5 w-3.5" />
      </div>
    )
  }

  // 3. Universal bookmark icon
  if (settings?.fallbackIconMode === 'bookmark') {
    return (
      <div
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center ${shapeClass} bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400`}
      >
        <Bookmark className="h-3.5 w-3.5" />
      </div>
    )
  }

  // 4. Smart brand & letter badge (default)
  const lowerTitle = title.toLowerCase()
  const lowerUrl = url.toLowerCase()

  // Github
  if (lowerTitle.includes('github') || lowerUrl.includes('github.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-black text-white`}>
        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
      </div>
    )
  }

  // Bilibili 哔哩哔哩
  if (lowerTitle.includes('哔哩哔哩') || lowerTitle.includes('bilibili') || lowerUrl.includes('bilibili.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#fb7299] text-white`}>
        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
          <path d="M17.813 4.653h.854c1.51 0 2.733 1.224 2.733 2.734v9.98c0 1.51-1.223 2.734-2.733 2.734H5.333C3.823 20.1 2.6 18.877 2.6 17.367V7.387c0-1.51 1.223-2.734 2.733-2.734h.854L4.85 3.316a.75.75 0 111.06-1.061l2.47 2.47h7.24l2.47-2.47a.75.75 0 111.06 1.06l-1.337 1.338zM8.5 11a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm7 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
        </svg>
      </div>
    )
  }

  // LeetCode
  if (lowerTitle.includes('leetcode') || lowerUrl.includes('leetcode')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#ffa116] text-white font-black text-[11px]`}>
        LC
      </div>
    )
  }

  // LINUX DO
  if (lowerTitle.includes('linux do') || lowerUrl.includes('linux.do')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-neutral-900 text-[#f59e0b] font-black text-[10px]`}>
        🐧
      </div>
    )
  }

  // 知乎
  if (lowerTitle.includes('知乎') || lowerUrl.includes('zhihu.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#0066ff] text-white font-bold text-[10px]`}>
        知
      </div>
    )
  }

  // 百度 / 百度网盘
  if (lowerTitle.includes('百度') || lowerUrl.includes('baidu.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#2932e1] text-white font-bold text-[10px]`}>
        度
      </div>
    )
  }

  // 163 邮箱 / 网易云音乐
  if (lowerTitle.includes('163') || lowerTitle.includes('网易') || lowerUrl.includes('163.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#c20c0c] text-white font-bold text-[9px]`}>
        163
      </div>
    )
  }

  // QQ 邮箱 / 腾讯
  if (
    lowerTitle.includes('qq') ||
    lowerTitle.includes('腾讯') ||
    lowerTitle.includes('服务器') ||
    lowerTitle.includes('server') ||
    lowerUrl.includes('qq.com') ||
    lowerUrl.includes('tencent.com')
  ) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#0052d9] text-white font-bold text-[10px]`}>
        腾
      </div>
    )
  }

  // Gmail / 谷歌 / Google
  if (lowerTitle.includes('gmail') || lowerTitle.includes('谷歌') || lowerUrl.includes('google')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#ea4335] text-white font-bold text-[10px]`}>
        G
      </div>
    )
  }

  // Discord
  if (lowerTitle.includes('discord') || lowerUrl.includes('discord')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#5865f2] text-white font-bold text-[10px]`}>
        DC
      </div>
    )
  }

  // 小红书
  if (lowerTitle.includes('小红书') || lowerUrl.includes('xiaohongshu')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#ff2442] text-white font-bold text-[9px]`}>
        RED
      </div>
    )
  }

  // Telegram / tg
  if (lowerTitle === 'tg' || lowerTitle.includes('telegram') || lowerUrl.includes('telegram.org')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#229ed9] text-white font-bold text-[10px]`}>
        TG
      </div>
    )
  }

  // YouTube
  if (lowerTitle.includes('youtube') || lowerUrl.includes('youtube.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#ff0000] text-white`}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      </div>
    )
  }

  // 微博
  if (lowerTitle.includes('微博') || lowerUrl.includes('weibo.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#e6162d] text-white font-bold text-[10px]`}>
        微
      </div>
    )
  }

  // 掘金
  if (lowerTitle.includes('掘金') || lowerUrl.includes('juejin.cn')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#1e80ff] text-white font-bold text-[10px]`}>
        掘
      </div>
    )
  }

  // 飞书
  if (lowerTitle.includes('飞书') || lowerUrl.includes('feishu.cn')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#00d6b9] text-white font-bold text-[10px]`}>
        飞
      </div>
    )
  }

  // 语雀
  if (lowerTitle.includes('语雀') || lowerUrl.includes('yuque.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#00b96b] text-white font-bold text-[10px]`}>
        语
      </div>
    )
  }

  // 阿里云 / 阿里邮箱
  if (lowerTitle.includes('阿里') || lowerUrl.includes('aliyun.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#ff6a00] text-white font-bold text-[10px]`}>
        阿
      </div>
    )
  }

  // CloseAI / ChatGPT / OpenAI
  if (lowerTitle.includes('openai') || lowerTitle.includes('closeai') || lowerTitle.includes('gpt')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#10a37f] text-white font-bold text-[10px]`}>
        AI
      </div>
    )
  }

  // V2EX
  if (lowerTitle.includes('v2ex') || lowerUrl.includes('v2ex.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#333333] text-white font-bold text-[9px]`}>
        V2
      </div>
    )
  }

  // 牛客网
  if (lowerTitle.includes('牛客') || lowerUrl.includes('nowcoder.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#25bb9b] text-white font-bold text-[10px]`}>
        牛
      </div>
    )
  }

  // Boss直聘
  if (lowerTitle.includes('boss') || lowerUrl.includes('zhipin.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#00bebd] text-white font-bold text-[10px]`}>
        B
      </div>
    )
  }

  // 虎牙
  if (lowerTitle.includes('虎牙') || lowerUrl.includes('huya.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#ff7e00] text-white font-bold text-[10px]`}>
        虎
      </div>
    )
  }

  // 斗鱼
  if (lowerTitle.includes('斗鱼') || lowerUrl.includes('douyu.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#ff5d23] text-white font-bold text-[10px]`}>
        斗
      </div>
    )
  }

  // 高德地图
  if (lowerTitle.includes('高德') || lowerUrl.includes('amap.com')) {
    return (
      <div className={`flex h-5 w-5 items-center justify-center ${shapeClass} bg-[#0091ff] text-white font-bold text-[10px]`}>
        德
      </div>
    )
  }

  // 备用颜色池 (按照标题哈希分配专属靓丽品牌色)
  const colors = [
    '#3b82f6',
    '#10b981',
    '#8b5cf6',
    '#ec4899',
    '#f59e0b',
    '#06b6d4',
    '#f43f5e',
    '#6366f1',
  ]
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i)
  }
  const color = colors[Math.abs(hash) % colors.length]
  const char = title.trim().slice(0, 1).toUpperCase() || '★'

  return (
    <div
      style={{ backgroundColor: color }}
      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center ${shapeClass} font-bold text-[10px] text-white shadow-sm`}
    >
      {char}
    </div>
  )
}

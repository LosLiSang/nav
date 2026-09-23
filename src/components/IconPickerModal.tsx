import { useMemo, useState } from 'react'
import {
  Bell,
  Bookmark,
  BookOpen,
  Box,
  Briefcase,
  Bug,
  Calendar,
  Camera,
  Check,
  CheckSquare,
  Clock,
  Cloud,
  Code,
  Coffee,
  Compass,
  Cpu,
  CreditCard,
  Database,
  FileText,
  Film,
  Folder,
  Gamepad2,
  GitBranch,
  Globe,
  HardDrive,
  Headphones,
  Heart,
  Image,
  Key,
  Layers,
  Link,
  Mail,
  MapPin,
  Mic,
  Moon,
  Music,
  PenTool,
  Plane,
  PlayCircle,
  QrCode,
  Radio,
  RotateCcw,
  Search,
  Server,
  Settings,
  Share2,
  Shield,
  ShoppingCart,
  Smile,
  Sparkles,
  Sun,
  Terminal,
  Tv,
  Utensils,
  Video,
  Wrench,
  X,
  Zap,
} from 'lucide-react'

type Props = {
  currentIconUrl?: string
  onSelectIcon: (iconUrl: string) => void
  onClose: () => void
}

const LUCIDE_COLOR = '#ea580c'

/**
 * 把点选时已经渲染在页面上的 lucide 图标固化成独立 SVG 数据图标。
 *
 * 必须落成具体颜色：SVG 以 <img> 方式渲染时脱离了页面样式，currentColor
 * 会解析成黑色。顺手记一个 data-icon 标记，选中态靠它做字符串比对。
 */
function svgToIconUri(svg: SVGSVGElement | null, name: string): string | null {
  if (!svg) return null
  const raw = svg.outerHTML
    .replace(/\s?class="[^"]*"/g, '')
    .replace(/currentColor/g, LUCIDE_COLOR)
    .replace('<svg ', `<svg data-icon="${name}" `)
  return `data:image/svg+xml;utf8,${encodeURIComponent(raw)}`
}

const LUCIDE_ICONS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  Code: { label: '代码', icon: Code },
  Terminal: { label: '终端', icon: Terminal },
  Globe: { label: '全球/网络', icon: Globe },
  Database: { label: '数据库', icon: Database },
  Server: { label: '服务器', icon: Server },
  Cpu: { label: '芯片算力', icon: Cpu },
  GitBranch: { label: '代码分支', icon: GitBranch },
  Layers: { label: '系统架构', icon: Layers },
  Box: { label: '容器组件', icon: Box },
  Bug: { label: '调试/Bug', icon: Bug },
  Cloud: { label: '云计算', icon: Cloud },
  HardDrive: { label: '存储硬盘', icon: HardDrive },
  FileText: { label: '文档笔记', icon: FileText },
  Folder: { label: '文件夹', icon: Folder },
  Mail: { label: '电子邮件', icon: Mail },
  Calendar: { label: '日程日历', icon: Calendar },
  CheckSquare: { label: '待办任务', icon: CheckSquare },
  Bookmark: { label: '书签收藏', icon: Bookmark },
  Briefcase: { label: '工作商务', icon: Briefcase },
  PenTool: { label: '设计绘图', icon: PenTool },
  BookOpen: { label: '阅读学习', icon: BookOpen },
  Clock: { label: '时间时钟', icon: Clock },
  Video: { label: '视频影像', icon: Video },
  Music: { label: '音乐旋律', icon: Music },
  Film: { label: '影视媒体', icon: Film },
  Tv: { label: '直播电视', icon: Tv },
  Camera: { label: '摄影相册', icon: Camera },
  Headphones: { label: '播客听歌', icon: Headphones },
  Gamepad2: { label: '游戏电竞', icon: Gamepad2 },
  Radio: { label: '广播电台', icon: Radio },
  PlayCircle: { label: '媒体播放', icon: PlayCircle },
  Image: { label: '图片画廊', icon: Image },
  Mic: { label: '语音通话', icon: Mic },
  Coffee: { label: '咖啡休闲', icon: Coffee },
  ShoppingCart: { label: '电商购物', icon: ShoppingCart },
  Compass: { label: '出行指南', icon: Compass },
  Plane: { label: '航班旅游', icon: Plane },
  Heart: { label: '喜欢关注', icon: Heart },
  Smile: { label: '社交社区', icon: Smile },
  MapPin: { label: '地图定位', icon: MapPin },
  CreditCard: { label: '消费支付', icon: CreditCard },
  Utensils: { label: '美食餐饮', icon: Utensils },
  Sun: { label: '天气白昼', icon: Sun },
  Moon: { label: '暗色夜间', icon: Moon },
  Wrench: { label: '日常工具', icon: Wrench },
  Settings: { label: '系统设置', icon: Settings },
  Key: { label: '安全密钥', icon: Key },
  Shield: { label: '隐私防护', icon: Shield },
  QrCode: { label: '二维码', icon: QrCode },
  Search: { label: '搜索发现', icon: Search },
  Zap: { label: '效率快捷', icon: Zap },
  Link: { label: '外部链接', icon: Link },
  Share2: { label: '分享传输', icon: Share2 },
  Bell: { label: '消息通知', icon: Bell },
  Sparkles: { label: 'AI智能', icon: Sparkles },
}

const BRAND_PRESETS = [
  { name: 'GitHub', bg: '#24292e', color: '#fff', char: 'GH' },
  { name: 'Google', bg: '#4285f4', color: '#fff', char: 'G' },
  { name: 'Bilibili', bg: '#fb7299', color: '#fff', char: 'B' },
  { name: '知乎', bg: '#0066ff', color: '#fff', char: '知' },
  { name: '百度', bg: '#2932e1', color: '#fff', char: '度' },
  { name: 'LeetCode', bg: '#ffa116', color: '#fff', char: 'LC' },
  { name: 'LINUX DO', bg: '#171717', color: '#f59e0b', char: '🐧' },
  { name: '掘金', bg: '#1e80ff', color: '#fff', char: '掘' },
  { name: 'V2EX', bg: '#333333', color: '#fff', char: 'V2' },
  { name: 'Discord', bg: '#5865f2', color: '#fff', char: 'DC' },
  { name: 'Telegram', bg: '#229ed9', color: '#fff', char: 'TG' },
  { name: 'YouTube', bg: '#ff0000', color: '#fff', char: 'YT' },
  { name: 'Twitter/X', bg: '#000000', color: '#fff', char: '𝕏' },
  { name: 'Notion', bg: '#000000', color: '#fff', char: 'N' },
  { name: 'ChatGPT', bg: '#10a37f', color: '#fff', char: 'AI' },
  { name: '网易云音乐', bg: '#e60026', color: '#fff', char: '音' },
  { name: '高德地图', bg: '#0091ff', color: '#fff', char: '德' },
  { name: '小红书', bg: '#fe2442', color: '#fff', char: '薯' },
  { name: '新浪微博', bg: '#e6162d', color: '#fff', char: '微' },
  { name: '语雀', bg: '#00b96b', color: '#fff', char: '雀' },
  { name: '飞书', bg: '#00d6b9', color: '#fff', char: '飞' },
  { name: '阿里云', bg: '#ff6a00', color: '#fff', char: '云' },
  { name: '腾讯云', bg: '#0052d9', color: '#fff', char: '腾' },
  { name: 'Docker', bg: '#0db7ed', color: '#fff', char: '🐳' },
  { name: 'React', bg: '#23272f', color: '#149eca', char: '⚛' },
  { name: 'Vue', bg: '#42b883', color: '#fff', char: 'V' },
  { name: 'Python', bg: '#3776ab', color: '#ffd43b', char: 'Py' },
  { name: 'Boss直聘', bg: '#00bebd', color: '#fff', char: '直' },
  { name: '牛客网', bg: '#25bb9b', color: '#fff', char: '牛' },
  { name: 'Kaggle', bg: '#20beff', color: '#fff', char: 'K' },
  { name: 'RunPod', bg: '#673ab7', color: '#fff', char: 'GPU' },
  { name: '豆瓣', bg: '#007722', color: '#fff', char: '豆' },
]

export function IconPickerModal({ currentIconUrl, onSelectIcon, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'brands' | 'lucide'>('brands')
  const [customInput, setCustomInput] = useState(currentIconUrl || '')

  const filteredBrands = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return BRAND_PRESETS
    return BRAND_PRESETS.filter((b) => b.name.toLowerCase().includes(q))
  }, [search])

  const filteredLucide = useMemo(() => {
    const q = search.trim().toLowerCase()
    const entries = Object.entries(LUCIDE_ICONS)
    if (!q) return entries
    return entries.filter(
      ([name, def]) => name.toLowerCase().includes(q) || def.label.toLowerCase().includes(q),
    )
  }, [search])

  function makeSvgDataUri(bg: string, color: string, text: string) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48"><rect width="48" height="48" rx="12" fill="${bg}"/><text x="50%" y="54%" font-family="system-ui,-apple-system,sans-serif" font-size="20" font-weight="bold" fill="${color}" dominant-baseline="middle" text-anchor="middle">${text}</text></svg>`
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 p-5 text-neutral-800 dark:text-neutral-200 shadow-2xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-orange-500" />
            <h3 className="font-semibold text-neutral-800 dark:text-neutral-200 text-sm">选择书签图标</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3.5 space-y-2.5 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索图标或品牌..."
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-orange-500 focus:bg-white"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('brands')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeTab === 'brands'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                常用品牌 ({filteredBrands.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('lucide')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeTab === 'lucide'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                分类图标 ({filteredLucide.length})
              </button>
            </div>

            {currentIconUrl && (
              <button
                type="button"
                onClick={() => {
                  onSelectIcon('')
                  onClose()
                }}
                className="flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                <span>恢复自动拉取</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto min-h-[200px] max-h-[300px] pr-1">
          {activeTab === 'brands' && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {filteredBrands.map((brand) => {
                const uri = makeSvgDataUri(brand.bg, brand.color, brand.char)
                const isSelected = currentIconUrl === uri
                return (
                  <button
                    key={brand.name}
                    type="button"
                    onClick={() => {
                      onSelectIcon(uri)
                      onClose()
                    }}
                    className={`group relative flex flex-col items-center justify-center rounded-xl border p-2 text-center transition hover:scale-105 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 ring-1 ring-orange-500/20'
                        : 'border-neutral-200/80 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/40 hover:bg-white dark:hover:bg-neutral-800 hover:shadow-sm'
                    }`}
                  >
                    <div
                      style={{ backgroundColor: brand.bg, color: brand.color }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg font-bold text-xs shadow-sm"
                    >
                      {brand.char}
                    </div>
                    <span className="mt-1 truncate text-[10px] text-neutral-700 dark:text-neutral-200 w-full">
                      {brand.name}
                    </span>
                    {isSelected && (
                      <div className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-white">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {activeTab === 'lucide' && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {filteredLucide.map(([name, def]) => {
                const IconComponent = def.icon
                // 选中态靠写入 SVG 的 data-icon 标记做字符串比对，
                // 不需要为比对而预先构建 55 个数据图标
                const isSelected = Boolean(
                  currentIconUrl && currentIconUrl.includes(`data-icon="${name}"`),
                )
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={(e) => {
                      // 点选时把已经渲染在页面上的图标固化成独立 SVG 数据图标
                      const uri = svgToIconUri(e.currentTarget.querySelector('svg'), name)
                      if (!uri) return
                      onSelectIcon(uri)
                      onClose()
                    }}
                    className={`group flex flex-col items-center justify-center rounded-xl border p-2 text-center transition hover:scale-105 ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 ring-1 ring-orange-500/20'
                        : 'border-neutral-200/80 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/40 hover:bg-white dark:hover:bg-neutral-800 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                      <IconComponent className="h-4 w-4" data-lucide-name={name} />
                    </div>
                    <span className="mt-1 truncate text-[10px] text-neutral-700 dark:text-neutral-200 w-full">
                      {def.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-3.5 border-t border-neutral-100 dark:border-neutral-800 pt-3 flex-shrink-0">
          <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300 block mb-1">
            或输入自定义图片 URL：
          </span>
          <div className="flex items-center gap-2">
            <input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="https://... 或 data:image/..."
              className="flex-1 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 text-xs outline-none focus:border-orange-500 focus:bg-white"
            />
            <button
              type="button"
              onClick={() => {
                if (customInput.trim()) {
                  onSelectIcon(customInput.trim())
                  onClose()
                }
              }}
              disabled={!customInput.trim()}
              className="rounded-xl bg-orange-500 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-50"
            >
              应用
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

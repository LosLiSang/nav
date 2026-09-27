import { useEffect, useRef, useState } from 'react'
 import {
   Check,
   Clock,
   Copy,
   ExternalLink,
   FileEdit,
   Flame,
   PanelRightClose,
   PanelRightOpen,
   Pause,
   Play,
   Plus,
   RotateCcw,
   Trash2,
 } from 'lucide-react'
 import type { CountdownTarget, Settings } from '../types'
 
 type Props = {
   scratchpadContent: string
   cardOpacity: number
   settings: Settings
   collapsed?: boolean
   onToggleCollapse: () => void
   onSaveScratchpad: (content: string) => Promise<void>
   onRecordVisit?: (link: { title: string; url: string; iconUrl?: string }) => void
 }
 
 type ActiveTab = 'scratchpad' | 'focus' | 'feeds'
 type PomodoroMode = 'work' | 'shortBreak' | 'longBreak'
 
 const DEFAULT_COUNTDOWNS: CountdownTarget[] = [
   { id: 'cd-1', title: '2027 新年元旦', targetDate: '2027-01-01' },
   { id: 'cd-2', title: '五一假期', targetDate: '2026-05-01' },
 ]
 
 const PRESET_FEEDS = {
   github: [
     { id: 'gh-1', title: 'shadcn/ui - Beautifully designed components built with Tailwind', url: 'https://github.com/shadcn-ui/ui', extra: '★ 82k' },
     { id: 'gh-2', title: 'tldraw/tldraw - Collaborative digital whiteboard library', url: 'https://github.com/tldraw/tldraw', extra: '★ 36k' },
     { id: 'gh-3', title: 'astral-sh/uv - An extremely fast Python package and project manager', url: 'https://github.com/astral-sh/uv', extra: '★ 44k' },
     { id: 'gh-4', title: 'cloudflare/workers-sdk - Tools for building Cloudflare Workers', url: 'https://github.com/cloudflare/workers-sdk', extra: '★ 5.8k' },
     { id: 'gh-5', title: 'dexie/Dexie.js - Minimalistic wrapper for IndexedDB', url: 'https://github.com/dexie/Dexie.js', extra: '★ 11k' },
   ],
   v2ex: [
     { id: 'v2-1', title: '大家现在在本地优先应用里都是怎么做多端同步的？', url: 'https://www.v2ex.com', extra: '42 回复' },
     { id: 'v2-2', title: '分享一个自用的轻量极简浏览器起始页设计', url: 'https://www.v2ex.com', extra: '38 回复' },
     { id: 'v2-3', title: 'Cloudflare D1 + Worker 实战体验与心得', url: 'https://www.v2ex.com', extra: '67 回复' },
     { id: 'v2-4', title: '日常写代码临时草稿剪贴板你是怎么解决的？', url: 'https://www.v2ex.com', extra: '29 回复' },
     { id: 'v2-5', title: '2026 年现代前端构建工具链选择讨论', url: 'https://www.v2ex.com', extra: '85 回复' },
   ],
   sspai: [
     { id: 'ss-1', title: '提升桌面与工作流掌控感：从定制个人专属导航页开始', url: 'https://sspai.com', extra: '生产力' },
     { id: 'ss-2', title: '番茄工作法与时间块管理的现代极简实践', url: 'https://sspai.com', extra: '效率方法' },
     { id: 'ss-3', title: '告别数据绑架：本地优先 (Local-First) 应用指南', url: 'https://sspai.com', extra: '数字生活' },
     { id: 'ss-4', title: '用最舒服的姿势写临时 Markdown 便签', url: 'https://sspai.com', extra: '工具推荐' },
   ],
 }
 
 export function RightSidebar({
   scratchpadContent,
   cardOpacity,
   settings,
   collapsed = false,
   onToggleCollapse,
   onSaveScratchpad,
   onRecordVisit,
 }: Props) {
   const isDark = settings.themeMode === 'dark'
   const [activeTab, setActiveTab] = useState<ActiveTab>('scratchpad')
 
   // ----------------- 1. Scratchpad (即时草稿板) -----------------
   const [text, setText] = useState(scratchpadContent)
  const [prevContent, setPrevContent] = useState(scratchpadContent)
   const [copied, setCopied] = useState(false)
   const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 
  if (scratchpadContent !== prevContent) {
    setPrevContent(scratchpadContent)
     setText(scratchpadContent)
  }
 
   function handleTextChange(val: string) {
     setText(val)
     if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
     saveTimerRef.current = setTimeout(() => {
       void onSaveScratchpad(val)
     }, 400)
   }
 
   function handleCopy() {
     if (!text) return
     void navigator.clipboard.writeText(text)
     setCopied(true)
     setTimeout(() => setCopied(false), 1800)
   }
 
   function handleClear() {
     if (!text) return
     if (window.confirm('确认清空草稿板内容吗？此操作将立即生效。')) {
       setText('')
       void onSaveScratchpad('')
     }
   }
 
   const charCount = text.length
   const lineCount = text ? text.split('\n').length : 0
 
   // ----------------- 2. Status & Pomodoro (专注与看板) -----------------
   const [pomoMode, setPomoMode] = useState<PomodoroMode>('work')
   const [isRunning, setIsRunning] = useState(false)
   const [timeLeft, setTimeLeft] = useState(25 * 60)
   const endTimeRef = useRef<number | null>(null)
 
   const durations: Record<PomodoroMode, number> = {
     work: 25 * 60,
     shortBreak: 5 * 60,
     longBreak: 15 * 60,
   }
 
   function playChime() {
     try {
       const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
       const osc = ctx.createOscillator()
       const gain = ctx.createGain()
       osc.type = 'sine'
       osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
       osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3) // A5
       gain.gain.setValueAtTime(0.2, ctx.currentTime)
       gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8)
       osc.connect(gain)
       gain.connect(ctx.destination)
       osc.start()
       osc.stop(ctx.currentTime + 0.8)
     } catch {
       // AudioContext blocked or not supported
     }
   }
 
   function switchPomoMode(mode: PomodoroMode) {
     setPomoMode(mode)
     setIsRunning(false)
     setTimeLeft(durations[mode])
     endTimeRef.current = null
   }
 
   function toggleTimer() {
     if (isRunning) {
       setIsRunning(false)
       endTimeRef.current = null
     } else {
       setIsRunning(true)
       endTimeRef.current = Date.now() + timeLeft * 1000
     }
   }
 
   function resetTimer() {
     setIsRunning(false)
     setTimeLeft(durations[pomoMode])
     endTimeRef.current = null
   }
 
   useEffect(() => {
     if (!isRunning) return
     const timer = setInterval(() => {
       if (!endTimeRef.current) return
       const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000))
       setTimeLeft(remaining)
       if (remaining <= 0) {
         setIsRunning(false)
         endTimeRef.current = null
         playChime()
       }
     }, 300)
     return () => clearInterval(timer)
   }, [isRunning])
 
   const formatPomoTime = (sec: number) => {
     const m = Math.floor(sec / 60)
     const s = sec % 60
     return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
   }
 
   const pomoTotal = durations[pomoMode]
   const pomoProgress = Math.max(0, Math.min(100, ((pomoTotal - timeLeft) / pomoTotal) * 100))
 
   // 倒数日
   const [countdowns, setCountdowns] = useState<CountdownTarget[]>(() => {
     const saved = localStorage.getItem('nav_countdowns')
     return saved ? JSON.parse(saved) : DEFAULT_COUNTDOWNS
   })
   const [showAddCd, setShowAddCd] = useState(false)
   const [newCdTitle, setNewCdTitle] = useState('')
   const [newCdDate, setNewCdDate] = useState('')
 
   function handleAddCountdown() {
     if (!newCdTitle.trim() || !newCdDate) return
     const item: CountdownTarget = {
       id: `cd-${Date.now()}`,
       title: newCdTitle.trim(),
       targetDate: newCdDate,
     }
     const next = [...countdowns, item]
     setCountdowns(next)
     localStorage.setItem('nav_countdowns', JSON.stringify(next))
     setNewCdTitle('')
     setNewCdDate('')
     setShowAddCd(false)
   }
 
   function handleDeleteCountdown(id: string) {
     const next = countdowns.filter((c) => c.id !== id)
     setCountdowns(next)
     localStorage.setItem('nav_countdowns', JSON.stringify(next))
   }
 
   function calcDaysLeft(dateStr: string) {
     const target = new Date(dateStr + 'T00:00:00').getTime()
     const now = new Date().setHours(0, 0, 0, 0)
     const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24))
     return diff
   }
 
   // ----------------- 3. Micro Feeds (摸鱼动态) -----------------
   const [feedSource, setFeedSource] = useState<'github' | 'v2ex' | 'sspai'>('github')
   const [isRefreshing, setIsRefreshing] = useState(false)
 
   function refreshFeeds() {
     setIsRefreshing(true)
     setTimeout(() => setIsRefreshing(false), 500)
   }
 
   const currentFeeds = PRESET_FEEDS[feedSource]
 
   // ----------------- 容器样式 -----------------
   const cardBg = isDark
     ? `rgba(24, 24, 27, ${cardOpacity / 100})`
     : `rgba(255, 255, 255, ${cardOpacity / 100})`
 
   const cardRadius =
     settings.cornerRadius === 'none'
       ? 'rounded-none'
       : settings.cornerRadius === 'md'
         ? 'rounded-xl'
         : 'rounded-2xl'
 
   // 如果收折，展示迷你悬浮条
   if (collapsed) {
     return (
      <aside id="right-workbench-collapsed" className="sticky top-14 hidden shrink-0 xl:block z-30">
         <button
           type="button"
           onClick={onToggleCollapse}
           title="展开常驻工作台 (Alt + \)"
           className={`flex h-28 w-9 flex-col items-center justify-center gap-1.5 ${cardRadius} border border-white/60 dark:border-white/10 shadow-lg backdrop-blur-md transition hover:scale-105 hover:border-blue-400`}
           style={{ backgroundColor: cardBg }}
         >
           <PanelRightOpen className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
           <span className="text-[10px] font-semibold text-neutral-700 dark:text-neutral-300 [writing-mode:vertical-lr] tracking-wider">
             工作台
           </span>
         </button>
       </aside>
     )
   }
 
   return (
     <aside
      id="right-workbench"
       className={`sticky top-14 hidden shrink-0 xl:flex flex-col w-[330px] 2xl:w-[350px] h-[calc(100vh-4.6rem)] ${cardRadius} border border-white/60 dark:border-white/10 shadow-2xl backdrop-blur-md overflow-hidden z-30 transition-all duration-200`}
       style={{ backgroundColor: cardBg }}
     >
       {/* Top Header */}
       <div className="flex h-11 shrink-0 items-center justify-between border-b border-black/5 dark:border-white/10 px-3.5">
         {/* Segmented Tabs */}
         <div className="flex items-center gap-1 rounded-xl bg-black/5 dark:bg-white/5 p-0.5 text-xs">
           <button
             type="button"
             onClick={() => setActiveTab('scratchpad')}
             className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
               activeTab === 'scratchpad'
                 ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                 : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
             }`}
           >
             <FileEdit className="h-3.5 w-3.5 text-blue-500" />
             <span>草稿板</span>
           </button>
 
           <button
             type="button"
             onClick={() => setActiveTab('focus')}
             className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
               activeTab === 'focus'
                 ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                 : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
             }`}
           >
             <Clock className="h-3.5 w-3.5 text-orange-500" />
             <span>专注看板</span>
           </button>
 
           <button
             type="button"
             onClick={() => setActiveTab('feeds')}
             className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
               activeTab === 'feeds'
                 ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                 : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
             }`}
           >
             <Flame className="h-3.5 w-3.5 text-rose-500" />
             <span>动态资讯</span>
           </button>
         </div>
 
         {/* Collapse Button */}
         <button
           type="button"
           onClick={onToggleCollapse}
           title="折叠常驻侧栏"
           className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-neutral-800 dark:hover:text-neutral-200 transition"
         >
           <PanelRightClose className="h-4 w-4" />
         </button>
       </div>
 
       {/* Main Scrollable Body */}
       <div className="flex-1 overflow-y-auto p-3.5">
         {/* ================= Tab 1: Scratchpad ================= */}
         {activeTab === 'scratchpad' && (
           <div className="flex h-full flex-col">
             <textarea
               value={text}
               onChange={(e) => handleTextChange(e.target.value)}
               placeholder="随手粘贴临时代码、调试命令、JSON、网址或思路... 本地即写即存。"
               className="w-full flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none font-mono"
               spellCheck={false}
             />
           </div>
         )}
 
         {/* ================= Tab 2: Focus & Status ================= */}
         {activeTab === 'focus' && (
           <div className="space-y-4">
             {/* Pomodoro Timer */}
             <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3.5 text-center">
               {/* Mode Switcher */}
               <div className="inline-flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/5 p-1 text-[11px] mb-3">
                 <button
                   type="button"
                   onClick={() => switchPomoMode('work')}
                   className={`rounded-full px-2.5 py-0.5 font-medium transition ${
                     pomoMode === 'work'
                       ? 'bg-orange-500 text-white shadow-sm'
                       : 'text-neutral-600 dark:text-neutral-400'
                   }`}
                 >
                   工作 25m
                 </button>
                 <button
                   type="button"
                   onClick={() => switchPomoMode('shortBreak')}
                   className={`rounded-full px-2.5 py-0.5 font-medium transition ${
                     pomoMode === 'shortBreak'
                       ? 'bg-emerald-500 text-white shadow-sm'
                       : 'text-neutral-600 dark:text-neutral-400'
                   }`}
                 >
                   短休 5m
                 </button>
                 <button
                   type="button"
                   onClick={() => switchPomoMode('longBreak')}
                   className={`rounded-full px-2.5 py-0.5 font-medium transition ${
                     pomoMode === 'longBreak'
                       ? 'bg-blue-500 text-white shadow-sm'
                       : 'text-neutral-600 dark:text-neutral-400'
                   }`}
                 >
                   长休 15m
                 </button>
               </div>
 
               {/* Circular Clock Display */}
               <div className="relative mx-auto my-2 flex h-28 w-28 items-center justify-center">
                 <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                   <circle
                     cx="50"
                     cy="50"
                     r="42"
                     className="stroke-black/10 dark:stroke-white/10"
                     strokeWidth="6"
                     fill="none"
                   />
                   <circle
                     cx="50"
                     cy="50"
                     r="42"
                     className="stroke-orange-500 transition-all duration-300"
                     strokeWidth="6"
                     strokeDasharray="263.89"
                     strokeDashoffset={263.89 - (263.89 * pomoProgress) / 100}
                     strokeLinecap="round"
                     fill="none"
                   />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                   <span className="font-mono text-2xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100">
                     {formatPomoTime(timeLeft)}
                   </span>
                   <span className="text-[10px] text-neutral-400">
                     {isRunning ? '专注中...' : '已暂停'}
                   </span>
                 </div>
               </div>
 
               {/* Control Buttons */}
               <div className="mt-3 flex items-center justify-center gap-2">
                 <button
                   type="button"
                   onClick={toggleTimer}
                   className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition ${
                     isRunning
                       ? 'bg-neutral-700 hover:bg-neutral-800'
                       : 'bg-orange-500 hover:bg-orange-600'
                   }`}
                 >
                   {isRunning ? (
                     <>
                       <Pause className="h-3.5 w-3.5" />
                       <span>暂停</span>
                     </>
                   ) : (
                     <>
                       <Play className="h-3.5 w-3.5" />
                       <span>开始</span>
                     </>
                   )}
                 </button>
 
                 <button
                   type="button"
                   onClick={resetTimer}
                   title="重置计时"
                   className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition"
                 >
                   <RotateCcw className="h-3.5 w-3.5" />
                 </button>
               </div>
             </div>
 
             {/* Countdowns Card */}
             <div className="space-y-2">
               <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300 px-1">
                 <span>目标与倒数日</span>
                 <button
                   type="button"
                   onClick={() => setShowAddCd(!showAddCd)}
                   className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-600 transition"
                 >
                   <Plus className="h-3 w-3" />
                   <span>新增</span>
                 </button>
               </div>
 
               {showAddCd && (
                 <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/90 dark:bg-neutral-800/90 p-2.5 text-xs space-y-2 shadow-md">
                   <input
                     placeholder="目标名称 (如: 毕业/发版)"
                     value={newCdTitle}
                     onChange={(e) => setNewCdTitle(e.target.value)}
                     className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-2 py-1 outline-none text-neutral-800 dark:text-neutral-100 focus:border-blue-500"
                   />
                   <input
                     type="date"
                     value={newCdDate}
                     onChange={(e) => setNewCdDate(e.target.value)}
                     className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-2 py-1 outline-none text-neutral-800 dark:text-neutral-100 focus:border-blue-500"
                   />
                   <div className="flex justify-end gap-1.5 pt-1">
                     <button
                       type="button"
                       onClick={() => setShowAddCd(false)}
                       className="px-2.5 py-1 text-neutral-500 hover:text-neutral-800"
                     >
                       取消
                     </button>
                     <button
                       type="button"
                       onClick={handleAddCountdown}
                       className="rounded-lg bg-blue-500 px-3 py-1 font-medium text-white shadow-sm hover:bg-blue-600"
                     >
                       保存
                     </button>
                   </div>
                 </div>
               )}
 
               <div className="space-y-1.5">
                 {countdowns.map((cd) => {
                   const days = calcDaysLeft(cd.targetDate)
                   const isPast = days < 0
                   return (
                     <div
                       key={cd.id}
                       className="group flex items-center justify-between rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2 text-xs transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                     >
                       <div>
                         <div className="font-medium text-neutral-800 dark:text-neutral-200">{cd.title}</div>
                         <div className="text-[10px] text-neutral-400">{cd.targetDate}</div>
                       </div>
                       <div className="flex items-center gap-2">
                         <span
                           className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                             isPast
                               ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-500'
                               : days <= 7
                                 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                 : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                           }`}
                         >
                           {isPast ? `已过 ${Math.abs(days)} 天` : `还有 ${days} 天`}
                         </span>
                         <button
                           type="button"
                           onClick={() => handleDeleteCountdown(cd.id)}
                           className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-rose-500 transition"
                         >
                           <Trash2 className="h-3 w-3" />
                         </button>
                       </div>
                     </div>
                   )
                 })}
               </div>
             </div>
           </div>
         )}
 
         {/* ================= Tab 3: Feeds ================= */}
         {activeTab === 'feeds' && (
           <div className="space-y-3">
             {/* Feed Source Tabs */}
             <div className="flex items-center justify-between">
               <div className="flex gap-1 text-[11px]">
                 <button
                   type="button"
                   onClick={() => setFeedSource('github')}
                   className={`rounded-lg px-2 py-1 font-medium transition ${
                     feedSource === 'github'
                       ? 'bg-neutral-800 text-white dark:bg-white dark:text-neutral-900'
                       : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                   }`}
                 >
                   GitHub
                 </button>
                 <button
                   type="button"
                   onClick={() => setFeedSource('v2ex')}
                   className={`rounded-lg px-2 py-1 font-medium transition ${
                     feedSource === 'v2ex'
                       ? 'bg-neutral-800 text-white dark:bg-white dark:text-neutral-900'
                       : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                   }`}
                 >
                   V2EX
                 </button>
                 <button
                   type="button"
                   onClick={() => setFeedSource('sspai')}
                   className={`rounded-lg px-2 py-1 font-medium transition ${
                     feedSource === 'sspai'
                       ? 'bg-neutral-800 text-white dark:bg-white dark:text-neutral-900'
                       : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                   }`}
                 >
                   少数派
                 </button>
               </div>
 
               <button
                 type="button"
                 onClick={refreshFeeds}
                 title="刷新资讯"
                 className={`flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition ${
                   isRefreshing ? 'animate-spin' : ''
                 }`}
               >
                 <RotateCcw className="h-3 w-3" />
               </button>
             </div>
 
             {/* Feed Items List */}
             <div className="space-y-1.5">
               {currentFeeds.map((feed, index) => (
                 <a
                   key={feed.id}
                   href={feed.url}
                   target="_blank"
                   rel="noopener noreferrer"
                   onClick={() => onRecordVisit?.({ title: feed.title, url: feed.url })}
                   className="group flex flex-col gap-1 rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-2.5 transition hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                 >
                   <div className="flex items-start justify-between gap-2">
                     <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-blue-500 line-clamp-2 leading-snug">
                       {feed.title}
                     </span>
                     <ExternalLink className="h-3 w-3 shrink-0 text-neutral-400 opacity-0 group-hover:opacity-100 transition" />
                   </div>
                   {feed.extra && (
                     <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                       <span className="font-semibold text-neutral-500 dark:text-neutral-400">#{index + 1}</span>
                       <span>•</span>
                       <span>{feed.extra}</span>
                     </div>
                   )}
                 </a>
               ))}
             </div>
           </div>
         )}
       </div>
 
       {/* Fixed Footer for Scratchpad actions */}
       {activeTab === 'scratchpad' && (
         <div className="flex h-10 shrink-0 items-center justify-between border-t border-black/5 dark:border-white/10 px-3.5 text-xs text-neutral-500 dark:text-neutral-400">
           <span className="text-[11px]">
             {charCount} 字符 • {lineCount} 行
           </span>
           <div className="flex items-center gap-1">
             <button
               type="button"
               onClick={handleCopy}
               disabled={!text}
               className="flex items-center gap-1 rounded-lg px-2 py-1 transition hover:bg-black/5 dark:hover:bg-white/5 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-40"
             >
               {copied ? (
                 <>
                   <Check className="h-3 w-3 text-emerald-500" />
                   <span className="text-emerald-500 font-medium">已复制</span>
                 </>
               ) : (
                 <>
                   <Copy className="h-3 w-3" />
                   <span>复制</span>
                 </>
               )}
             </button>
             <button
               type="button"
               onClick={handleClear}
               disabled={!text}
               className="flex items-center gap-1 rounded-lg px-2 py-1 text-rose-500 hover:bg-rose-500/10 transition disabled:opacity-40"
               title="清空草稿"
             >
               <Trash2 className="h-3 w-3" />
               <span>清空</span>
             </button>
           </div>
         </div>
       )}
     </aside>
   )
 }

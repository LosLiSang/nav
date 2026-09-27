import { useEffect, useRef, useState } from 'react'
 import {
   Check,
  CheckCircle2,
  Circle,
   Copy,
  CornerDownLeft,
   ExternalLink,
   FileEdit,
   Flame,
  ListTodo,
   PanelRightClose,
   PanelRightOpen,
   RotateCcw,
   Trash2,
 } from 'lucide-react'
import type { MemoItem, Settings } from '../types'
 
 type Props = {
   scratchpadContent: string
  memos: MemoItem[]
   cardOpacity: number
   settings: Settings
   collapsed?: boolean
   onToggleCollapse: () => void
   onSaveScratchpad: (content: string) => Promise<void>
  onAddMemo: (text: string) => Promise<void> | void
  onToggleMemo: (id: string) => Promise<void> | void
  onDeleteMemo: (id: string) => Promise<void> | void
   onRecordVisit?: (link: { title: string; url: string; iconUrl?: string }) => void
 }
 
type ActiveTab = 'scratchpad' | 'todo' | 'feeds'
type TodoFilter = 'all' | 'pending' | 'done'
 
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
  memos,
   cardOpacity,
   settings,
   collapsed = false,
   onToggleCollapse,
   onSaveScratchpad,
  onAddMemo,
  onToggleMemo,
  onDeleteMemo,
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
 
  // ----------------- 2. Todo / Memo (便签待办) -----------------
  const [todoInput, setTodoInput] = useState('')
  const [todoFilter, setTodoFilter] = useState<TodoFilter>('all')
  const [nowTime, setNowTime] = useState(() => Date.now())

   useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 60000)
     return () => clearInterval(timer)
  }, [])

  function handleAddTodo() {
    const val = todoInput.trim()
    if (!val) return
    void onAddMemo(val)
    setTodoInput('')
  }

  function formatMemoTime(timestamp: number, currentNow: number) {
    const diff = Math.floor((currentNow - timestamp) / 1000)
    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
    return `${Math.floor(diff / 86400)} 天前`
  }

  const totalMemos = memos.length
  const doneMemos = memos.filter((m) => m.done).length
  const pendingMemos = totalMemos - doneMemos
  const completionRate = totalMemos > 0 ? Math.round((doneMemos / totalMemos) * 100) : 0

  const filteredMemos = memos.filter((m) => {
    if (todoFilter === 'pending') return !m.done
    if (todoFilter === 'done') return m.done
    return true
  })
 
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
             onClick={() => setActiveTab('todo')}
             className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
               activeTab === 'todo'
                 ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                 : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
             }`}
           >
             <ListTodo className="h-3.5 w-3.5 text-orange-500" />
             <span>便签 Todo</span>
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
 
         {/* ================= Tab 2: Todo / Memo ================= */}
         {activeTab === 'todo' && (
           <div className="flex h-full flex-col space-y-3">
             {/* Progress & Filters */}
             <div className="space-y-2 rounded-2xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3">
               <div className="flex items-center justify-between text-xs">
                 <span className="font-medium text-neutral-700 dark:text-neutral-300">
                   {doneMemos}/{totalMemos} 项已完成
                 </span>
                 <span className="font-semibold text-orange-500 text-[11px] font-mono">
                   {completionRate}%
                 </span>
               </div>
 
               {/* Subtle Progress Bar */}
               <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                 <div
                   className="h-full rounded-full bg-gradient-to-r from-orange-400 to-emerald-500 transition-all duration-300"
                   style={{ width: `${completionRate}%` }}
                 />
               </div>
 
               {/* Filter Pills */}
               <div className="flex items-center gap-1 pt-1 text-[11px]">
                 <button
                   type="button"
                   onClick={() => setTodoFilter('all')}
                   className={`rounded-lg px-2 py-0.5 font-medium transition ${
                     todoFilter === 'all'
                       ? 'bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 shadow-sm'
                       : 'text-neutral-500 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                   }`}
                 >
                   全部 ({totalMemos})
                 </button>
                 <button
                   type="button"
                   onClick={() => setTodoFilter('pending')}
                   className={`rounded-lg px-2 py-0.5 font-medium transition ${
                     todoFilter === 'pending'
                       ? 'bg-orange-500 text-white shadow-sm'
                       : 'text-neutral-500 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                   }`}
                 >
                   待办 ({pendingMemos})
                 </button>
                 <button
                   type="button"
                   onClick={() => setTodoFilter('done')}
                   className={`rounded-lg px-2 py-0.5 font-medium transition ${
                     todoFilter === 'done'
                       ? 'bg-emerald-600 text-white shadow-sm'
                       : 'text-neutral-500 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/5'
                   }`}
                 >
                   已完成 ({doneMemos})
                 </button>
               </div>
             </div>
 
             {/* Input Box */}
             <div className="relative flex items-center">
               <input
                 value={todoInput}
                 onChange={(e) => setTodoInput(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') handleAddTodo()
                 }}
                 placeholder="添加待办便签，按 Enter 保存..."
                 className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.05] py-2 pl-3 pr-8 text-xs text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 outline-none focus:border-orange-500 transition"
               />
               <button
                 type="button"
                 onClick={handleAddTodo}
                 disabled={!todoInput.trim()}
                 className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500 text-white transition hover:bg-orange-600 disabled:opacity-30"
                 title="保存待办 (Enter)"
               >
                 <CornerDownLeft className="h-3 w-3" />
               </button>
             </div>
 
             {/* Todo Items List */}
             <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
               {filteredMemos.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-12 text-center text-neutral-400">
                   <CheckCircle2 className="h-8 w-8 text-neutral-300 dark:text-neutral-600 mb-2" />
                   <span className="text-xs">暂无待办事项，今天也是轻松高效的一天 ✨</span>
                 </div>
               ) : (
                 filteredMemos.map((memo) => (
                   <div
                     key={memo.id}
                     className="group flex items-start justify-between gap-2.5 rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-2.5 transition hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                   >
                     {/* Checkbox */}
                     <button
                       type="button"
                       onClick={() => void onToggleMemo(memo.id)}
                       className="mt-0.5 shrink-0 text-neutral-400 hover:text-orange-500 transition"
                       title={memo.done ? '标记为未完成' : '标记为已完成'}
                     >
                       {memo.done ? (
                         <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                       ) : (
                         <Circle className="h-4 w-4 hover:stroke-orange-500 transition" />
                       )}
                     </button>
 
                     {/* Content */}
                     <div className="flex-1 min-w-0">
                       <div
                         onClick={() => void onToggleMemo(memo.id)}
                         className={`cursor-pointer text-xs leading-relaxed transition ${
                           memo.done
                             ? 'line-through text-neutral-400 dark:text-neutral-500'
                             : 'font-medium text-neutral-800 dark:text-neutral-100'
                         }`}
                       >
                         {memo.text}
                       </div>
                       <div className="mt-1 text-[10px] text-neutral-400">
                         {formatMemoTime(memo.createdAt, nowTime)}
                       </div>
                     </div>
 
                     {/* Delete button */}
                     <button
                       type="button"
                       onClick={() => void onDeleteMemo(memo.id)}
                       className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-rose-500 transition p-0.5"
                       title="删除便签"
                     >
                       <Trash2 className="h-3.5 w-3.5" />
                     </button>
                   </div>
                 ))
               )}
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
 
       {/* Fixed Footer for Todo actions */}
       {activeTab === 'todo' && (
         <div className="flex h-10 shrink-0 items-center justify-between border-t border-black/5 dark:border-white/10 px-3.5 text-xs text-neutral-500 dark:text-neutral-400">
           <span className="text-[11px]">
             剩余 {pendingMemos} 项待办
           </span>
           {doneMemos > 0 && (
             <button
               type="button"
               onClick={async () => {
                 const doneItems = memos.filter((m) => m.done)
                 await Promise.all(doneItems.map((item) => onDeleteMemo(item.id)))
               }}
               className="text-[11px] text-neutral-400 hover:text-rose-500 transition"
             >
               清理已完成 ({doneMemos})
             </button>
           )}
         </div>
       )}
     </aside>
   )
 }

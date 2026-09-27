import { useEffect, useRef, useState } from 'react'
 import {
   Check,
  CheckCircle2,
  Circle,
  Clock,
   Copy,
  CornerDownLeft,
   FileEdit,
  ListTodo,
   PanelRightClose,
   PanelRightOpen,
  Pause,
  Play,
  Plus,
   RotateCcw,
  Sparkles,
  Target,
   Trash2,
 } from 'lucide-react'
import type { CountdownTarget, MemoItem, Settings } from '../types'
 
 type Props = {
   scratchpadContent: string
  memos: MemoItem[]
   cardOpacity: number
   settings: Settings
   collapsed?: boolean
  activeTab?: ActiveTab
  onSelectTab?: (tab: ActiveTab) => void
   onToggleCollapse: () => void
   onSaveScratchpad: (content: string) => Promise<void>
  onAddMemo: (text: string) => Promise<void> | void
  onToggleMemo: (id: string) => Promise<void> | void
  onDeleteMemo: (id: string) => Promise<void> | void
 }
 
type ActiveTab = 'scratchpad' | 'todo' | 'focus'
type TodoFilter = 'all' | 'pending' | 'done'
type PomodoroMode = 'work' | 'shortBreak' | 'longBreak'

const DEFAULT_COUNTDOWNS: CountdownTarget[] = [
  { id: 'cd-1', title: '2027 新年元旦', targetDate: '2027-01-01' },
  { id: 'cd-2', title: '五一假期', targetDate: '2026-05-01' },
]
 
 export function RightSidebar({
   scratchpadContent,
  memos,
   cardOpacity,
   settings,
   collapsed = false,
  activeTab: controlledTab,
  onSelectTab,
   onToggleCollapse,
   onSaveScratchpad,
  onAddMemo,
  onToggleMemo,
  onDeleteMemo,
 }: Props) {
   const isDark = settings.themeMode === 'dark'
  const [internalTab, setInternalTab] = useState<ActiveTab>('scratchpad')
  const activeTab = controlledTab ?? internalTab

  function handleTabChange(tab: ActiveTab) {
    setInternalTab(tab)
    onSelectTab?.(tab)
  }
 
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
  const [focusedMemoId, setFocusedMemoId] = useState<string | null>(null)

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
 
  // ----------------- 3. Focus & Pomodoro (专注与番茄钟) -----------------
  const [pomoMode, setPomoMode] = useState<PomodoroMode>('work')
  const [isRunning, setIsRunning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(25 * 60)
  const endTimeRef = useRef<number | null>(null)
  const [todayPomoCount, setTodayPomoCount] = useState<number>(() => {
    const todayKey = `nav_pomo_${new Date().toISOString().slice(0, 10)}`
    return Number(localStorage.getItem(todayKey) || 0)
  })

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
      // AudioContext blocked
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
        if (pomoMode === 'work') {
          const todayKey = `nav_pomo_${new Date().toISOString().slice(0, 10)}`
          const next = todayPomoCount + 1
          setTodayPomoCount(next)
          localStorage.setItem(todayKey, String(next))
        }
      }
    }, 300)
    return () => clearInterval(timer)
  }, [isRunning, pomoMode, todayPomoCount])

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
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
  }

  const focusedMemo = memos.find((m) => m.id === focusedMemoId)

   // ----------------- 容器样式 -----------------
   const cardBg = isDark
     ? `rgba(24, 24, 27, ${cardOpacity / 100})`
     : `rgba(255, 255, 255, ${cardOpacity / 100})`
  const accentColor = settings.highlightColor || '#ff6900'
 
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
          className={`flex h-24 w-8 flex-col items-center justify-center gap-1.5 ${cardRadius} border border-white/60 dark:border-white/10 shadow-lg backdrop-blur-md transition hover:scale-105 hover:border-blue-400`}
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
      className={`sticky top-14 hidden shrink-0 xl:flex flex-col w-[290px] 2xl:w-[310px] max-h-[calc(100vh-4.6rem)] h-auto ${cardRadius} border border-white/60 dark:border-white/10 shadow-2xl backdrop-blur-md overflow-hidden z-30 transition-all duration-200`}
       style={{ backgroundColor: cardBg }}
     >
       {/* Top Header */}
       <div className="flex h-11 shrink-0 items-center justify-between border-b border-black/5 dark:border-white/10 px-3.5">
         {/* Segmented Tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-black/5 dark:bg-white/5 p-0.5 text-xs">
           <button
             type="button"
              onClick={() => handleTabChange('scratchpad')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
               activeTab === 'scratchpad'
                 ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                 : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
             }`}
           >
             <FileEdit className="h-3.5 w-3.5 text-blue-500" />
             <span>草稿</span>
           </button>
 
           <button
             type="button"
              onClick={() => handleTabChange('todo')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
               activeTab === 'todo'
                 ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                 : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
             }`}
           >
             <ListTodo className="h-3.5 w-3.5 text-amber-500" />
             <span>便签</span>
           </button>

           <button
             type="button"
              onClick={() => handleTabChange('focus')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition ${
               activeTab === 'focus'
                 ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white shadow-sm'
                 : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
             }`}
           >
             <Clock className="h-3.5 w-3.5 text-orange-500" />
             <span>专注</span>
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
          <div className="flex flex-col">
             <textarea
              rows={7}
               value={text}
               onChange={(e) => handleTextChange(e.target.value)}
               placeholder="随手粘贴临时代码、调试命令、JSON、网址或思路... 本地即写即存。"
              className="w-full min-h-[140px] max-h-[420px] resize-none bg-transparent text-[13px] leading-relaxed text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 outline-none font-mono"
               spellCheck={false}
             />
           </div>
         )}
 
         {/* ================= Tab 2: Todo / Memo ================= */}
         {activeTab === 'todo' && (
          <div className="flex flex-col space-y-3">
             {/* Progress & Filters */}
             <div className="space-y-2 rounded-2xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3">
               <div className="flex items-center justify-between text-xs">
                 <span className="font-medium text-neutral-700 dark:text-neutral-300">
                   {doneMemos}/{totalMemos} 项已完成
                 </span>
                <span style={{ color: accentColor }} className="font-semibold text-[11px] font-mono">
                   {completionRate}%
                 </span>
               </div>
 
               {/* Subtle Progress Bar */}
               <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                 <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${completionRate}%`, backgroundColor: accentColor }}
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
                  style={{
                    backgroundColor: todoFilter === 'pending' ? accentColor : undefined,
                  }}
                   className={`rounded-lg px-2 py-0.5 font-medium transition ${
                     todoFilter === 'pending'
                      ? 'text-white shadow-sm'
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
                style={{ backgroundColor: accentColor }}
                className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-lg text-white transition hover:opacity-90 disabled:opacity-30"
                 title="保存待办 (Enter)"
               >
                 <CornerDownLeft className="h-3 w-3" />
               </button>
             </div>
 
             {/* Todo Items List */}
            <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-0.5">
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
                     <div className="flex items-center opacity-0 group-hover:opacity-100 transition gap-0.5">
                       {!memo.done && (
                         <button
                           type="button"
                           onClick={() => {
                             setFocusedMemoId(memo.id)
                             handleTabChange('focus')
                           }}
                           className="text-neutral-400 hover:text-orange-500 transition p-0.5"
                           title="为此任务开启专注番茄钟"
                         >
                           <Target className="h-3.5 w-3.5" />
                         </button>
                       )}
                       <button
                         type="button"
                         onClick={() => void onDeleteMemo(memo.id)}
                         className="text-neutral-400 hover:text-rose-500 transition p-0.5"
                         title="删除便签"
                       >
                         <Trash2 className="h-3.5 w-3.5" />
                       </button>
                     </div>
                   </div>
                 ))
               )}
             </div>
           </div>
         )}

         {/* ================= Tab 3: Focus & Pomodoro ================= */}
         {activeTab === 'focus' && (
           <div className="space-y-3.5">
             {/* Linked Task Card */}
             {focusedMemo ? (
               <div
                 style={{ borderColor: `${accentColor}30`, backgroundColor: `${accentColor}12` }}
                 className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs"
               >
                 <div className="flex items-center gap-1.5 min-w-0">
                   <Target style={{ color: accentColor }} className="h-3.5 w-3.5 shrink-0" />
                   <span className="truncate text-neutral-700 dark:text-neutral-300 font-medium">
                     当前专注：{focusedMemo.text}
                   </span>
                 </div>
                 <button
                   type="button"
                   onClick={() => setFocusedMemoId(null)}
                   className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 shrink-0 ml-1"
                 >
                   取消关联
                 </button>
               </div>
             ) : (
               <div className="flex items-center justify-between rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] px-3 py-1.5 text-xs text-neutral-500">
                 <div className="flex items-center gap-1.5">
                   <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                   <span>无关联任务（全局专注模式）</span>
                 </div>
                 {pendingMemos > 0 && (
                   <button
                     type="button"
                     onClick={() => handleTabChange('todo')}
                     style={{ color: accentColor }}
                     className="text-[11px] hover:underline"
                   >
                     选择待办
                   </button>
                 )}
               </div>
             )}

             {/* Pomodoro Timer */}
             <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3 text-center">
               {/* Mode Switcher */}
               <div className="inline-flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/5 p-1 text-[11px] mb-2">
                 <button
                   type="button"
                   onClick={() => switchPomoMode('work')}
                   style={{
                     backgroundColor: pomoMode === 'work' ? accentColor : undefined,
                   }}
                   className={`rounded-full px-2.5 py-0.5 font-medium transition ${
                     pomoMode === 'work'
                       ? 'text-white shadow-sm'
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
               <div className="relative mx-auto my-1.5 flex h-24 w-24 items-center justify-center">
                 <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                   <circle
                     cx="50"
                     cy="50"
                     r="42"
                     className="stroke-black/10 dark:stroke-white/10"
                     strokeWidth="5"
                     fill="none"
                   />
                   <circle
                     cx="50"
                     cy="50"
                     r="42"
                     style={{ stroke: accentColor }}
                     className="transition-all duration-300"
                     strokeWidth="5"
                     strokeDasharray="263.89"
                     strokeDashoffset={263.89 - (263.89 * pomoProgress) / 100}
                     strokeLinecap="round"
                     fill="none"
                   />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                   <span className="font-mono text-xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100">
                     {formatPomoTime(timeLeft)}
                   </span>
                   <span className="text-[10px] text-neutral-400">
                     {isRunning ? '专注中...' : '已就绪'}
                   </span>
                 </div>
               </div>

               {/* Control Buttons */}
               <div className="mt-2 flex items-center justify-center gap-2">
                 <button
                   type="button"
                   onClick={toggleTimer}
                   style={{
                     backgroundColor: isRunning ? undefined : accentColor,
                   }}
                   className={`flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition ${
                     isRunning
                       ? 'bg-neutral-700 hover:bg-neutral-800'
                       : 'hover:opacity-90'
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

             {/* Today Stats */}
             <div className="flex items-center justify-between rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] px-3 py-2 text-xs">
               <span className="text-neutral-500">今日已完成番茄：</span>
               <span style={{ color: accentColor }} className="font-semibold font-mono">
                 {todayPomoCount} 个 ({todayPomoCount * 25} 分钟)
               </span>
             </div>

             {/* Countdowns Card */}
             <div className="space-y-1.5">
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

               <div className="space-y-1">
                 {countdowns.map((cd) => {
                   const days = calcDaysLeft(cd.targetDate)
                   const isPast = days < 0
                   return (
                     <div
                       key={cd.id}
                       className="group flex items-center justify-between rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] px-2.5 py-1.5 text-xs transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                     >
                       <div className="min-w-0 flex-1">
                         <div className="font-medium text-neutral-800 dark:text-neutral-200 truncate">{cd.title}</div>
                         <div className="text-[10px] text-neutral-400">{cd.targetDate}</div>
                       </div>
                       <div className="flex items-center gap-1.5">
                         <span
                           className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
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

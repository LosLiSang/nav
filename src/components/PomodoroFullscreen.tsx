import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Minimize2, Pause, Play, RotateCcw, Target } from 'lucide-react'
import { POMODORO_LABELS, type PomodoroController } from '../lib/usePomodoro'

/**
 * 请求浏览器全屏；必须在用户点击的同步调用栈内执行。
 * 不支持或被拒绝时返回 false，调用方仍以页面内全屏覆盖层展示，计时不受影响。
 */
export async function requestPageFullscreen(): Promise<boolean> {
  const root = document.documentElement
  if (!document.fullscreenEnabled || typeof root.requestFullscreen !== 'function') return false
  if (document.fullscreenElement) return true
  try {
    await root.requestFullscreen({ navigationUI: 'hide' })
    return true
  } catch {
    return false
  }
}

function exitPageFullscreen() {
  if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
    void document.exitFullscreen().catch(() => {})
  }
}

const formatTime = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

type Props = {
  timer: PomodoroController
  open: boolean
  onClose: () => void
  accentColor: string
  taskText?: string
}

/** 全屏专注视图：只读取/操作同一个计时器，进入、退出都不改变计时状态。 */
export function PomodoroFullscreen({ timer, open, onClose, accentColor, taskText }: Props) {
  const primary = useRef<HTMLButtonElement | null>(null)
  const onCloseRef = useRef(onClose)
  const toggleRef = useRef(timer.toggle)
  useEffect(() => {
    onCloseRef.current = onClose
    toggleRef.current = timer.toggle
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    primary.current?.focus()
    let wasFullscreen = Boolean(document.fullscreenElement)
    // 用户按 Esc / F11 退出浏览器全屏时，同步关闭覆盖层，避免残留半屏状态。
    const onFullscreenChange = () => {
      if (document.fullscreenElement) { wasFullscreen = true; return }
      if (wasFullscreen) onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) { e.preventDefault(); onCloseRef.current(); return }
      if (e.code === 'Space' && !e.repeat) {
        const target = e.target as HTMLElement | null
        // 焦点在按钮上时空格会触发按钮本身，避免重复切换。
        if (target?.closest('button, input, textarea, select, [contenteditable="true"]')) return
        e.preventDefault()
        toggleRef.current()
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      exitPageFullscreen()
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  const total = Math.max(1, timer.preferences.durations[timer.mode] * 60)
  const progress = Math.max(0, Math.min(1, (total - timer.timeLeft) / total))
  const C = 2 * Math.PI * 46
  const statusText = timer.isRunning ? '专注中' : timer.status === 'completed' ? '阶段已完成' : timer.status === 'paused' ? '已暂停' : '已就绪'
  const modeColor = timer.mode === 'work' ? accentColor : timer.mode === 'shortBreak' ? '#10b981' : '#3b82f6'

  return createPortal(
    <div data-testid="pomodoro-fullscreen" role="dialog" aria-modal="true" aria-label="全屏专注"
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-[3vh] overflow-hidden bg-neutral-50 px-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] dark:opacity-[0.14]" style={{ background: `radial-gradient(circle at 50% 45%, ${modeColor}, transparent 60%)` }} />

      <button type="button" onClick={onClose} aria-label="退出全屏专注" title="退出全屏 (Esc)"
        className="absolute right-5 top-5 flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs font-medium text-neutral-600 backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-500">
        <Minimize2 className="h-4 w-4" />
        <span>退出全屏</span>
      </button>

      <div className="relative flex items-center gap-2 text-sm font-semibold tracking-wide sm:text-base" style={{ color: modeColor }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: modeColor }} />
        <span data-testid="pomodoro-fullscreen-mode">{POMODORO_LABELS[timer.mode]} · {timer.preferences.durations[timer.mode]} 分钟</span>
      </div>

      <div className="relative aspect-square w-[min(72vw,62vh,560px)]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2.5" className="stroke-black/10 dark:stroke-white/10" />
          <circle cx="50" cy="50" r="46" fill="none" strokeWidth="2.5" strokeLinecap="round" style={{ stroke: modeColor }}
            strokeDasharray={C} strokeDashoffset={C * (1 - progress)} className="transition-[stroke-dashoffset] duration-300" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span data-testid="pomodoro-fullscreen-time" role="timer" aria-live="off"
            className="font-mono font-bold tabular-nums leading-none tracking-tight text-[min(17vw,15vh,9rem)]">
            {formatTime(timer.timeLeft)}
          </span>
          <span className="mt-[1.5vh] text-sm text-neutral-500 dark:text-neutral-400 sm:text-base">{statusText}</span>
        </div>
      </div>

      {taskText && (
        <p data-testid="pomodoro-fullscreen-task" className="relative flex max-w-[min(90vw,40rem)] items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300 sm:text-base">
          <Target className="h-4 w-4 shrink-0" style={{ color: accentColor }} />
          <span className="truncate">{taskText}</span>
        </p>
      )}

      <div className="relative flex items-center gap-3">
        <button ref={primary} type="button" onClick={timer.toggle} data-testid="pomodoro-fullscreen-toggle"
          style={{ backgroundColor: timer.isRunning ? undefined : modeColor }}
          className={`flex min-w-32 items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold shadow-lg transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${timer.isRunning ? 'bg-neutral-700 text-white' : timer.mode === 'work' ? 'text-on-accent' : 'text-white'}`}>
          {timer.isRunning ? <><Pause className="h-4 w-4" />暂停</> : <><Play className="h-4 w-4" />开始</>}
        </button>
        <button type="button" onClick={timer.reset} aria-label="重置计时" title="重置计时"
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/10 bg-white/70 text-neutral-600 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-orange-500">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <p className="relative px-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
        今日已完成 {timer.todayCount} 个番茄（{timer.todayMinutes} 分钟） · 空格 开始/暂停 · Esc 退出
      </p>
    </div>,
    document.body,
  )
}

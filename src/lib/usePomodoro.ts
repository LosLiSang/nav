import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from './db'

export type PomodoroMode = 'work' | 'shortBreak' | 'longBreak'
export const POMODORO_DEFAULT_DURATIONS = { work: 25, shortBreak: 5, longBreak: 15 }
export const POMODORO_LABELS = { work: '工作', shortBreak: '短休', longBreak: '长休' }
// 用户未确认长休频次（issue #34），提供可配置项并明确默认值。
export const POMODORO_DEFAULT_LONG_BREAK_EVERY = 4
export const POMODORO_MIN_MINUTES = 1
export const POMODORO_MAX_MINUTES = 120
export const POMODORO_MIN_LONG_BREAK_EVERY = 2
export const POMODORO_MAX_LONG_BREAK_EVERY = 8

export type PomodoroDurations = Record<PomodoroMode, number>
export const nextPomodoroMode = (mode: PomodoroMode, completedWork = 0, longBreakEvery = POMODORO_DEFAULT_LONG_BREAK_EVERY): PomodoroMode => {
  if (mode !== 'work') return 'work'
  // 今日完成的第 N 个工作阶段结束后：N 是 longBreakEvery 的整数倍进长休，否则短休。
  return completedWork % longBreakEvery === 0 ? 'longBreak' : 'shortBreak'
}

type Preferences = {
  sound: boolean
  notifications: boolean
  volume: number
  durations: PomodoroDurations
  longBreakEvery: number
}
type Timer = {
  mode: PomodoroMode
  remainingMs: number
  totalMs: number
  deadline: number | null
  status: 'ready' | 'running' | 'paused' | 'completed'
}
type Completion = { id: number; mode: PomodoroMode }
const PREFERENCES_KEY = `nav_pomo_preferences:${db.name}`
const notificationsSupported = () => typeof Notification !== 'undefined' && window.isSecureContext
const todayKey = () => `nav_pomo_${new Date().toISOString().slice(0, 10)}`
const minutesKey = () => `nav_pomo_minutes_${new Date().toISOString().slice(0, 10)}`
function todayCount() {
  try {
    const value = Number(localStorage.getItem(todayKey()) || 0)
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  } catch { return 0 }
}
function todayMinutes() {
  try {
    const value = Number(localStorage.getItem(minutesKey()) || 0)
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  } catch { return 0 }
}
const sanitizeMinutes = (value: unknown, fallback: number) => {
  const minutes = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(minutes) && minutes >= POMODORO_MIN_MINUTES && minutes <= POMODORO_MAX_MINUTES
    ? Math.round(minutes)
    : fallback
}
const sanitizeLongBreakEvery = (value: unknown) => {
  const every = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(every) && every >= POMODORO_MIN_LONG_BREAK_EVERY && every <= POMODORO_MAX_LONG_BREAK_EVERY
    ? Math.round(every)
    : POMODORO_DEFAULT_LONG_BREAK_EVERY
}
function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}')
    const savedDurations = saved?.durations ?? {}
    return {
      sound: saved?.sound === true,
      notifications: saved?.notifications === true && notificationsSupported() && Notification.permission === 'granted',
      volume: typeof saved?.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(100, saved.volume)) : 50,
      durations: {
        work: sanitizeMinutes(savedDurations.work, POMODORO_DEFAULT_DURATIONS.work),
        shortBreak: sanitizeMinutes(savedDurations.shortBreak, POMODORO_DEFAULT_DURATIONS.shortBreak),
        longBreak: sanitizeMinutes(savedDurations.longBreak, POMODORO_DEFAULT_DURATIONS.longBreak),
      },
      longBreakEvery: sanitizeLongBreakEvery(saved?.longBreakEvery),
    }
  } catch {
    return {
      sound: false, notifications: false, volume: 50,
      durations: { ...POMODORO_DEFAULT_DURATIONS },
      longBreakEvery: POMODORO_DEFAULT_LONG_BREAK_EVERY,
    }
  }
}
const initialTimer = (mode: PomodoroMode, durations: PomodoroDurations): Timer => ({
  mode,
  remainingMs: durations[mode] * 60 * 1000,
  totalMs: durations[mode] * 60 * 1000,
  deadline: null,
  status: 'ready',
})

/**
 * 页面内的独立计时：不持久化运行状态、不在刷新时补发、不跨标签页恢复。
 * deadline 是唯一时间源；完成时先同步清空 deadline，再执行提醒，避免恢复事件重复发送。
 * 声音/系统通知偏好按本设备与账号隔离，不跟随整页快照同步。
 */
export function usePomodoro(onOpenTimer: () => void) {
  const [timer, setTimer] = useState(() => initialTimer('work', readPreferences().durations))
  const timerRef = useRef(timer)
  const [preferences, setPreferences] = useState(readPreferences)
  const preferencesRef = useRef(preferences)
  const [completed, setCompleted] = useState<Completion | null>(null)
  const completedRef = useRef<Completion | null>(null)
  const [warning, setWarning] = useState('')
  const [count, setCount] = useState(todayCount)
  const [minutes, setMinutes] = useState(todayMinutes)
  const [permissionPending, setPermissionPending] = useState(false)
  const pendingRef = useRef(false)
  const mounted = useRef(false)
  const runId = useRef(0)
  const [instanceId] = useState(() => crypto.randomUUID())
  const openTimerRef = useRef(onOpenTimer)
  useEffect(() => { openTimerRef.current = onOpenTimer }, [onOpenTimer])
  const audio = useRef<AudioContext | null>(null)
  const tone = useRef<OscillatorNode | null>(null)
  const audioGeneration = useRef(0)
  const notificationGeneration = useRef(0)
  const notification = useRef<Notification | null>(null)
  const originalTitle = useRef<string | null>(null)
  const reminderTitle = useRef<string | null>(null)

  const commit = useCallback((next: Timer) => {
    timerRef.current = next
    setTimer(next)
  }, [])
  const restoreTitle = useCallback(() => {
    if (originalTitle.current !== null && document.title === reminderTitle.current) {
      document.title = originalTitle.current
    }
    originalTitle.current = reminderTitle.current = null
  }, [])
  const switchNextMode = useCallback((from: PomodoroMode) => {
    // 工作阶段在 reconcile 中已先累加今日次数；休息阶段次数不变。
    const next = nextPomodoroMode(from, todayCount(), preferencesRef.current.longBreakEvery)
    const now = Date.now()
    runId.current++
    const nextTimer = initialTimer(next, preferencesRef.current.durations)
    commit({ ...nextTimer, deadline: now + nextTimer.totalMs, status: 'running' })
  }, [commit])
  const updateTitle = useCallback(() => {
    const completion = completedRef.current
    if (!completion || document.visibilityState !== 'hidden') { restoreTitle(); return }
    if (originalTitle.current === null) originalTitle.current = document.title
    reminderTitle.current = `${POMODORO_LABELS[completion.mode]}阶段已完成 · ${originalTitle.current}`
    document.title = reminderTitle.current
  }, [restoreTitle])
  const closeNotification = useCallback(() => {
    try { notification.current?.close() } catch { /* 不阻断页面内提醒 */ }
    notification.current = null
  }, [])
  const dismiss = useCallback(() => {
    completedRef.current = null
    setCompleted(null)
    restoreTitle()
    closeNotification()
  }, [restoreTitle, closeNotification])
  const stopTone = useCallback(() => {
    audioGeneration.current++
    try { tone.current?.stop() } catch { /* 已停止的 oscillator 无须重复停止 */ }
    tone.current = null
  }, [])
  const savePreferences = useCallback((updates: Partial<Preferences>) => {
    const next = { ...preferencesRef.current, ...updates }
    preferencesRef.current = next
    setPreferences(next)
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)) }
    catch { setWarning('提醒设置无法保存；当前页面仍可使用，刷新后可能丢失。') }
  }, [])

  // 只在主动开启、开始或试听的用户操作中创建/恢复 AudioContext。
  const prepareAudio = useCallback(async () => {
    const generation = audioGeneration.current
    try {
      if (!audio.current || audio.current.state === 'closed') {
        const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Audio) throw new Error('unsupported audio')
        audio.current = new Audio()
      }
      if (audio.current.state !== 'running') await audio.current.resume()
      return mounted.current && generation === audioGeneration.current && audio.current.state === 'running'
    } catch {
      if (mounted.current && generation === audioGeneration.current) setWarning('声音提醒无法启用，请检查浏览器声音权限后再次试听；页面提醒仍可用。')
      return false
    }
  }, [])
  const playChime = useCallback(() => {
    try {
      const ctx = audio.current
      if (!ctx || ctx.state !== 'running') throw new Error('audio suspended')
      if (preferencesRef.current.volume === 0) return
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      tone.current = oscillator
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(587.33, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3)
      gain.gain.setValueAtTime(preferencesRef.current.volume / 100 * 0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.onended = () => {
        oscillator.disconnect()
        gain.disconnect()
        if (tone.current === oscillator) tone.current = null
      }
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.8)
    } catch { setWarning('声音提醒播放失败，可能被浏览器限制；页面提醒仍可用。') }
  }, [])

  const reconcile = useCallback(() => {
    const current = timerRef.current
    if (current.deadline !== null) {
      const remainingMs = Math.max(0, current.deadline - Date.now())
      if (remainingMs > 0) {
        if (Math.ceil(remainingMs / 1000) !== Math.ceil(current.remainingMs / 1000)) commit({ ...current, remainingMs })
      } else {
        // 必须先更新 ref：interval、focus 与 visibilitychange 共享这一去重门闩。
        commit({ ...current, remainingMs: 0, deadline: null, status: 'completed' })
        const completion = { id: runId.current, mode: current.mode }
        completedRef.current = completion
        setCompleted(completion)
        if (current.mode === 'work') {
          const next = todayCount() + 1
          setCount(next)
          const spent = preferencesRef.current.durations.work
          setMinutes(todayMinutes() + spent)
          try {
            localStorage.setItem(todayKey(), String(next))
            localStorage.setItem(minutesKey(), String(todayMinutes() + spent))
          } catch { setWarning('完成次数无法保存；页面提醒仍可用。') }
        }
        if (preferencesRef.current.sound) playChime()
        if (preferencesRef.current.notifications) {
          try {
            if (!notificationsSupported() || Notification.permission !== 'granted') throw new Error('notification unavailable')
            closeNotification()
            const upcoming = nextPomodoroMode(current.mode, todayCount(), preferencesRef.current.longBreakEvery)
            const item = new Notification(`${POMODORO_LABELS[current.mode]}阶段已完成`, {
              body: `已自动开始${POMODORO_LABELS[upcoming]}。点击返回专注工作台。`,
              tag: `nav-pomodoro-${instanceId}-${completion.id}`,
            })
            notification.current = item
            item.onclick = () => {
              try { window.focus() } catch { /* 某些浏览器禁止自动聚焦 */ }
              openTimerRef.current()
              closeNotification()
            }
          } catch { setWarning('系统通知发送失败或权限已失效；页面完成提示仍可用。') }
        }
        // 自动衔接下一阶段：提醒保持展示，运行中的下一阶段不受关闭提醒影响。
        switchNextMode(current.mode)
      }
    }
    updateTitle()
  }, [commit, playChime, closeNotification, updateTitle, instanceId, switchNextMode])

  const disposeReminders = useCallback(() => {
    // 读取最新的能力实例和请求令牌，而不是 effect 挂载时的值。
    stopTone()
    notificationGeneration.current++
    closeNotification()
    restoreTitle()
    void audio.current?.close().catch(() => {})
    audio.current = null
  }, [stopTone, closeNotification, restoreTitle])
  useEffect(() => {
    mounted.current = true
    document.addEventListener('visibilitychange', reconcile)
    window.addEventListener('focus', reconcile)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', reconcile)
      window.removeEventListener('focus', reconcile)
      disposeReminders()
    }
  }, [reconcile, disposeReminders])
  useEffect(() => {
    if (timer.status !== 'running') return
    const interval = window.setInterval(reconcile, 250)
    return () => window.clearInterval(interval)
  }, [timer.status, reconcile])

  const switchMode = (mode: PomodoroMode) => {
    stopTone()
    dismiss()
    commit(initialTimer(mode, preferencesRef.current.durations))
  }
  const toggle = () => {
    const current = timerRef.current
    const now = Date.now()
    if (current.deadline !== null) {
      if (current.deadline <= now) { reconcile(); return }
      stopTone()
      commit({ ...current, remainingMs: current.deadline - now, deadline: null, status: 'paused' })
    } else {
      dismiss()
      runId.current++
      const remainingMs = current.status === 'completed' ? current.totalMs : current.remainingMs
      commit({ ...current, remainingMs, deadline: now + remainingMs, status: 'running' })
      if (preferencesRef.current.sound) void prepareAudio()
    }
  }
  const setSound = (enabled: boolean) => {
    stopTone()
    setWarning('')
    savePreferences({ sound: enabled })
    if (enabled) void prepareAudio()
  }
  const setNotifications = async (enabled: boolean) => {
    if (pendingRef.current) return
    const generation = ++notificationGeneration.current
    setWarning('')
    if (!enabled) { savePreferences({ notifications: false }); closeNotification(); return }
    if (!notificationsSupported()) { setWarning('此浏览器或页面不支持系统通知；请使用页面或声音提醒。'); return }
    if (Notification.permission === 'denied') { setWarning('系统通知权限已被拒绝，请在浏览器站点设置中修改；不会再次请求权限。'); return }
    pendingRef.current = true
    setPermissionPending(true)
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (!mounted.current || generation !== notificationGeneration.current) return
      savePreferences({ notifications: permission === 'granted' })
      if (permission !== 'granted') setWarning('系统通知权限未获允许，请使用页面或声音提醒。')
    } catch {
      if (mounted.current && generation === notificationGeneration.current) setWarning('系统通知权限请求失败，请使用页面或声音提醒。')
    } finally {
      pendingRef.current = false
      if (mounted.current) setPermissionPending(false)
    }
  }
  const previewSound = async () => {
    stopTone()
    setWarning('')
    if (preferencesRef.current.sound && await prepareAudio()) playChime()
  }
  const setDuration = (mode: PomodoroMode, value: string) => {
    const text = value.trim()
    const minutes = Number(text)
    if (!text || !Number.isFinite(minutes) || !Number.isInteger(minutes)) {
      setWarning('时长必须为整数分钟。')
      return false
    }
    if (minutes < POMODORO_MIN_MINUTES || minutes > POMODORO_MAX_MINUTES) {
      setWarning(`时长需在 ${POMODORO_MIN_MINUTES}-${POMODORO_MAX_MINUTES} 分钟之间。`)
      return false
    }
    setWarning('')
    const durations = { ...preferencesRef.current.durations, [mode]: minutes }
    savePreferences({ durations })
    // 就绪阶段立即按新时长初始化；运行/暂停中的阶段保持原计时，修改从下一阶段生效。
    if (timerRef.current.status === 'ready' && timerRef.current.mode === mode) {
      commit(initialTimer(mode, durations))
    }
    return true
  }
  const setLongBreakEvery = (value: string) => {
    const text = value.trim()
    const every = Number(text)
    if (!text || !Number.isFinite(every) || !Number.isInteger(every) || every < POMODORO_MIN_LONG_BREAK_EVERY || every > POMODORO_MAX_LONG_BREAK_EVERY) {
      setWarning(`长休间隔需为 ${POMODORO_MIN_LONG_BREAK_EVERY}-${POMODORO_MAX_LONG_BREAK_EVERY} 的整数。`)
      return false
    }
    setWarning('')
    savePreferences({ longBreakEvery: every })
    return true
  }

  return {
    mode: timer.mode, isRunning: timer.status === 'running', status: timer.status,
    timeLeft: Math.ceil(timer.remainingMs / 1000), todayCount: count, todayMinutes: minutes,
    completed, warning, preferences, permissionPending,
    toggle, reset: () => switchMode(timerRef.current.mode), switchMode, dismiss,
    setSound, setNotifications, previewSound,
    setDuration, setLongBreakEvery,
    setVolume: (volume: number) => savePreferences({ volume: Math.max(0, Math.min(100, volume)) }),
  }
}

export type PomodoroController = ReturnType<typeof usePomodoro>

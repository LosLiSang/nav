import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { Bell, CheckCircle2, Timer as TimerIcon, Volume2, X } from 'lucide-react'
import {
  POMODORO_LABELS,
  POMODORO_MAX_LONG_BREAK_EVERY,
  POMODORO_MAX_MINUTES,
  POMODORO_MIN_LONG_BREAK_EVERY,
  POMODORO_MIN_MINUTES,
  type PomodoroController,
  type PomodoroMode,
} from '../lib/usePomodoro'
import { RangeInput } from './RangeInput'

function ReminderSettingsFields({ timer }: { timer: PomodoroController }) {
  return (
    <div className="space-y-2.5 text-xs">
      <label className="flex cursor-pointer items-center gap-2 text-neutral-700 dark:text-neutral-200">
        <input type="checkbox" aria-label="启用声音提醒" checked={timer.preferences.sound} onChange={e => timer.setSound(e.target.checked)} className="accent-orange-500" />
        <Volume2 className="h-3.5 w-3.5 shrink-0" />
        声音提醒
        <button type="button" aria-label="试听提醒音" disabled={!timer.preferences.sound} onClick={e => { e.preventDefault(); void timer.previewSound() }} className="ml-auto rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 hover:bg-white dark:hover:bg-neutral-800 disabled:opacity-40">试听</button>
      </label>
      {timer.preferences.sound && (
        <div className="space-y-1.5 px-1">
          <div className="flex justify-between text-[11px] text-neutral-600 dark:text-neutral-400"><span>音量</span><span>{timer.preferences.volume}%</span></div>
          <RangeInput aria-label="提醒音量" min={0} max={100} value={timer.preferences.volume} onChange={e => timer.setVolume(Number(e.target.value))} />
        </div>
      )}
      <label className="flex cursor-pointer items-center gap-2 text-neutral-700 dark:text-neutral-200">
        <input type="checkbox" aria-label="启用系统通知" checked={timer.preferences.notifications} disabled={timer.permissionPending} onChange={e => void timer.setNotifications(e.target.checked)} className="accent-orange-500" />
        <Bell className="h-3.5 w-3.5 shrink-0" />
        {timer.permissionPending ? '等待通知权限…' : '系统通知'}
      </label>
    </div>
  )
}

function DurationInputs({ timer }: { timer: PomodoroController }) {
  const [drafts, setDrafts] = useState<Record<PomodoroMode, string>>(() => ({
    work: String(timer.preferences.durations.work),
    shortBreak: String(timer.preferences.durations.shortBreak),
    longBreak: String(timer.preferences.durations.longBreak),
  }))
  const rows: Array<{ key: PomodoroMode; label: string }> = [
    { key: 'work', label: '工作时长' },
    { key: 'shortBreak', label: '短休时长' },
    { key: 'longBreak', label: '长休时长' },
  ]
  return (
    <div className="space-y-2 text-xs">
      {rows.map(({ key, label }) => (
        <label key={key} className="flex items-center justify-between gap-3 text-neutral-700 dark:text-neutral-200">
          <span className="shrink-0">{label}</span>
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={POMODORO_MIN_MINUTES}
              max={POMODORO_MAX_MINUTES}
              aria-label={label}
              data-testid={`pomodoro-duration-${key}`}
              value={drafts[key]}
              onChange={(e) => {
                const value = e.target.value
                setDrafts((prev) => ({ ...prev, [key]: value }))
                timer.setDuration(key, value)
              }}
              className="w-20 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-right outline-none text-neutral-800 dark:text-neutral-100 focus:border-orange-500"
            />
            <span className="text-neutral-500">分钟</span>
          </span>
        </label>
      ))}
    </div>
  )
}

/** 专注设置弹窗：仅修改配置，不暂停/重置正在运行的计时。 */
export function PomodoroSettingsDialog({ timer, open, onClose }: { timer: PomodoroController; open: boolean; onClose: () => void }) {
  const [longBreakDraft, setLongBreakDraft] = useState(String(timer.preferences.longBreakEvery))
  useEffect(() => {
    if (open) setLongBreakDraft(String(timer.preferences.longBreakEvery))
    // 仅在弹窗打开时同步最新已保存配置，输入过程不被保存值覆盖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        data-testid="pomodoro-settings-dialog"
        role="dialog"
        aria-label="专注设置"
        className="nav-dialog w-full max-w-sm rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 text-neutral-800 dark:text-neutral-200 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
              <TimerIcon className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">专注设置</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭专注设置" className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="space-y-2.5 rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3">
          <h3 className="font-semibold text-neutral-700 dark:text-neutral-200">结束提醒</h3>
          <ReminderSettingsFields timer={timer} />
          <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            页面提示默认开启。阶段结束后自动开始下一阶段；后台或休眠可能延迟，恢复后下一阶段从当时重新计时。关闭页面不提醒，刷新不恢复计时。提醒偏好只保存在本设备。
          </p>
        </section>

        <section className="mt-3 space-y-2.5 rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3">
          <h3 className="font-semibold text-neutral-700 dark:text-neutral-200">阶段时长</h3>
          <DurationInputs timer={timer} />
          <label className="flex items-center justify-between gap-3 text-xs text-neutral-700 dark:text-neutral-200">
            <span className="shrink-0">长休间隔</span>
            <span className="flex items-center gap-1.5">
              <span className="text-[11px] text-neutral-500">每</span>
              <input
                type="number"
                inputMode="numeric"
                min={POMODORO_MIN_LONG_BREAK_EVERY}
                max={POMODORO_MAX_LONG_BREAK_EVERY}
                aria-label="长休间隔"
                data-testid="pomodoro-long-break-every"
                value={longBreakDraft}
                onChange={(e) => {
                  setLongBreakDraft(e.target.value)
                  timer.setLongBreakEvery(e.target.value)
                }}
                className="w-20 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-right outline-none text-neutral-800 dark:text-neutral-100 focus:border-orange-500"
              />
              <span className="text-[11px] text-neutral-500">个番茄</span>
            </span>
          </label>
          <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            时长范围 {POMODORO_MIN_MINUTES}-{POMODORO_MAX_MINUTES} 分钟。运行或暂停中修改只影响下一阶段，当前阶段不会被重置或跳变。
          </p>
        </section>

        {timer.warning && <p data-testid="pomodoro-warning" role="status" className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">{timer.warning}</p>}
      </div>
    </div>,
    document.body,
  )
}

/** 挂到 body，切换便签/草稿或折叠侧栏后仍能看到完成提示；自动循环不因关闭提示中断。 */
export function PomodoroCompletion({ timer, onOpen }: { timer: PomodoroController; onOpen: () => void }) {
  if (!timer.completed) return null
  const mode = timer.completed.mode
  return createPortal(
    <div data-testid="pomodoro-reminder" role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[90] w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 text-neutral-800 dark:text-neutral-100 shadow-2xl">
      <div className="flex items-start gap-2.5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{POMODORO_LABELS[mode]}阶段已完成</p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">已自动开始{POMODORO_LABELS[timer.mode]}。关闭提醒不会中断当前计时。</p>
        </div>
        <button type="button" aria-label="关闭完成提醒" onClick={timer.dismiss} className="rounded p-0.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X className="h-4 w-4" /></button>
      </div>
      {timer.warning && <p data-testid="pomodoro-warning" className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">{timer.warning}</p>}
      <button type="button" onClick={() => { onOpen(); timer.dismiss() }} className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800">查看计时</button>
    </div>,
    document.body,
  )
}

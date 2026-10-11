import { createPortal } from 'react-dom'
import { Bell, CheckCircle2, Volume2, X } from 'lucide-react'
import { nextPomodoroMode, POMODORO_LABELS, type PomodoroController } from '../lib/usePomodoro'
import { RangeInput } from './RangeInput'

export function PomodoroReminderSettings({ timer }: { timer: PomodoroController }) {
  return (
    <fieldset className="space-y-2.5 rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-3 text-xs">
      <legend className="px-1 font-semibold text-neutral-700 dark:text-neutral-200">结束提醒</legend>
      <label className="flex cursor-pointer items-center gap-2 text-neutral-700 dark:text-neutral-200">
        <input type="checkbox" aria-label="启用声音提醒" checked={timer.preferences.sound} onChange={e => timer.setSound(e.target.checked)} className="accent-orange-500" />
        <Volume2 className="h-3.5 w-3.5 shrink-0" />
        声音提醒
        <button type="button" disabled={!timer.preferences.sound} onClick={e => { e.preventDefault(); void timer.previewSound() }} className="ml-auto rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 hover:bg-white dark:hover:bg-neutral-800 disabled:opacity-40">试听</button>
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
      {timer.warning && <p data-testid="pomodoro-warning" role="status" className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">{timer.warning}</p>}
      <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        页面提示默认开启。结束后等待操作；后台或休眠可能延迟。关闭页面不提醒，刷新不恢复计时。提醒偏好只保存在本设备。
      </p>
    </fieldset>
  )
}

/** 挂到 body，切换便签/草稿或折叠侧栏后仍能看到完成提示。 */
export function PomodoroCompletion({ timer, onOpen }: { timer: PomodoroController; onOpen: () => void }) {
  if (!timer.completed) return null
  const mode = timer.completed.mode
  const next = nextPomodoroMode(mode)
  return createPortal(
    <div data-testid="pomodoro-reminder" role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[90] w-80 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 text-neutral-800 dark:text-neutral-100 shadow-2xl">
      <div className="flex items-start gap-2.5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{POMODORO_LABELS[mode]}阶段已完成</p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">接下来可以进入{POMODORO_LABELS[next]}，准备好再开始。</p>
        </div>
        <button type="button" aria-label="关闭完成提醒" onClick={timer.dismiss} className="rounded p-0.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X className="h-4 w-4" /></button>
      </div>
      {timer.warning && <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">{timer.warning}</p>}
      <button type="button" onClick={() => { onOpen(); timer.switchMode(next) }} className="mt-3 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800">进入{POMODORO_LABELS[next]}</button>
    </div>,
    document.body,
  )
}

import { useEffect, useState } from 'react'

type Props = {
  open: boolean
  memo: string
  onToggle: () => void
  onChangeMemo: (value: string) => void
}

export function WidgetDock({ open, memo, onToggle, onChangeMemo }: Props) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const dateText = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  return (
    <>
      <button
        onClick={onToggle}
        className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-neutral-900/85 px-4 py-2 text-sm text-white shadow-xl backdrop-blur transition hover:bg-neutral-900"
      >
        {open ? '收起工具' : '工具'}
      </button>

      {open && (
        <section className="fixed bottom-16 left-1/2 z-40 w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/40 bg-white/90 p-4 shadow-2xl backdrop-blur-xl">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 p-3">
              <div className="text-sm text-neutral-500">日历</div>
              <div className="mt-1 text-xl font-semibold text-neutral-900">{dateText}</div>
              <div className="text-3xl font-bold text-neutral-900">
                {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 p-3">
              <div className="text-sm text-neutral-500">备忘录</div>
              <textarea
                value={memo}
                onChange={(event) => onChangeMemo(event.target.value)}
                placeholder="记录临时想法..."
                className="mt-2 h-28 w-full resize-none rounded-lg border border-neutral-200 p-2 text-sm outline-none focus:border-neutral-900"
              />
            </div>
          </div>
        </section>
      )}
    </>
  )
}

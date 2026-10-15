import type { ReactNode } from 'react'

/** 分组卡片：组标题 + 圆角白卡（行间缩进分隔线）+ 组脚注。 */
export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-1.5 px-1 text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">{title}</h3>}
      <div className="settings-group overflow-hidden rounded-xl bg-white dark:bg-white/[0.05] ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {children}
      </div>
      {footer && <div className="mt-1.5 px-1 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">{footer}</div>}
    </section>
  )
}

/** 设置行：左侧标题/说明，右侧控件；stacked 时控件换到下一行占满宽度。 */
export function Row({
  label,
  hint,
  stacked = false,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  stacked?: boolean
  children?: ReactNode
}) {
  return (
    <div
      className={`flex min-h-11 gap-x-4 gap-y-2 px-3.5 py-2.5 ${
        stacked ? 'flex-col' : 'flex-wrap items-center justify-between'
      }`}
    >
      <div className="min-w-0">
        <div className="text-[13px] text-neutral-900 dark:text-neutral-100">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

/** 仿 Apple 分段控件（原生 button + radiogroup 语义）。 */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  full = false,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
  full?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${full ? 'flex w-full' : 'inline-flex'} shrink-0 rounded-lg bg-black/[0.06] dark:bg-white/[0.08] p-0.5`}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1 text-[12px] transition ${
              selected
                ? 'bg-white dark:bg-white/20 font-medium text-neutral-900 dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.15)]'
                : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

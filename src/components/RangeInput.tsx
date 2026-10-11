import type { ComponentProps, CSSProperties } from 'react'

type Props = Omit<ComponentProps<'input'>, 'type' | 'value' | 'min' | 'max' | 'aria-label'> & {
  value: number
  min: number
  max: number
  'aria-label': string
}

/** 保留原生 range 的键盘与表单行为，只统一主题轨道及填充。 */
export function RangeInput({ value, min, max, className = '', style, ...props }: Props) {
  const progress = max > min ? Math.min(100, Math.max(0, (value - min) / (max - min) * 100)) : 0
  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      className={`nav-range ${className}`}
      style={{ ...style, '--range-progress': `${progress}%` } as CSSProperties}
    />
  )
}

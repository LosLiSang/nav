import { createPortal } from 'react-dom'
import { useState } from 'react'
import { Bold, Circle, Italic, Square, X } from 'lucide-react'
import type { CategoryStyle } from '../types'

type Props = {
  categoryName: string
  currentStyle?: CategoryStyle
  onClose: () => void
  onSave: (style: CategoryStyle) => void
}

const DEFAULT_STYLE: CategoryStyle = {
  iconShape: 'rounded',
  fontSize: 13,
  isBold: false,
  isItalic: false,
  textColor: '#1f2937',
}

export function CategoryStyleModal({
  categoryName,
  currentStyle,
  onClose,
  onSave,
}: Props) {
  const [style, setStyle] = useState<CategoryStyle>({
    ...DEFAULT_STYLE,
    ...(currentStyle ?? {}),
  })

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4.5 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h2 className="text-base font-semibold text-neutral-900">
            批量设置「{categoryName}」网址格式
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 rounded-lg bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500">
          ⓘ 此格式仅对「{categoryName}」分类网址有效，可随时恢复默认。
        </div>

        <div className="mt-3 space-y-3.5 text-xs">
          {/* 1. Icon Shape (方块型、圆角、全圆) */}
          <div>
            <label className="block font-medium text-neutral-700 mb-1.5">
              图标角标形状
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'rounded', label: '圆角方块', icon: Square, desc: '有圆角' },
                { id: 'square', label: '直角方块', icon: Square, desc: '无圆角' },
                { id: 'circle', label: '圆形徽章', icon: Circle, desc: '全圆' },
              ].map((opt) => {
                const isSelected = style.iconShape === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setStyle((prev) => ({
                        ...prev,
                        iconShape: opt.id as CategoryStyle['iconShape'],
                      }))
                    }
                    className={`flex flex-col items-center justify-center rounded-xl border py-2 text-xs transition ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/50 text-orange-600 ring-1 ring-orange-500'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-[10px] text-neutral-400 mt-0.5">{opt.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Format Controls: Font Size, Bold, Italic, Color */}
          <div>
            <label className="block font-medium text-neutral-700 mb-1.5">
              文字排版格式
            </label>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 p-2">
              {/* Font size */}
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500">字号:</span>
                <select
                  value={style.fontSize}
                  onChange={(e) =>
                    setStyle((prev) => ({ ...prev, fontSize: Number(e.target.value) }))
                  }
                  className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs outline-none"
                >
                  <option value={12}>12px</option>
                  <option value={13}>13px (默认)</option>
                  <option value={14}>14px</option>
                  <option value={15}>15px</option>
                  <option value={16}>16px</option>
                </select>
              </div>

              {/* Bold */}
              <button
                type="button"
                onClick={() =>
                  setStyle((prev) => ({ ...prev, isBold: !prev.isBold }))
                }
                className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-bold transition ${
                  style.isBold
                    ? 'border-orange-500 bg-orange-50 text-orange-600'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
                title="加粗"
              >
                <Bold className="h-3.5 w-3.5" />
              </button>

              {/* Italic */}
              <button
                type="button"
                onClick={() =>
                  setStyle((prev) => ({ ...prev, isItalic: !prev.isItalic }))
                }
                className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs italic transition ${
                  style.isItalic
                    ? 'border-orange-500 bg-orange-50 text-orange-600'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
                title="斜体"
              >
                <Italic className="h-3.5 w-3.5" />
              </button>

              {/* Color */}
              <div className="flex items-center gap-1">
                {[
                  { color: '#1f2937', title: '默认黑灰' },
                  { color: '#2563eb', title: '科技蓝' },
                  { color: '#ea580c', title: '活力橙' },
                  { color: '#059669', title: '青翠绿' },
                ].map((c) => (
                  <button
                    key={c.color}
                    type="button"
                    onClick={() => setStyle((prev) => ({ ...prev, textColor: c.color }))}
                    style={{ backgroundColor: c.color }}
                    className={`h-4.5 w-4.5 rounded-full transition ${
                      style.textColor === c.color
                        ? 'ring-2 ring-orange-500 ring-offset-1 scale-110'
                        : 'hover:opacity-80'
                    }`}
                    title={c.title}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 3. Live Preview */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="text-[11px] text-neutral-400 mb-1.5">效果预览</div>
            <div className="flex items-center gap-2">
              <div
                className={`flex h-5 w-5 items-center justify-center bg-black text-white text-[10px] font-bold ${
                  style.iconShape === 'square'
                    ? 'rounded-none'
                    : style.iconShape === 'circle'
                      ? 'rounded-full'
                      : 'rounded-lg'
                }`}
              >
                G
              </div>
              <span
                style={{
                  fontSize: `${style.fontSize}px`,
                  fontWeight: style.isBold ? 700 : 400,
                  fontStyle: style.isItalic ? 'italic' : 'normal',
                  color: style.textColor,
                }}
              >
                Github 示例链接
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStyle(DEFAULT_STYLE)}
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              重置文字格式
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(style)
                  onClose()
                }}
                className="rounded-xl bg-[#ff6900] px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#e05d00]"
              >
                立即保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  , document.body)
}

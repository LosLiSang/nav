import { useEffect, useRef } from 'react'
import { Edit2, Image as ImageIcon, RotateCcw, Star, Trash2 } from 'lucide-react'
import type { Bookmark } from '../types'

type Props = {
  bookmark: Bookmark | null
  x: number
  y: number
  onClose: () => void
  onEdit: (bookmark: Bookmark) => void
  onDelete: (bookmarkId: string) => void
  onToggleFavorite?: (bookmarkId: string) => void
  onRefreshIcon?: (bookmark: Bookmark) => void
  onChangeIcon?: (bookmark: Bookmark) => void
}

export function BookmarkContextMenu({
  bookmark,
  x,
  y,
  onClose,
  onEdit,
  onDelete,
  onToggleFavorite,
  onRefreshIcon,
  onChangeIcon,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let removeListeners: (() => void) | null = null
    const timer = setTimeout(() => {
      function handleClickOutside(e: MouseEvent) {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          onClose()
        }
      }
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('mousedown', handleClickOutside)
      window.addEventListener('keydown', handleKeyDown)
      removeListeners = () => {
        window.removeEventListener('mousedown', handleClickOutside)
        window.removeEventListener('keydown', handleKeyDown)
      }
    }, 50)

    return () => {
      clearTimeout(timer)
      removeListeners?.()
    }
  }, [onClose])

  if (!bookmark) return null

  const adjustedX = Math.min(x, window.innerWidth - 150)
  const adjustedY = Math.min(y, window.innerHeight - 180)

  return (
    <div
      ref={menuRef}
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className="fixed z-50 flex w-36 flex-col overflow-hidden rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white/95 dark:bg-[#18181b]/95 p-1 text-xs shadow-2xl backdrop-blur-md text-neutral-700 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onEdit(bookmark)
          onClose()
        }}
        className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-neutral-700 dark:text-neutral-200 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
      >
        <Edit2 className="h-3.5 w-3.5 text-neutral-500" />
        <span>编辑网址</span>
      </button>

      {onChangeIcon && (
        <button
          type="button"
          onClick={() => {
            onChangeIcon(bookmark)
            onClose()
          }}
          className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-neutral-700 dark:text-neutral-200 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
        >
          <ImageIcon className="h-3.5 w-3.5 text-orange-500" />
          <span>自定义图标</span>
        </button>
      )}

      {onToggleFavorite && (
        <button
          type="button"
          onClick={() => {
            onToggleFavorite(bookmark.id)
            onClose()
          }}
          className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-neutral-700 dark:text-neutral-200 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
        >
          <Star
            className={`h-3.5 w-3.5 ${
              bookmark.isFavorite
                ? 'fill-amber-400 text-amber-400'
                : 'text-neutral-500'
            }`}
          />
          <span>{bookmark.isFavorite ? '取消收藏' : '设为收藏'}</span>
        </button>
      )}

      {onRefreshIcon && (
        <button
          type="button"
          onClick={() => {
            onRefreshIcon(bookmark)
            onClose()
          }}
          className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-neutral-700 dark:text-neutral-200 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5 text-neutral-500" />
          <span>重新获取图标</span>
        </button>
      )}

      <div className="my-1 h-[1px] bg-neutral-100 dark:bg-neutral-800" />

      <button
        type="button"
        onClick={() => {
          onDelete(bookmark.id)
          onClose()
        }}
        className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/30"
      >
        <Trash2 className="h-3.5 w-3.5 text-red-500" />
        <span>删除</span>
      </button>
    </div>
  )
}
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { faviconFor } from '../lib/utils'
import type { Bookmark, Category } from '../types'

type Props = {
  bookmarks: Bookmark[]
  categories: Category[]
  cardOpacity: number
  onEdit: (bookmark: Bookmark) => void
  onDelete: (id: string) => void
}

function BookmarkItem({
  bookmark,
  opacity,
  onEdit,
  onDelete,
}: {
  bookmark: Bookmark
  opacity: number
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bookmark.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        backgroundColor: `rgba(255,255,255,${opacity / 100})`,
        zIndex: isDragging ? 10 : undefined,
      }}
     {...attributes}
     {...listeners}
      className="group relative flex h-11 cursor-grab select-none items-center gap-3 rounded-xl border border-neutral-200/70 dark:border-neutral-700 px-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
     onClick={() => window.open(bookmark.url, '_blank', 'noopener,noreferrer')}
   >
     <img
       src={faviconFor(bookmark.url, bookmark.iconUrl)}
       alt=""
       className="h-5 w-5 rounded object-contain"
       onError={(event) => {
         event.currentTarget.style.visibility = 'hidden'
       }}
     />
      <span className="min-w-0 flex-1 truncate text-sm text-neutral-800 dark:text-neutral-100">{bookmark.title}</span>
     <div className="absolute right-1 hidden items-center gap-1 group-hover:flex">
       <button
         onPointerDown={(event) => event.stopPropagation()}
         onClick={(event) => {
           event.stopPropagation()
           onEdit()
         }}
          className="rounded bg-white/90 dark:bg-neutral-800/90 px-1.5 py-0.5 text-xs text-neutral-600 dark:text-neutral-300 shadow"
       >
         编辑
       </button>
       <button
         onPointerDown={(event) => event.stopPropagation()}
         onClick={(event) => {
           event.stopPropagation()
           if (window.confirm(`删除「${bookmark.title}」？`)) onDelete()
         }}
          className="rounded bg-white/90 dark:bg-neutral-800/90 px-1.5 py-0.5 text-xs text-red-500 dark:text-red-400 shadow"
       >
         删除
       </button>
      </div>
    </div>
  )
}

export function BookmarkGrid({ bookmarks, cardOpacity, onEdit, onDelete }: Props) {
  if (bookmarks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
        还没有网址。点击右上角「添加网址」开始。
      </div>
    )
  }

  return (
    <SortableContext items={bookmarks.map((bookmark) => bookmark.id)} strategy={rectSortingStrategy}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {bookmarks.map((bookmark) => (
          <BookmarkItem
            key={bookmark.id}
            bookmark={bookmark}
            opacity={cardOpacity}
            onEdit={() => onEdit(bookmark)}
            onDelete={() => onDelete(bookmark.id)}
          />
        ))}
      </div>
    </SortableContext>
  )
}

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Category } from '../types'

type Props = {
  categories: Category[]
  activeCategoryId: string
  draggingId: string | null
  onSelect: (id: string) => void
  onAdd: (name: string) => void
  onDelete: (id: string) => void
}

function CategoryTab({
  category,
  active,
  dragging,
  onSelect,
  onDelete,
}: {
  category: Category
  active: boolean
  dragging: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `category:${category.id}` })

  return (
    <div ref={setNodeRef}>
      <button
        onClick={onSelect}
        onContextMenu={(event) => {
          event.preventDefault()
          if (window.confirm(`删除分类「${category.name}」及其中的网址？`)) onDelete()
        }}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
          active || (dragging && isOver)
            ? 'bg-neutral-900 text-white'
            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
        }`}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
        {category.name}
      </button>
    </div>
  )
}

export function CategoryBar({
  categories,
  activeCategoryId,
  draggingId,
  onSelect,
  onAdd,
  onDelete,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CategoryTab
        category={{ id: 'all', name: '全部', color: '#64748b', order: -1 }}
        active={activeCategoryId === 'all'}
        dragging={false}
        onSelect={() => onSelect('all')}
        onDelete={() => undefined}
      />
      {categories.map((category) => (
        <CategoryTab
          key={category.id}
          category={category}
          active={activeCategoryId === category.id}
          dragging={Boolean(draggingId)}
          onSelect={() => onSelect(category.id)}
          onDelete={() => onDelete(category.id)}
        />
      ))}

      {adding ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) onAdd(name)
            setName('')
            setAdding(false)
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              setName('')
              setAdding(false)
            }}
            placeholder="分类名称"
            className="w-28 rounded-full border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900"
          />
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-700"
        >
          + 分类
        </button>
      )}
    </div>
  )
}

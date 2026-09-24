import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowUpDown,
  Check,
  Edit3,
  HelpCircle,
  Info,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { fetchFaviconBlob, getFaviconCandidates, hostnameOf, normalizeIconUrl, resolveTextColor } from '../lib/utils'
import { getBrandIcon } from '../lib/brandIcons'
import { ConfirmModal } from './ConfirmModal'
import type { Bookmark, Category, Settings } from '../types'

type Props = {
  categories: Category[]
  activeCategoryId: string
  bookmarks: Bookmark[]
  isSortMode: boolean
  cardOpacity: number
  settings: Settings
  cachedIcons?: Record<string, string>
  failedDomains?: Record<string, boolean>
  onSaveCachedIcon?: (domain: string, dataOrBlob: string | Blob, objectUrl?: string) => void
  onSaveFailedIcon?: (domain: string) => void
  onSelectCategory: (id: string) => void
  onAddCategory: (name: string) => void
  onDeleteCategory: (id: string) => void
  onUpdateCategory?: (id: string, updates: Partial<Category>) => void
  onToggleSortMode: () => void
  onOpenAddBookmark: () => void
  onContextMenuBookmark: (bookmark: Bookmark, x: number, y: number) => void
  onOpenBookmarkStyle: () => void
  onUpdateSettings?: (values: Partial<Settings>) => void
}

const HELP_ITEMS = [
  {
    id: 'dnd',
    title: '拖放管理书签（新功能）',
    content: '点击卡片右上角的双向箭头进入「排序模式」。按住书签即可任意拖动调整顺序；直接将书签拖拽释放到上方分类标签上，可快速移动归类至该分类。',
  },
  {
    id: 'add-cat',
    title: '新建、编辑分类？',
    content: '点击分类标签右侧的「+」按钮，输入名称后回车即可新增分类；右键点击任意分类标签可进行重命名或删除。',
  },
  {
    id: 'sort-cat',
    title: '对分类进行排序？',
    content: '进入排序模式后，分类标签支持自由拖动排序，方便将最高频使用的分类放在最前面。',
  },
  {
    id: 'del-cat',
    title: '删除、恢复分类？',
    content: '右键点击分类标签即可选择删除分类；若不慎误删，可在右上角「设置」面板中随时导入此前导出的备份文件进行恢复。',
  },
  {
    id: 'add-bm',
    title: '添加、编辑书签？',
    content: '点击右上角的「+ 添加」按钮即可添加新网址，并支持点击「抓取标题」自动提取网页名称；右键任意书签选择「编辑」可修改标题和链接。',
  },
  {
    id: 'sort-bm',
    title: '对书签进行排序？',
    content: '点击卡片右上角的排序图标开启排序模式，按住书签卡片拖拽调整排列顺序，完成后再次点击即可锁定。',
  },
  {
    id: 'move-bm',
    title: '移动书签到其他分类？',
    content: '在开启排序模式的状态下，拖动书签卡片悬停到目标分类标签上释放，即可完成快速移入分类。',
  },
  {
    id: 'folder',
    title: '创建文件夹 或 子网址？',
    content: '支持在分类下整理书签；添加网址时可以快速切换所属分类归类整理。',
  },
  {
    id: 'del-bm',
    title: '删除、恢复书签？',
    content: '右键点击任意书签卡片选择「删除」即可移除；所有数据均存储在本地浏览器 IndexedDB 中，建议在全局设置中定期导出 JSON 备份。',
  },
]

function CategoryTabItem({
  category,
  active,
  highlightColor,
  onSelect,
  onContextMenu,
}: {
  category: Category
  active: boolean
  highlightColor?: string
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `category:${category.id}` })

  return (
    <div ref={setNodeRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={onSelect}
        onContextMenu={onContextMenu}
        style={active ? { backgroundColor: highlightColor || '#2563eb' } : undefined}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
          active
            ? 'text-white shadow-sm'
            : isOver
              ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400'
              : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
        }`}
      >
        {!active && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: category.color }}
          />
        )}
        <span>{category.name}</span>
      </button>
    </div>
  )
}

function BookmarkCardItem({
  bookmark,
  isSortMode,
  settings,
  cachedIcon,
  isFailedDomain,
  onSaveCachedIcon,
  onSaveFailedIcon,
  onContextMenu,
}: {
  bookmark: Bookmark
  isSortMode: boolean
  settings: Settings
  cachedIcon?: string
  isFailedDomain?: boolean
  onSaveCachedIcon?: (domain: string, dataOrBlob: string | Blob, objectUrl?: string) => void
  onSaveFailedIcon?: (domain: string) => void
  onContextMenu: (x: number, y: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bookmark.id,
    disabled: !isSortMode,
  })

  const domain = useMemo(() => hostnameOf(bookmark.url), [bookmark.url])
  // 与样式面板里的实时预览共用同一套判断，避免两边显示不一致
  const effectiveTextColor = resolveTextColor(settings)

  const normalizedIconUrl = useMemo(
    () => normalizeIconUrl(bookmark.iconUrl),
    [bookmark.iconUrl],
  )
  const normalizedCachedIcon = useMemo(
    () => normalizeIconUrl(cachedIcon),
    [cachedIcon],
  )
  const iconShape = settings.iconShape ?? 'rounded'
  const brandIcon = getBrandIcon(bookmark.title, bookmark.url, iconShape, settings)
  const candidates = useMemo(
    () => getFaviconCandidates(bookmark.url, normalizedIconUrl),
    [bookmark.url, normalizedIconUrl],
  )
  const [fetchFailed, setFetchFailed] = useState(isFailedDomain ?? false)

  useEffect(() => {
    if (normalizedIconUrl || normalizedCachedIcon || isFailedDomain) {
      setFetchFailed(isFailedDomain ?? false)
      return
    }

    if (!domain || !onSaveCachedIcon || candidates.length === 0) {
      setFetchFailed(true)
      return
    }

    let cancelled = false
    setFetchFailed(false)

    fetchFaviconBlob(candidates).then((result) => {
      if (cancelled) return
      if (result) {
        onSaveCachedIcon(domain, result.blob, result.objectUrl)
        setFetchFailed(false)
      } else {
        setFetchFailed(true)
        onSaveFailedIcon?.(domain)
      }
    })

    return () => {
      cancelled = true
    }
  }, [bookmark.url, normalizedIconUrl, normalizedCachedIcon, isFailedDomain, domain, candidates, onSaveCachedIcon, onSaveFailedIcon])

  const effectiveIconUrl = normalizedIconUrl || normalizedCachedIcon
  const hasIcon = Boolean(effectiveIconUrl) && !fetchFailed && !isFailedDomain

  const shapeClass =
    iconShape === 'square'
      ? 'rounded-none'
      : iconShape === 'circle'
        ? 'rounded-full'
        : 'rounded-lg'

  const itemRadius =
    settings.cornerRadius === 'none'
      ? 'rounded-none'
      : settings.cornerRadius === 'md'
        ? 'rounded-md'
        : 'rounded-lg'

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isSortMode) {
          window.open(bookmark.url, '_blank', 'noopener,noreferrer')
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e.clientX, e.clientY)
      }}
      className={`group relative flex h-9 select-none items-center gap-2 px-2.5 transition ${itemRadius} ${
        isSortMode
          ? 'cursor-grab border border-dashed border-neutral-300 bg-neutral-50 active:cursor-grabbing'
          : 'cursor-pointer hover:bg-neutral-100/80'
      }`}
    >
      {settings.showBookmarkIcon !== false && (
        hasIcon ? (
          <img
            src={effectiveIconUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => {
              if (cachedIcon && onSaveCachedIcon && domain) {
                onSaveCachedIcon(domain, '')
              }
              setFetchFailed(true)
              onSaveFailedIcon?.(domain)
            }}
            className={`h-4.5 w-4.5 flex-shrink-0 object-contain ${shapeClass}`}
            loading="lazy"
          />
        ) : (
          brandIcon
        )
      )}

      <span
        style={{
          fontFamily: settings.fontFamily || undefined,
          fontSize: settings.fontSize ? `${settings.fontSize}px` : undefined,
          fontWeight: settings.isBold ? 700 : undefined,
          fontStyle: settings.isItalic ? 'italic' : undefined,
          color: effectiveTextColor,
        }}
        className="min-w-0 flex-1 truncate text-[13px] font-normal tracking-tight group-hover:text-blue-500 dark:group-hover:text-white transition-colors"
      >
        {bookmark.title}
      </span>
    </div>
  )
}

export function MainCategoryCard({
  categories,
  activeCategoryId,
  bookmarks,
  isSortMode,
  cardOpacity,
  settings,
  cachedIcons,
  failedDomains,
  onSaveCachedIcon,
  onSaveFailedIcon,
  onSelectCategory,
  onAddCategory,
  onDeleteCategory,
  onUpdateCategory,
  onToggleSortMode,
  onOpenAddBookmark,
  onContextMenuBookmark,
  onOpenBookmarkStyle,
  onUpdateSettings,
}: Props) {
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [showHelpMenu, setShowHelpMenu] = useState(false)
  const [selectedHelp, setSelectedHelp] = useState<(typeof HELP_ITEMS)[0] | null>(null)
  const [showLayoutMenu, setShowLayoutMenu] = useState(false)
  const [layoutTab, setLayoutTab] = useState<'common' | 'icon' | 'note'>('common')
  const [categoryContextMenu, setCategoryContextMenu] = useState<{ category: Category; x: number; y: number } | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatColor, setEditCatColor] = useState('#3b82f6')
  const [deletingCat, setDeletingCat] = useState<Category | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowHelpMenu(false)
        setShowLayoutMenu(false)
      }
      setCategoryContextMenu(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isFavActive = activeCategoryId === 'cat-fav'
  const isDark = settings.themeMode === 'dark'
  const cardBg = isDark
    ? `rgba(24, 24, 27, ${cardOpacity / 100})`
    : `rgba(255, 255, 255, ${cardOpacity / 100})`

  const cardRadius =
    settings.cornerRadius === 'none'
      ? 'rounded-none'
      : settings.cornerRadius === 'md'
        ? 'rounded-xl'
        : 'rounded-2xl'

  return (
    <section
      className={`relative ${showLayoutMenu || showHelpMenu ? 'z-30' : 'z-10'} border border-neutral-100/90 dark:border-white/10 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md transition-all text-neutral-800 dark:text-neutral-100 ${cardRadius}`}
      style={{ backgroundColor: cardBg }}
    >
      {/* Category header tabs: strictly SINGLE LINE, no wrap */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2.5">
        {/* Left category pills: horizontal scroll without scrollbar */}
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* ⭐ Star Tab (Favorite/Bookmark Tab) */}
          <button
            type="button"
            onClick={() => onSelectCategory('cat-fav')}
            title="我的收藏"
            className={`flex h-6.5 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${
              isFavActive
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-amber-50/80 text-amber-600 hover:bg-amber-100'
            }`}
          >
            <Star
              className={`h-3.5 w-3.5 ${
                isFavActive ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'
              }`}
            />
            <span>收藏</span>
          </button>

          {categories.map((cat) => (
            <CategoryTabItem
              key={cat.id}
              category={cat}
              active={activeCategoryId === cat.id}
              highlightColor={settings.highlightColor}
              onSelect={() => onSelectCategory(cat.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                setCategoryContextMenu({
                  category: cat,
                  x: rect.left,
                  y: rect.bottom + 4,
                })
              }}
            />
          ))}

          {addingCat ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (newCatName.trim()) onAddCategory(newCatName)
                setNewCatName('')
                setAddingCat(false)
              }}
              className="flex flex-shrink-0 items-center"
            >
              <input
                autoFocus
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onBlur={() => {
                  setNewCatName('')
                  setAddingCat(false)
                }}
                placeholder="新分类"
                className="w-20 rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs outline-none focus:border-blue-500"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCat(true)}
              title="添加新分类"
              className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              +
            </button>
          )}
        </div>

        {/* Right toolbar controls: fixed, never wrap */}
        <div ref={toolbarRef} className="relative flex items-center gap-1 text-neutral-400 flex-shrink-0">
          <button
            type="button"
            title="帮助说明"
            onClick={() => {
              setShowHelpMenu((prev) => !prev)
              setShowLayoutMenu(false)
            }}
            className={`rounded p-1 transition ${
              showHelpMenu ? 'bg-neutral-100 dark:bg-neutral-800 text-orange-600' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onOpenAddBookmark}
            className="flex items-center gap-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-0.5 text-xs text-neutral-700 dark:text-neutral-200 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-700"
          >
            <Plus className="h-3 w-3" />
            <span>添加</span>
          </button>

          <button
            type="button"
            onClick={onToggleSortMode}
            title={isSortMode ? '退出排序模式' : '打开拖拽排序模式'}
            className={`rounded p-1 transition ${
              isSortMode
                ? 'bg-blue-500 text-white'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            title="切换布局"
            onClick={() => {
              setShowLayoutMenu((prev) => !prev)
              setShowHelpMenu(false)
            }}
            className={`rounded p-1 transition ${
              showLayoutMenu ? 'bg-neutral-100 dark:bg-neutral-800 text-orange-600' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setShowHelpMenu(false)
              setShowLayoutMenu(false)
              onOpenBookmarkStyle()
            }}
            title="书签排版与展示设置"
            className="rounded p-1 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {/* Dropdown 1: Help Menu (Image #1) */}
          {showHelpMenu && (
            <div className="absolute right-20 top-8 z-50 w-56 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-[#18181b] p-1.5 text-xs shadow-2xl backdrop-blur-md">
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHelp(HELP_ITEMS[0])
                      setShowHelpMenu(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-neutral-700 dark:text-neutral-200 transition hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                  >
                    <HelpCircle className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                    <span className="font-medium text-neutral-800 dark:text-white">{HELP_ITEMS[0].title}</span>
                  </button>
                </div>

                <div className="py-1 space-y-0.5">
                  {HELP_ITEMS.slice(1, 4).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedHelp(item)
                        setShowHelpMenu(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-neutral-600 dark:text-neutral-300 transition hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                    >
                      <HelpCircle className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>

                <div className="py-1 space-y-0.5">
                  {HELP_ITEMS.slice(4).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedHelp(item)
                        setShowHelpMenu(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-neutral-600 dark:text-neutral-300 transition hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                    >
                      <HelpCircle className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Dropdown 2: Layout / "网址样式" (Comment 8 & Attached Image 8) */}
          {showLayoutMenu && (
            <div className="absolute right-6 top-8 z-50 w-72 rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-[#18181b] p-4 text-xs shadow-2xl backdrop-blur-md text-neutral-800 dark:text-neutral-200">
              <div className="flex items-center justify-between pb-2 font-medium text-neutral-800 dark:text-neutral-100 text-sm">
                <span>网址样式</span>
              </div>

              {/* Tabs */}
              <div className="mt-2 flex items-center gap-1.5">
                {(['common', 'icon', 'note'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setLayoutTab(tab)}
                    className={`rounded-full px-3 py-1 font-medium transition ${
                      layoutTab === tab
                        ? 'bg-[#ff6900] text-white shadow-sm'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {tab === 'common' && '通用'}
                    {tab === 'icon' && '图标'}
                    {tab === 'note' && '备注'}
                  </button>
                ))}
              </div>

              {/* Row 1: 显示图标 switch */}
              <div className="mt-4 border-t border-neutral-100 dark:border-neutral-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200 text-sm">显示图标</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings?.({
                        showBookmarkIcon: settings.showBookmarkIcon === false ? true : false,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      settings.showBookmarkIcon !== false ? 'bg-[#ff6900]' : 'bg-neutral-300 dark:bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                        settings.showBookmarkIcon !== false ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                  关闭后，书签图标不显示，只显示标题文字
                </p>
              </div>

              {/* Row 2: 网址列数 */}
              <div className="mt-3.5 border-t border-neutral-100 dark:border-neutral-800 pt-3">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200 text-sm">网址列数</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings?.({ columnMode: 'auto' })}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      settings.columnMode === 'auto'
                        ? 'bg-[#ff6900] text-white shadow-sm'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    自适应
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings?.({ columnMode: 'manual' })}
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      settings.columnMode !== 'auto'
                        ? 'bg-[#ff6900] text-white shadow-sm'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    手动设置
                  </button>

                  {settings.columnMode !== 'auto' && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings?.({
                            manualColumns: Math.max(3, (settings.manualColumns || 7) - 1),
                          })
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      >
                        -
                      </button>
                      <span className="w-4 text-center font-bold text-neutral-800 dark:text-neutral-200">
                        {settings.manualColumns || 7}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings?.({
                            manualColumns: Math.min(12, (settings.manualColumns || 7) + 1),
                          })
                        }
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: 卡片区宽度 */}
              <div className="mt-3.5 border-t border-neutral-100 dark:border-neutral-800 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-neutral-800 dark:text-neutral-100 text-sm">卡片区宽度</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                  </div>
                  <span className="font-mono text-[11px] font-bold text-orange-600 dark:text-orange-400">
                    {settings.cardWidth === 0 ? '100% 铺满' : `${settings.cardWidth ?? 1380}px`}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    { label: '紧凑', value: 1100 },
                    { label: '标准', value: 1380 },
                    { label: '宽屏', value: 1600 },
                    { label: '铺满', value: 0 },
                  ].map((preset) => {
                    const isSelected =
                      preset.value === 0
                        ? settings.cardWidth === 0
                        : (settings.cardWidth ?? 1380) === preset.value
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => onUpdateSettings?.({ cardWidth: preset.value })}
                        className={`rounded-full px-2.5 py-0.5 text-xs transition ${
                          isSelected
                            ? 'bg-[#ff6900] text-white shadow-sm font-medium'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                        }`}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
                <input
                  type="range"
                  min={800}
                  max={2200}
                  step={20}
                  value={settings.cardWidth === 0 ? 2200 : (settings.cardWidth ?? 1380)}
                  onChange={(e) => onUpdateSettings?.({ cardWidth: Number(e.target.value) })}
                  className="mt-2 w-full accent-orange-500 cursor-pointer"
                />
              </div>

              {/* Clear customization */}
              <div className="mt-4 pt-2.5 border-t border-neutral-100 dark:border-neutral-800 text-center">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings?.({
                      showBookmarkIcon: true,
                      columnMode: 'manual',
                      manualColumns: 7,
                      cardWidth: 1380,
                    })
                  }
                  className="text-[11px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 inline-flex items-center gap-1"
                >
                  <span>⊗ 清除自定义</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sort mode notification banner (matching reference screenshot #3) */}
      {isSortMode && (
        <div className="mt-2.5 flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100/80 dark:border-emerald-800/40 px-3 py-1.5 text-xs text-emerald-800 dark:text-emerald-300">
          <span>
            ✓ [已打开排序] 1、拖动书签即可排序；2、拖动书签到上方分类即可移动分类；
          </span>
          <button
            type="button"
            onClick={onToggleSortMode}
            className="font-medium text-emerald-700 dark:text-emerald-400 underline hover:text-emerald-900 dark:hover:text-emerald-200"
          >
            关闭并锁定排序
          </button>
        </div>
      )}

      {/* 7 Columns Bookmarks Grid */}
      <div className="pt-2">
        {bookmarks.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400">
            {isFavActive
              ? '暂无收藏网址，右键任意书签选择「设为收藏」即可添加！'
              : '该分类下暂无网址，点击上方「+ 添加」新增书签'}
          </div>
        ) : (
          <SortableContext
            items={bookmarks.map((b) => b.id)}
            strategy={rectSortingStrategy}
          >
            <div
              style={
                settings.columnMode !== 'auto'
                  ? {
                      display: 'grid',
                      gridTemplateColumns: `repeat(${settings.manualColumns || 7}, minmax(0, 1fr))`,
                    }
                  : undefined
              }
              className={
                settings.columnMode === 'auto'
                  ? 'grid grid-cols-2 gap-x-2 gap-y-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8'
                  : 'gap-x-2 gap-y-2.5'
              }
            >
              {bookmarks.map((bookmark) => (
                <BookmarkCardItem
                  key={bookmark.id}
                  bookmark={bookmark}
                  isSortMode={isSortMode}
                  settings={settings}
                  cachedIcon={cachedIcons?.[hostnameOf(bookmark.url)]}
                  isFailedDomain={failedDomains?.[hostnameOf(bookmark.url)]}
                  onSaveCachedIcon={onSaveCachedIcon}
                  onSaveFailedIcon={onSaveFailedIcon}
                  onContextMenu={(x, y) => onContextMenuBookmark(bookmark, x, y)}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>

      {/* Help Detail Modal */}
      {selectedHelp && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#18181b] border border-neutral-100 dark:border-neutral-800 p-5 shadow-2xl text-neutral-800 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <div className="flex items-center gap-2 font-semibold text-neutral-800 dark:text-neutral-100 text-sm">
                <Info className="h-4 w-4 text-orange-500" />
                <span>{selectedHelp.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHelp(null)}
                className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              {selectedHelp.content}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHelp(null)}
                className="rounded-xl bg-[#ff6900] px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#e05d00]"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Edit Category Modal */}
      {editingCategory && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-[#18181b] p-5 shadow-2xl border border-neutral-100 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
              <h3 className="font-semibold text-neutral-800 dark:text-neutral-100 text-sm">编辑分类</h3>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1.5">分类名称</label>
                <input
                  autoFocus
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#27272a] text-neutral-800 dark:text-neutral-100 px-3 py-2 text-xs outline-none focus:border-orange-500"
                  placeholder="输入分类名称"
                />
              </div>

              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1.5">对应展示颜色</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    '#3b82f6',
                    '#ec4899',
                    '#10b981',
                    '#f97316',
                    '#eab308',
                    '#8b5cf6',
                    '#ef4444',
                    '#06b6d4',
                  ].map((color) => {
                    const isSelected = editCatColor === color
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditCatColor(color)}
                        style={{ backgroundColor: color }}
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-white transition ${
                          isSelected ? 'ring-2 ring-offset-2 ring-neutral-400 scale-110 shadow-sm' : 'hover:scale-105'
                        }`}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 text-xs border-t border-neutral-100 dark:border-neutral-800 pt-3">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="rounded-xl px-3 py-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!editCatName.trim()}
                onClick={() => {
                  if (editCatName.trim() && onUpdateCategory) {
                    onUpdateCategory(editingCategory.id, {
                      name: editCatName.trim(),
                      color: editCatColor,
                    })
                  }
                  setEditingCategory(null)
                }}
                className="rounded-xl bg-[#ff6900] px-4 py-1.5 font-medium text-white shadow-sm hover:bg-[#e05d00] disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Delete Category Confirm Modal */}
      <ConfirmModal
        open={Boolean(deletingCat)}
        isDanger
        title="删除分类确认"
        message={`确定删除分类「${deletingCat?.name}」及其包含的全部网址吗？删除后不可撤销。`}
        confirmText="确认删除"
        onConfirm={() => {
          if (deletingCat) {
            onDeleteCategory(deletingCat.id)
          }
          setDeletingCat(null)
        }}
        onCancel={() => setDeletingCat(null)}
      />
      {/* Category Context Menu (Fixed via portal to document.body) */}
      {categoryContextMenu && createPortal(
        <div
          style={{
            left: `${Math.min(categoryContextMenu.x, window.innerWidth - 150)}px`,
            top: `${Math.min(categoryContextMenu.y, window.innerHeight - 130)}px`,
          }}
          className="fixed z-[9999] flex w-36 flex-col overflow-hidden rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white/95 dark:bg-[#18181b]/95 p-1 text-xs shadow-2xl backdrop-blur-md text-neutral-700 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-100"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setEditingCategory(categoryContextMenu.category)
              setEditCatName(categoryContextMenu.category.name)
              setEditCatColor(categoryContextMenu.category.color || '#3b82f6')
              setCategoryContextMenu(null)
            }}
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-neutral-700 dark:text-neutral-200 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
          >
            <Edit3 className="h-3.5 w-3.5 text-neutral-500" />
            <span>编辑分类</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenBookmarkStyle()
              setCategoryContextMenu(null)
            }}
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-neutral-700 dark:text-neutral-200 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
          >
            <Type className="h-3.5 w-3.5 text-neutral-500" />
            <span>排版与样式</span>
          </button>

          <div className="my-1 h-[1px] bg-neutral-100 dark:bg-neutral-800" />

          <button
            type="button"
            onClick={() => {
              setDeletingCat(categoryContextMenu.category)
              setCategoryContextMenu(null)
            }}
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            <span>删除分类</span>
          </button>
        </div>,
        document.body
      )}
    </section>
  )
}

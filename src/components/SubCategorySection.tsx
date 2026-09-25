import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Coffee,
  Compass,
  Edit3,
  FileText,
  Film,
  Folder,
  Gamepad2,
  HardDrive,
  Image as ImageIcon,
  Languages,
  Mail,
  PenTool,
  Plus,
  Search,
  Server,
  ShoppingCart,
  Trash2,
  Wrench,
} from 'lucide-react'
import {
  fetchFaviconBlob,
  getFaviconCandidates,
  hostnameOf,
  normalizeIconUrl,
  resolveTextColor,
} from '../lib/utils'
import { getBrandIcon } from '../lib/brandIcons'
import { ConfirmModal } from './ConfirmModal'
import type {
  Bookmark,
  Settings,
  SubCategory,
  SubSection,
} from '../types'

export function getSubIcon(icon: string, className = 'h-4 w-4') {
  switch (icon) {
    case 'mail':
    case 'email':
      return <Mail className={className} />
    case 'pen-tool':
    case 'draw':
      return <PenTool className={className} />
    case 'languages':
    case 'trans':
      return <Languages className={className} />
    case 'file-text':
    case 'doc':
      return <FileText className={className} />
    case 'hard-drive':
    case 'drive':
      return <HardDrive className={className} />
    case 'search':
      return <Search className={className} />
    case 'image':
      return <ImageIcon className={className} />
    case 'shopping-cart':
    case 'shopping':
      return <ShoppingCart className={className} />
    case 'compass':
    case 'travel':
      return <Compass className={className} />
    case 'gamepad':
    case 'games':
      return <Gamepad2 className={className} />
    case 'film':
    case 'video':
      return <Film className={className} />
    case 'server':
      return <Server className={className} />
    case 'wrench':
    case 'tools':
      return <Wrench className={className} />
    case 'coffee':
    case 'life':
      return <Coffee className={className} />
    default:
      return <Folder className={className} />
  }
}

function SubSectionTabItem({
  section,
  isActive,
  isSortMode,
  draggingId,
  onSelect,
  onContextMenu,
}: {
  section: SubSection
  isActive: boolean
  isSortMode?: boolean
  draggingId?: string | null
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `section:${section.id}`,
    disabled: !isSortMode,
  })

  const isDraggingThisType = Boolean(draggingId?.startsWith('section:'))
  const isDraggingOtherType = Boolean(draggingId && !isDraggingThisType)

  return (
   <button
     ref={setNodeRef}
     type="button"
     style={{
        transform: !isDragging && isDraggingThisType ? CSS.Translate.toString(transform) : undefined,
        transition: !isDragging && isDraggingThisType ? transition : undefined,
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 0 : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium select-none transition-colors duration-150 ${
        isActive
          ? 'bg-[#ff6900] text-white shadow-sm'
          : isOver && isDraggingOtherType
            ? 'bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 ring-2 ring-orange-500 scale-105 shadow-md'
            : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
      } ${
        isSortMode
          ? 'cursor-grab active:cursor-grabbing border border-dashed border-orange-300 dark:border-orange-700'
          : 'cursor-pointer'
      }`}
    >
      {getSubIcon(section.icon, 'h-3.5 w-3.5 pointer-events-none')}
      <span className="pointer-events-none">{section.name}</span>
    </button>
  )
}

function SubCategoryDropZone({
  subCategoryId,
  children,
}: {
  subCategoryId: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `subcat-drop:${subCategoryId}`,
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 p-3.5 min-w-0 transition-colors ${
        isOver
          ? 'bg-orange-50/50 dark:bg-orange-950/20 ring-2 ring-inset ring-orange-400/50 rounded-xl'
          : ''
      }`}
    >
      {children}
    </div>
  )
}

function SubCategoryTabItem({
  subCategory,
  isSelected,
  isSortMode,
  draggingId,
  onSelect,
  onContextMenu,
}: {
  subCategory: SubCategory
  isSelected: boolean
  isSortMode?: boolean
  draggingId?: string | null
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `subcat:${subCategory.id}`,
    disabled: !isSortMode,
  })

  const isDraggingThisType = Boolean(draggingId?.startsWith('subcat:'))
  const isDraggingOtherType = Boolean(draggingId && !isDraggingThisType)

  return (
   <button
     ref={setNodeRef}
     type="button"
     style={{
        transform: !isDragging && isDraggingThisType ? CSS.Translate.toString(transform) : undefined,
        transition: !isDragging && isDraggingThisType ? transition : undefined,
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 0 : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`group relative flex w-full flex-col items-center justify-center rounded-xl p-2 text-center select-none transition-colors duration-150 ${
        isDragging
          ? 'border border-dashed border-orange-400 bg-orange-50/40 dark:bg-orange-950/30'
          : isSelected
            ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-semibold ring-1 ring-orange-500/20'
            : isOver && isDraggingOtherType
              ? 'bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 ring-2 ring-orange-500 scale-105 shadow-md'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 hover:text-neutral-900 dark:hover:text-white'
      } ${
        isSortMode
          ? isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab active:cursor-grabbing border border-dashed border-orange-300 dark:border-orange-700'
          : 'cursor-pointer'
      }`}
    >
      {getSubIcon(subCategory.icon, 'h-4 w-4 mb-1 pointer-events-none')}
      <span className="text-[11px] leading-tight truncate w-full pointer-events-none">
        {subCategory.name}
      </span>
    </button>
  )
}

function SubBookmarkItem({
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
  isSortMode?: boolean
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
  const effectiveTextColor = resolveTextColor(settings)
  const iconShape = settings.iconShape ?? 'rounded'
  const brandIcon = getBrandIcon(bookmark.title, bookmark.url, iconShape, settings)
  const normalizedIconUrl = useMemo(
    () => normalizeIconUrl(bookmark.iconUrl),
    [bookmark.iconUrl],
  )
  const normalizedCachedIcon = useMemo(
    () => normalizeIconUrl(cachedIcon),
    [cachedIcon],
  )
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
        transform: !isDragging ? CSS.Transform.toString(transform) : undefined,
        transition: !isDragging ? transition : undefined,
        opacity: isDragging ? 0.25 : 1,
        zIndex: isDragging ? 0 : undefined,
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
      className={`group flex h-9 select-none items-center gap-2 px-2.5 transition ${itemRadius} ${
        isSortMode
          ? 'cursor-grab border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 active:cursor-grabbing'
          : 'cursor-pointer hover:bg-neutral-100/80 dark:hover:bg-neutral-800/80'
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

type Props = {
  subSections: SubSection[]
  subCategories: SubCategory[]
  activeSubSectionId: string
  activeSubCategoryId: string
  bookmarks: Bookmark[]
  cachedIcons?: Record<string, string>
  failedDomains?: Record<string, boolean>
  cardOpacity: number
  settings: Settings
  isSortMode?: boolean
  draggingId?: string | null
  onSaveCachedIcon?: (domain: string, dataOrBlob: string | Blob, objectUrl?: string) => void
  onSaveFailedIcon?: (domain: string) => void
  onSelectSubSection: (id: string) => void
  onSelectSubCategory: (id: string) => void
  onAddSubSection: (name: string, icon?: string) => void
  onRenameSubSection: (id: string, name: string) => void
  onDeleteSubSection: (id: string) => void
  onAddSubCategory: (sectionId: string, name: string) => void
  onRenameSubCategory: (id: string, name: string) => void
  onDeleteSubCategory: (id: string) => void
  onOpenAddBookmark: (subCategoryId?: string) => void
  onContextMenuBookmark: (bookmark: Bookmark, x: number, y: number) => void
}

export function SubCategorySection({
  subSections,
  subCategories,
  activeSubSectionId,
  activeSubCategoryId,
  bookmarks,
  cachedIcons,
  failedDomains,
  cardOpacity,
  settings,
  isSortMode,
  draggingId,
  onSaveCachedIcon,
  onSaveFailedIcon,
  onSelectSubSection,
  onSelectSubCategory,
  onAddSubSection,
  onRenameSubSection,
  onDeleteSubSection,
  onAddSubCategory,
  onRenameSubCategory,
  onDeleteSubCategory,
  onOpenAddBookmark,
  onContextMenuBookmark,
}: Props) {
  const cardRadius =
    settings.cornerRadius === 'none'
      ? 'rounded-none'
      : settings.cornerRadius === 'md'
        ? 'rounded-xl'
        : 'rounded-2xl'
  const isDark = settings.themeMode === 'dark'
  const cardBg = isDark
    ? `rgba(24, 24, 27, ${cardOpacity / 100})`
    : `rgba(255, 255, 255, ${cardOpacity / 100})`

  const [addingSection, setAddingSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [addingSubCat, setAddingSubCat] = useState(false)
  const [newSubCatName, setNewSubCatName] = useState('')
  const [subContextMenu, setSubContextMenu] = useState<{
    type: 'section' | 'subcat'
    id: string
    name: string
    x: number
    y: number
  } | null>(null)
  const [renamingItem, setRenamingItem] = useState<{
    type: 'section' | 'subcat'
    id: string
    name: string
  } | null>(null)
  const [deletingItem, setDeletingItem] = useState<{
    type: 'section' | 'subcat'
    id: string
    name: string
  } | null>(null)
  const subMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (subMenuRef.current && !subMenuRef.current.contains(e.target as Node)) {
        setSubContextMenu(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSubContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const currentSection =
    subSections.find((s) => s.id === activeSubSectionId) || subSections[0]
  const currentSectionId = currentSection?.id || ''

  const currentSubCategories = useMemo(
    () =>
      subCategories
        .filter((sc) => sc.sectionId === currentSectionId)
        .sort((a, b) => a.order - b.order),
    [subCategories, currentSectionId],
  )

  const effectiveSubCat =
    currentSubCategories.find((sc) => sc.id === activeSubCategoryId) ||
    currentSubCategories[0]
  const effectiveSubCatId = effectiveSubCat?.id || ''

  const currentSubBookmarks = useMemo(
    () => bookmarks.filter((b) => b.subCategoryId === effectiveSubCatId),
    [bookmarks, effectiveSubCatId],
  )

  return (
    <div
      className={`flex-1 min-w-0 w-full flex flex-col overflow-hidden border border-neutral-100/90 dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md text-neutral-800 dark:text-neutral-100 ${cardRadius}`}
      style={{ backgroundColor: cardBg }}
    >
      {/* Top Section Tabs Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
          <SortableContext
            items={subSections.map((sec) => `section:${sec.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {subSections.map((sec) => (
              <SubSectionTabItem
                key={sec.id}
                section={sec}
                isActive={sec.id === currentSectionId}
                isSortMode={isSortMode}
                draggingId={draggingId}
                onSelect={() => onSelectSubSection(sec.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSubContextMenu({
                    type: 'section',
                    id: sec.id,
                    name: sec.name,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }}
              />
            ))}
          </SortableContext>

          {addingSection ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (newSectionName.trim()) onAddSubSection(newSectionName)
                setNewSectionName('')
                setAddingSection(false)
              }}
              className="flex items-center"
            >
              <input
                autoFocus
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onBlur={() => {
                  setNewSectionName('')
                  setAddingSection(false)
                }}
                placeholder="新版块"
                className="w-20 rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs outline-none focus:border-orange-500"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingSection(true)}
              title="添加新版块"
              className="rounded-full px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              +
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpenAddBookmark(effectiveSubCatId)}
            className="flex items-center gap-1 rounded-lg bg-[#ff6900] px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-[#e05d00] transition"
          >
            <Plus className="h-3 w-3" />
            <span>添加</span>
          </button>
        </div>
      </div>

      {/* Content Area: Left Vertical Sidebar + Right 4-Column Bookmarks */}
      <div className="flex min-h-[300px]">
        {/* Left Subcategory Vertical Sidebar */}
        <div className="w-[76px] flex-shrink-0 border-r border-neutral-100 dark:border-neutral-800 p-2 flex flex-col gap-1.5 bg-neutral-50/40 dark:bg-black/10">
          <SortableContext
            items={currentSubCategories.map((sc) => `subcat:${sc.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {currentSubCategories.map((sc) => (
              <SubCategoryTabItem
                key={sc.id}
                subCategory={sc}
                isSelected={sc.id === effectiveSubCatId}
                isSortMode={isSortMode}
                draggingId={draggingId}
                onSelect={() => onSelectSubCategory(sc.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setSubContextMenu({
                    type: 'subcat',
                    id: sc.id,
                    name: sc.name,
                    x: e.clientX,
                    y: e.clientY,
                  })
                }}
              />
            ))}
          </SortableContext>

          {addingSubCat ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (newSubCatName.trim() && currentSectionId) {
                  onAddSubCategory(currentSectionId, newSubCatName)
                }
                setNewSubCatName('')
                setAddingSubCat(false)
              }}
              className="p-1"
            >
              <input
                autoFocus
                value={newSubCatName}
                onChange={(e) => setNewSubCatName(e.target.value)}
                onBlur={() => {
                  setNewSubCatName('')
                  setAddingSubCat(false)
                }}
                placeholder="名称"
                className="w-full rounded border border-neutral-300 px-1 py-0.5 text-[10px] outline-none focus:border-orange-500 text-center"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingSubCat(true)}
              title="添加子分类"
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700 p-2 text-neutral-400 hover:border-orange-400 hover:text-orange-500 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="text-[10px] mt-0.5">新增</span>
            </button>
          )}
        </div>

       {/* Right Bookmarks 4-Column Grid Area */}
        <SubCategoryDropZone subCategoryId={effectiveSubCatId}>
          {currentSubBookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-neutral-400">
              <Folder className="h-8 w-8 text-neutral-300 dark:text-neutral-600 mb-2 stroke-[1.5]" />
              <span>该分类下暂无网址，点击上方「+ 添加」新增书签，或从上方拖拽书签移入</span>
            </div>
          ) : (
            <SortableContext
              items={currentSubBookmarks.map((b) => b.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-2.5">
                {currentSubBookmarks.map((bookmark) => (
                  <SubBookmarkItem
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
        </SubCategoryDropZone>
      </div>

      {/* Sub-item Context Menu (Section or SubCategory) */}
      {subContextMenu && createPortal(
        <div
          ref={subMenuRef}
          style={{
            left: `${Math.min(subContextMenu.x, window.innerWidth - 150)}px`,
            top: `${Math.min(subContextMenu.y, window.innerHeight - 130)}px`,
          }}
          className="fixed z-[9999] flex w-36 flex-col overflow-hidden rounded-2xl border border-neutral-100 dark:border-neutral-800 bg-white/95 dark:bg-[#18181b]/95 p-1 text-xs shadow-2xl backdrop-blur-md text-neutral-700 dark:text-neutral-200 animate-in fade-in zoom-in-95 duration-100"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setRenamingItem({
                type: subContextMenu.type,
                id: subContextMenu.id,
                name: subContextMenu.name,
              })
              setSubContextMenu(null)
            }}
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Edit3 className="h-3.5 w-3.5 text-neutral-500" />
            <span>重命名</span>
          </button>
          <div className="my-1 h-[1px] bg-neutral-100 dark:bg-neutral-800" />
          <button
            type="button"
            onClick={() => {
              setDeletingItem({
                type: subContextMenu.type,
                id: subContextMenu.id,
                name: subContextMenu.name,
              })
              setSubContextMenu(null)
            }}
            className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            <span>删除</span>
          </button>
        </div>,
        document.body
      )}

      {/* Rename Modal */}
      {renamingItem && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-white dark:bg-[#18181b] p-5 shadow-2xl border border-neutral-100 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200">
            <h3 className="font-semibold text-sm mb-3">
              重命名{renamingItem.type === 'section' ? '版块' : '子分类'}
            </h3>
            <input
              autoFocus
              value={renamingItem.name}
              onChange={(e) => setRenamingItem({ ...renamingItem, name: e.target.value })}
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#27272a] text-neutral-800 dark:text-neutral-100 px-3 py-2 text-xs outline-none focus:border-orange-500"
            />
            <div className="mt-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setRenamingItem(null)}
                className="rounded-xl px-3 py-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!renamingItem.name.trim()}
                onClick={() => {
                  if (renamingItem.name.trim()) {
                    if (renamingItem.type === 'section') {
                      onRenameSubSection(renamingItem.id, renamingItem.name.trim())
                    } else {
                      onRenameSubCategory(renamingItem.id, renamingItem.name.trim())
                    }
                  }
                  setRenamingItem(null)
                }}
                className="rounded-xl bg-[#ff6900] px-4 py-1.5 font-medium text-white shadow-sm hover:bg-[#e05d00] disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        open={Boolean(deletingItem)}
        isDanger
        title={`删除${deletingItem?.type === 'section' ? '版块' : '子分类'}确认`}
        message={`确定删除「${deletingItem?.name}」及其下的所有网址吗？此操作不可逆。`}
        confirmText="确认删除"
        onConfirm={() => {
          if (deletingItem) {
            if (deletingItem.type === 'section') {
              onDeleteSubSection(deletingItem.id)
            } else {
              onDeleteSubCategory(deletingItem.id)
            }
          }
          setDeletingItem(null)
        }}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  )
}

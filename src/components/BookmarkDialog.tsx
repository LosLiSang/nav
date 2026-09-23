import { createPortal } from 'react-dom'
import { useRef, useState } from 'react'
import { Camera, Check, ChevronDown, Edit3, Folder, Loader2, Shield, X } from 'lucide-react'
import { normalizeIconUrl, normalizeUrl } from '../lib/utils'
import { IconPickerModal } from './IconPickerModal'
import type { Bookmark, Category, SubCategory } from '../types'

type Props = {
  bookmark?: Bookmark | null
  categories: Category[]
  subCategories?: SubCategory[]
  defaultCategoryId?: string
  defaultSubCategoryId?: string
  onCancel: () => void
  onSubmit: (values: {
    categoryId?: string
    subCategoryId?: string
    title: string
    url: string
    iconUrl?: string
  }) => Promise<void>
}

export function BookmarkDialog({
  bookmark,
  categories,
  subCategories = [],
  defaultCategoryId,
  defaultSubCategoryId,
  onCancel,
  onSubmit,
}: Props) {
  const isSubTarget = Boolean(bookmark?.subCategoryId || defaultSubCategoryId)
  const [targetType, setTargetType] = useState<'main' | 'sub'>(isSubTarget ? 'sub' : 'main')
  const [title, setTitle] = useState(bookmark?.title ?? '')
  const [url, setUrl] = useState(bookmark?.url ?? '')
  const [categoryId, setCategoryId] = useState(
    bookmark?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? '',
  )
  const [subCategoryId, setSubCategoryId] = useState(
    bookmark?.subCategoryId ?? defaultSubCategoryId ?? subCategories[0]?.id ?? '',
  )
  const [iconUrl, setIconUrl] = useState(bookmark?.iconUrl ?? '')
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [showCategorySelect, setShowCategorySelect] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const [fetchingTitle, setFetchingTitle] = useState(false)
  const [saving, setSaving] = useState(false)
  const urlInputRef = useRef<HTMLInputElement>(null)

  const currentCategory =
    targetType === 'main'
      ? categories.find((c) => c.id === categoryId) || categories[0] || { name: '主分类' }
      : subCategories.find((sc) => sc.id === subCategoryId) || subCategories[0] || { name: '二级分类' }

  async function handleFetchTitle() {
    const rawUrl = url.trim()
    if (!rawUrl) return
    setFetchingTitle(true)
    try {
      const normalized = normalizeUrl(rawUrl)
      const res = await fetch(`/api/fetch-title?url=${encodeURIComponent(normalized)}`)
      const data = await res.json()
      if (data.title) {
        setTitle(data.title.slice(0, 100))
      }
    } catch {
      // ignore fetch failure
    } finally {
      setFetchingTitle(false)
    }
  }

  async function handleSubmit(keepOpen = false) {
    const trimmedTitle = title.trim()
    const trimmedUrl = url.trim()
    if (!trimmedTitle || !trimmedUrl) return
    setSaving(true)
    try {
      await onSubmit({
        title: trimmedTitle,
        url: normalizeUrl(trimmedUrl),
        categoryId: targetType === 'main' ? categoryId : undefined,
        subCategoryId: targetType === 'sub' ? subCategoryId : undefined,
        // 顺手清掉旧版选择器留下的双重编码，让数据在编辑时逐步自愈
        iconUrl: normalizeIconUrl(iconUrl.trim()) || undefined,
      })
      if (keepOpen) {
        setTitle('')
        setUrl('')
        setIconUrl('')
        setNote('')
        urlInputRef.current?.focus()
      } else {
        onCancel()
      }
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
            {bookmark ? '编辑网址' : '添加网址'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit(false)
          }}
          className="mt-5 space-y-4 text-xs text-neutral-700 dark:text-neutral-200"
        >
          {/* Row 1: Website Address + 抓取标题 Button */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={urlInputRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="网站地址，如：https://www.baidu.com/"
                required
                className="w-full rounded-xl border border-orange-500 px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
            <button
              type="button"
              onClick={handleFetchTitle}
              disabled={fetchingTitle || !url.trim()}
              className="flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2.5 font-medium text-neutral-700 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {fetchingTitle && <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />}
              <span>{fetchingTitle ? '抓取中...' : '抓取标题'}</span>
            </button>
          </div>

          {/* Row 2: Camera icon + Website Name + 0/100 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowIconPicker(true)}
              title="从图标库选择或自定义图标"
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition ${
                iconUrl
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                  : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600 dark:hover:text-neutral-300'
              }`}
            >
              {iconUrl ? (
                <img src={normalizeIconUrl(iconUrl)} alt="" className="h-5 w-5 object-contain rounded" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </button>

            <div className="relative flex-1">
              <input
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="网站名称"
                required
                className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2.5 pr-14 text-xs outline-none focus:border-orange-500"
              />
              <span className="absolute right-3 top-3 text-[11px] text-neutral-300">
                {title.length}/100
              </span>
            </div>
          </div>

          {/* Row 3: Add Note (Left) & Category Switcher (Right) */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowNote((prev) => !prev)}
              className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>{showNote ? '收起备注' : '添加备注'}</span>
            </button>

            <div className="relative flex items-center gap-1 text-neutral-600 dark:text-neutral-300">
              <Folder className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {targetType === 'main' ? `主分类 · ${currentCategory.name}` : `二级分类 · ${currentCategory.name}`}
              </span>
              <button
                type="button"
                onClick={() => setShowCategorySelect((prev) => !prev)}
                className="text-orange-500 hover:text-orange-600 font-medium ml-1"
              >
                切换
              </button>
            </div>
          </div>

          {/* Category Dropdown (if 切换 clicked) */}
          {showCategorySelect && (
            <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-800/50 p-3 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-200/60 dark:border-neutral-700 text-[11px] text-neutral-500 dark:text-neutral-400">
                <span>选择归属分类：</span>
                <button
                  type="button"
                  onClick={() => setShowCategorySelect(false)}
                  className="hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Main vs Sub category tab switch */}
              {subCategories.length > 0 && (
                <div className="flex rounded-xl bg-neutral-200/60 dark:bg-neutral-800 p-0.5 text-xs mb-2.5">
                  <button
                    type="button"
                    onClick={() => setTargetType('main')}
                    className={`flex-1 rounded-lg py-1 text-center font-medium transition ${
                      targetType === 'main'
                        ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    主分类 ({categories.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('sub')}
                    className={`flex-1 rounded-lg py-1 text-center font-medium transition ${
                      targetType === 'sub'
                        ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    二级多级分类 ({subCategories.length})
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {targetType === 'main'
                  ? categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCategoryId(c.id)
                          setShowCategorySelect(false)
                        }}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          c.id === categoryId
                            ? 'bg-orange-500 text-white shadow-sm ring-2 ring-orange-500/20'
                            : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:border-neutral-300'
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${c.id === categoryId ? 'bg-white dark:bg-neutral-900' : ''}`}
                          style={c.id !== categoryId ? { backgroundColor: c.color } : undefined}
                        />
                        <span>{c.name}</span>
                        {c.id === categoryId && <Check className="h-3 w-3 ml-0.5 stroke-[3]" />}
                      </button>
                    ))
                  : subCategories.map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => {
                          setSubCategoryId(sc.id)
                          setShowCategorySelect(false)
                        }}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          sc.id === subCategoryId
                            ? 'bg-orange-500 text-white shadow-sm ring-2 ring-orange-500/20'
                            : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:border-neutral-300'
                        }`}
                      >
                        <span>{sc.name}</span>
                        {sc.id === subCategoryId && <Check className="h-3 w-3 ml-0.5 stroke-[3]" />}
                      </button>
                    ))}
              </div>
            </div>
          )}

          {/* Note Input (if opened) */}
          {showNote && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="添加书签描述或备注..."
              className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 text-xs outline-none focus:border-orange-500"
            />
          )}

          {/* Row 4: Privacy Settings (Left) & Action Buttons (Right) */}
          <div className="flex items-center justify-between border-t border-neutral-100 dark:border-neutral-800 pt-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPrivacy((prev) => !prev)}
                className="flex items-center gap-1 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white"
              >
                <Shield className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
                <span>隐私设置</span>
                <ChevronDown className="h-3 w-3" />
              </button>

              {showPrivacy && (
                <div className="absolute left-0 top-7 z-20 w-44 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2.5 shadow-xl">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="rounded text-orange-500"
                    />
                    <span className="text-neutral-700 dark:text-neutral-200">仅自己可见</span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {!bookmark && (
                <button
                  type="button"
                  disabled={saving || !title.trim() || !url.trim()}
                  onClick={() => void handleSubmit(true)}
                  className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2 font-medium text-neutral-700 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
                >
                  保存并继续添加
                </button>
              )}
              <button
                type="submit"
                disabled={saving || !title.trim() || !url.trim()}
                className="rounded-xl bg-[#ff6900] px-6 py-2 font-medium text-white shadow-sm transition hover:bg-[#e05d00] disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Icon Library Picker Modal */}
      {showIconPicker && (
        <IconPickerModal
          currentIconUrl={normalizeIconUrl(iconUrl)}
          onSelectIcon={(url) => setIconUrl(url)}
          onClose={() => setShowIconPicker(false)}
        />
      )}
    </div>
  , document.body)
}

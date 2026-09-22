import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { db } from '../lib/db'
import {
  DEFAULT_SETTINGS,
  SEARCH_ENGINES,
  defaultBookmarks,
  defaultCategories,
  defaultMemos,
  defaultSubCategories,
  defaultSubSections,
  defaultTotpAccounts,
} from '../lib/defaults'
import type {
  Bookmark,
  Category,
  MemoItem,
  NavData,
  Settings,
  SubCategory,
  SubSection,
  TotpItem,
} from '../types'

type NavState = {
  ready: boolean
  categories: Category[]
  subSections: SubSection[]
  subCategories: SubCategory[]
  bookmarks: Bookmark[]
  memos: MemoItem[]
  totpAccounts: TotpItem[]
  settings: Settings
  searchQuery: string
  cachedIcons: Record<string, string>

  initialize: () => Promise<void>
  setActiveCategory: (categoryId: string) => void
  setActiveSearchEngine: (engineId: string) => void
  setActiveSubSection: (sectionId: string) => void
  setActiveSubCategory: (subCategoryId: string) => void
  setActiveWidgetTab: (tab: Settings['activeWidgetTab']) => void
  setSearchQuery: (query: string) => void
  updateSettings: (values: Partial<Settings>) => void
  toggleSortMode: () => void
  dismissNotice: () => void
  toggleFavorite: (bookmarkId: string) => Promise<void>

  // Categories
  addCategory: (name: string) => Promise<void>
  renameCategory: (categoryId: string, name: string) => Promise<void>
  updateCategory: (categoryId: string, updates: Partial<Omit<Category, 'id'>>) => Promise<void>
  deleteCategory: (categoryId: string) => Promise<void>

  // Sub Categories
  addSubCategory: (sectionId: string, name: string) => Promise<void>
  deleteSubCategory: (subCategoryId: string) => Promise<void>

  // Bookmarks
  addBookmark: (values: {
    categoryId?: string
    subCategoryId?: string
    title: string
    url: string
    iconUrl?: string
  }) => Promise<void>
  updateBookmark: (bookmarkId: string, values: Partial<Omit<Bookmark, 'id'>>) => Promise<void>
  deleteBookmark: (bookmarkId: string) => Promise<void>
  reorderBookmark: (bookmarkId: string, overBookmarkId: string) => Promise<void>
  moveBookmarkToCategory: (bookmarkId: string, categoryId: string) => Promise<void>
  saveCachedIcon: (domain: string, dataUrl: string) => Promise<void>
  refreshIcon: (domain: string) => Promise<void>
  refreshAllIcons: () => Promise<void>

  // Memos
  addMemo: (text: string) => Promise<void>
  toggleMemo: (id: string) => Promise<void>
  deleteMemo: (id: string) => Promise<void>

  // TOTP
  addTotpAccount: (name: string, secret: string, issuer?: string) => Promise<void>
  deleteTotpAccount: (id: string) => Promise<void>

  // Backup & Restore
  exportBackup: () => Promise<NavData>
  importBackup: (data: Partial<NavData>) => Promise<void>
  resetToDefaults: () => Promise<void>
}

const SETTINGS_KEY = 'app'
let initializationPromise: Promise<void> | null = null
let pendingIconBatch: Record<string, string> = {}
let iconBatchTimer: ReturnType<typeof setTimeout> | null = null

function flushIconBatch(set: any) {
  const batch = { ...pendingIconBatch }
  pendingIconBatch = {}
  iconBatchTimer = null
  const entries = Object.entries(batch)
  if (entries.length === 0) return

  const rows = entries.map(([domain, dataUrl]) => ({
    domain,
    dataUrl,
    updatedAt: Date.now(),
  }))
  void db.iconCache.bulkPut(rows)

  set((state: any) => ({
    cachedIcons: { ...state.cachedIcons, ...batch },
  }))
}

async function saveSettings(value: Settings): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value })
}

export const useNavStore = create<NavState>((set, get) => ({
  ready: false,
  categories: [],
  subSections: [],
  subCategories: [],
  bookmarks: [],
  memos: [],
  totpAccounts: [],
  settings: DEFAULT_SETTINGS,
  searchQuery: '',
  cachedIcons: {},

  initialize() {
    if (get().ready) return Promise.resolve()

    if (!initializationPromise) {
      initializationPromise = (async () => {
        const [
          categories,
          subSections,
          subCategories,
          bookmarks,
          memos,
          totpAccounts,
          settingRecord,
          cachedIconRows,
        ] = await Promise.all([
          db.categories.toArray().catch(() => []),
          db.subSections.toArray().catch(() => []),
          db.subCategories.toArray().catch(() => []),
          db.bookmarks.toArray().catch(() => []),
          db.memos.toArray().catch(() => []),
          db.totpAccounts.toArray().catch(() => []),
          db.settings.get(SETTINGS_KEY).catch(() => undefined),
          db.iconCache.toArray().catch(() => []),
        ])

        const nextCachedIcons: Record<string, string> = {}
        for (const row of cachedIconRows) {
          nextCachedIcons[row.domain] = row.dataUrl
        }

        let nextCategories = categories
        let nextSubSections = subSections
        let nextSubCategories = subCategories
        let nextBookmarks = bookmarks
        let nextMemos = memos
        let nextTotpAccounts = totpAccounts

        let nextSettings: Settings = {
          ...DEFAULT_SETTINGS,
          ...(settingRecord?.value ?? {}),
          wallpaperUrl:
            settingRecord?.value?.wallpaperUrl || DEFAULT_SETTINGS.wallpaperUrl,
          activeSubSectionId:
            settingRecord?.value?.activeSubSectionId || DEFAULT_SETTINGS.activeSubSectionId,
          activeSubCategoryId:
            settingRecord?.value?.activeSubCategoryId || DEFAULT_SETTINGS.activeSubCategoryId,
          cornerRadius:
            settingRecord?.value?.cornerRadius ?? DEFAULT_SETTINGS.cornerRadius,
          iconShape:
            settingRecord?.value?.iconShape ?? DEFAULT_SETTINGS.iconShape,
          fontSize:
            settingRecord?.value?.fontSize ?? DEFAULT_SETTINGS.fontSize,
          isBold:
            settingRecord?.value?.isBold ?? DEFAULT_SETTINGS.isBold,
          isItalic:
            settingRecord?.value?.isItalic ?? DEFAULT_SETTINGS.isItalic,
          textColor:
            settingRecord?.value?.textColor ?? DEFAULT_SETTINGS.textColor,
        }

        // Ensure active category is valid and prefer 'cat-prod' if valid
        const categoryExists = nextCategories.some(
          (c) => c.id === nextSettings.activeCategoryId,
        )
        if (!categoryExists || nextSettings.activeCategoryId === 'cat-nocase') {
          nextSettings.activeCategoryId = 'cat-prod'
        }

        // If empty database, populate full default seed
        if (nextCategories.length === 0 && nextBookmarks.length === 0) {
          nextCategories = defaultCategories()
          nextSubSections = defaultSubSections()
          nextSubCategories = defaultSubCategories()
          nextBookmarks = defaultBookmarks()
          nextMemos = defaultMemos()
          nextTotpAccounts = defaultTotpAccounts()

          await Promise.all([
            db.categories.bulkAdd(nextCategories),
            db.subSections.bulkAdd(nextSubSections),
            db.subCategories.bulkAdd(nextSubCategories),
            db.bookmarks.bulkAdd(nextBookmarks),
            db.memos.bulkAdd(nextMemos),
            db.totpAccounts.bulkAdd(nextTotpAccounts),
          ])
        }

        await saveSettings(nextSettings)
        set({
          ready: true,
          categories: [...nextCategories].sort((a, b) => a.order - b.order),
          subSections: [...nextSubSections].sort((a, b) => a.order - b.order),
          subCategories: [...nextSubCategories].sort((a, b) => a.order - b.order),
          bookmarks: [...nextBookmarks].sort((a, b) => a.order - b.order),
          memos: [...nextMemos].sort((a, b) => b.createdAt - a.createdAt),
          totpAccounts: [...nextTotpAccounts].sort((a, b) => a.createdAt - b.createdAt),
          settings: nextSettings,
          cachedIcons: nextCachedIcons,
        })
      })().catch((error) => {
        initializationPromise = null
        throw error
      })
    }

    return initializationPromise
  },

  setActiveCategory(categoryId) {
    get().updateSettings({ activeCategoryId: categoryId })
  },

  setActiveSearchEngine(engineId) {
    get().updateSettings({ activeSearchEngineId: engineId })
  },

  setActiveSubSection(sectionId) {
    const subCats = get().subCategories.filter((sc) => sc.sectionId === sectionId)
    get().updateSettings({
      activeSubSectionId: sectionId,
      activeSubCategoryId: subCats[0]?.id ?? get().settings.activeSubCategoryId,
    })
  },

  setActiveSubCategory(subCategoryId) {
    get().updateSettings({ activeSubCategoryId: subCategoryId })
  },

  setActiveWidgetTab(tab) {
    get().updateSettings({ activeWidgetTab: tab })
  },

  setSearchQuery(query) {
    set({ searchQuery: query })
  },

  updateSettings(values) {
    const settings = { ...get().settings, ...values }
    set({ settings })
    void saveSettings(settings)
  },

  toggleSortMode() {
    const next = !get().settings.isSortMode
    get().updateSettings({ isSortMode: next })
  },

  dismissNotice() {
    get().updateSettings({ showNotice: false })
  },

  async addCategory(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const categories = get().categories
    const colors = ['#3b82f6', '#ec4899', '#10b981', '#22c55e', '#f43f5e', '#f97316', '#eab308']
    const category: Category = {
      id: crypto.randomUUID(),
      name: trimmed,
      color: colors[categories.length % colors.length],
      order: categories.length,
    }
    await db.categories.add(category)
    set({ categories: [...categories, category] })
    get().updateSettings({ activeCategoryId: category.id })
  },

  async renameCategory(categoryId, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.categories.update(categoryId, { name: trimmed })
    set((state) => ({
      categories: state.categories.map((category) =>
        category.id === categoryId ? { ...category, name: trimmed } : category,
      ),
    }))
  },

  async updateCategory(categoryId, updates) {
    await db.categories.update(categoryId, updates)
    set((state) => ({
      categories: state.categories.map((c) =>
        c.id === categoryId ? { ...c, ...updates } : c,
      ),
    }))
  },

  async deleteCategory(categoryId) {
    const bookmarks = get().bookmarks.filter((bookmark) => bookmark.categoryId === categoryId)
    await Promise.all([
      db.categories.delete(categoryId),
      db.bookmarks.bulkDelete(bookmarks.map((bookmark) => bookmark.id)),
    ])
    set((state) => ({
      categories: state.categories.filter((category) => category.id !== categoryId),
      bookmarks: state.bookmarks.filter((bookmark) => bookmark.categoryId !== categoryId),
      settings: {
        ...state.settings,
        activeCategoryId:
          state.settings.activeCategoryId === categoryId
            ? state.categories[0]?.id ?? ''
            : state.settings.activeCategoryId,
      },
    }))
  },

  async addSubCategory(sectionId, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const subCategories = get().subCategories
    const newSub: SubCategory = {
      id: crypto.randomUUID(),
      sectionId,
      name: trimmed,
      icon: 'folder',
      order: subCategories.length,
    }
    await db.subCategories.add(newSub)
    set({ subCategories: [...subCategories, newSub] })
    get().updateSettings({ activeSubCategoryId: newSub.id })
  },

  async deleteSubCategory(subCategoryId) {
    const bookmarks = get().bookmarks.filter((b) => b.subCategoryId === subCategoryId)
    await Promise.all([
      db.subCategories.delete(subCategoryId),
      db.bookmarks.bulkDelete(bookmarks.map((b) => b.id)),
    ])
    set((state) => ({
      subCategories: state.subCategories.filter((sc) => sc.id !== subCategoryId),
      bookmarks: state.bookmarks.filter((b) => b.subCategoryId !== subCategoryId),
    }))
  },

  async addBookmark(values) {
    const now = Date.now()
    const relevant = get().bookmarks.filter((b) =>
      values.categoryId ? b.categoryId === values.categoryId : b.subCategoryId === values.subCategoryId,
    )
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      categoryId: values.categoryId,
      subCategoryId: values.subCategoryId,
      title: values.title.trim() || '未命名',
      url: values.url.trim(),
      iconUrl: values.iconUrl?.trim() || undefined,
      order: relevant.length,
      createdAt: now,
      updatedAt: now,
    }
    await db.bookmarks.add(bookmark)
    set((state) => ({ bookmarks: [...state.bookmarks, bookmark] }))
  },

  async updateBookmark(bookmarkId, values) {
    const current = get().bookmarks.find((bookmark) => bookmark.id === bookmarkId)
    if (!current) return
    const updated: Bookmark = {
      ...current,
      ...values,
      title: values.title?.trim() || current.title,
      url: values.url?.trim() || current.url,
      updatedAt: Date.now(),
    }
    await db.bookmarks.put(updated)
    set((state) => ({
      bookmarks: state.bookmarks.map((bookmark) =>
        bookmark.id === bookmarkId ? updated : bookmark,
      ),
    }))
  },

  async deleteBookmark(bookmarkId) {
    await db.bookmarks.delete(bookmarkId)
    set((state) => ({
      bookmarks: state.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId),
    }))
  },

  async reorderBookmark(bookmarkId, overBookmarkId) {
    const { bookmarks } = get()
    const active = bookmarks.find((bookmark) => bookmark.id === bookmarkId)
    const over = bookmarks.find((bookmark) => bookmark.id === overBookmarkId)
    if (!active || !over || active.id === over.id) return

    const sameCategory = active.categoryId && active.categoryId === over.categoryId
    const visibleIds = bookmarks
      .filter((bookmark) => bookmark.categoryId === over.categoryId)
      .sort((a, b) => a.order - b.order)
      .map((bookmark) => bookmark.id)

    const orderedIds = sameCategory
      ? arrayMove(visibleIds, visibleIds.indexOf(active.id), visibleIds.indexOf(over.id))
      : [...visibleIds, active.id]

    const nextBookmarks = bookmarks.map((bookmark) => {
      const order = orderedIds.indexOf(bookmark.id)
      if (bookmark.id === active.id && !sameCategory) {
        return { ...bookmark, categoryId: over.categoryId, order, updatedAt: Date.now() }
      }
      return order >= 0 ? { ...bookmark, order, updatedAt: Date.now() } : bookmark
    })

    await db.bookmarks.bulkPut(
      nextBookmarks.filter((bookmark) => orderedIds.includes(bookmark.id)),
    )
    set({ bookmarks: nextBookmarks })
  },

  async moveBookmarkToCategory(bookmarkId, categoryId) {
    const { bookmarks } = get()
    const active = bookmarks.find((bookmark) => bookmark.id === bookmarkId)
    if (!active || active.categoryId === categoryId) return
    const categoryBookmarks = bookmarks.filter((bookmark) => bookmark.categoryId === categoryId)
    const updated: Bookmark = {
      ...active,
      categoryId,
      order: categoryBookmarks.length,
      updatedAt: Date.now(),
    }
    await db.bookmarks.put(updated)
    set((state) => ({
      bookmarks: state.bookmarks.map((bookmark) =>
        bookmark.id === updated.id ? updated : bookmark,
      ),
    }))
  },

  async toggleFavorite(bookmarkId) {
    const { bookmarks } = get()
    const current = bookmarks.find((b) => b.id === bookmarkId)
    if (!current) return
    const updated = { ...current, isFavorite: !current.isFavorite }
    await db.bookmarks.put(updated)
    set((state) => ({
      bookmarks: state.bookmarks.map((b) => (b.id === bookmarkId ? updated : b)),
    }))
  },

  saveCachedIcon(domain, dataUrl) {
    if (!domain || !dataUrl) return Promise.resolve()
    pendingIconBatch[domain] = dataUrl
    if (!iconBatchTimer) {
      iconBatchTimer = setTimeout(() => flushIconBatch(set), 300)
    }
    return Promise.resolve()
  },

  async refreshIcon(domain) {
    if (!domain) return
    await db.iconCache.delete(domain)
    set((state) => {
      const next = { ...state.cachedIcons }
      delete next[domain]
      return { cachedIcons: next }
    })
  },

  async refreshAllIcons() {
    await db.iconCache.clear()
    set({ cachedIcons: {} })
  },

  async addMemo(text) {
    const trimmed = text.trim()
    if (!trimmed) return
    const memo: MemoItem = {
      id: crypto.randomUUID(),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
    }
    await db.memos.add(memo)
    set((state) => ({ memos: [memo, ...state.memos] }))
  },

  async toggleMemo(id) {
    const memo = get().memos.find((m) => m.id === id)
    if (!memo) return
    const updated = { ...memo, done: !memo.done }
    await db.memos.put(updated)
    set((state) => ({
      memos: state.memos.map((m) => (m.id === id ? updated : m)),
    }))
  },

  async deleteMemo(id) {
    await db.memos.delete(id)
    set((state) => ({ memos: state.memos.filter((m) => m.id !== id) }))
  },

  async addTotpAccount(name, secret, issuer) {
    const account: TotpItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      secret: secret.trim().toUpperCase(),
      issuer: issuer?.trim() || undefined,
      createdAt: Date.now(),
    }
    await db.totpAccounts.add(account)
    set((state) => ({ totpAccounts: [...state.totpAccounts, account] }))
  },

  async deleteTotpAccount(id) {
    await db.totpAccounts.delete(id)
    set((state) => ({ totpAccounts: state.totpAccounts.filter((a) => a.id !== id) }))
  },

  async exportBackup() {
    const { categories, subSections, subCategories, bookmarks, memos, totpAccounts, settings } =
      get()
    return {
      categories,
      subSections,
      subCategories,
      bookmarks,
      memos,
      totpAccounts,
      settings,
    }
  },

  async importBackup(data) {
    if (data.categories) {
      await db.categories.clear()
      await db.categories.bulkAdd(data.categories)
    }
    if (data.subSections) {
      await db.subSections.clear()
      await db.subSections.bulkAdd(data.subSections)
    }
    if (data.subCategories) {
      await db.subCategories.clear()
      await db.subCategories.bulkAdd(data.subCategories)
    }
    if (data.bookmarks) {
      await db.bookmarks.clear()
      await db.bookmarks.bulkAdd(data.bookmarks)
    }
    if (data.memos) {
      await db.memos.clear()
      await db.memos.bulkAdd(data.memos)
    }
    if (data.totpAccounts) {
      await db.totpAccounts.clear()
      await db.totpAccounts.bulkAdd(data.totpAccounts)
    }
    if (data.settings) {
      await saveSettings(data.settings)
    }
    initializationPromise = null
    set({ ready: false })
    await get().initialize()
  },

  async resetToDefaults() {
    await Promise.all([
      db.categories.clear(),
      db.subSections.clear(),
      db.subCategories.clear(),
      db.bookmarks.clear(),
      db.memos.clear(),
      db.totpAccounts.clear(),
      db.settings.clear(),
    ])
    initializationPromise = null
    set({ ready: false })
    await get().initialize()
  },
}))

export function activeEngine(settings: Settings) {
  return (
    SEARCH_ENGINES.find((engine) => engine.id === settings.activeSearchEngineId) ??
    SEARCH_ENGINES[0]
  )
}

import { create } from 'zustand'
import { arrayMove } from '@dnd-kit/sortable'
import { db } from '../lib/db'
import { fetchFaviconBlob, getFaviconCandidates, normalizeIconUrl } from '../lib/utils'
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
import {
  buildSyncDoc,
  clearSyncConfig,
  describeSyncError,
  loadAutoSync,
  loadLocalTimestamp,
  loadSyncConfig,
  normalizeSyncUrl,
  remoteGet,
  remotePut,
  saveAutoSync,
  saveLocalTimestamp,
  saveSyncConfig,
  syncDocSignature,
  type SyncConfig,
} from '../lib/sync'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'synced' | 'error' | 'conflict'

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
  failedDomains: Record<string, boolean>

  // 云同步（Cloudflare Worker + D1）
  syncConfig: SyncConfig | null
  autoSync: boolean
  syncStatus: SyncStatus
  syncMessage: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  lastSyncedAt: number

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

  // Cloud sync
  configureSync: (url: string, token: string) => Promise<void>
  setAutoSync: (enabled: boolean) => void
  disconnectSync: () => void
  syncNow: () => Promise<void>
  pushToCloud: (force?: boolean) => Promise<void>
  pullFromCloud: () => Promise<void>

  // Categories
  addCategory: (name: string) => Promise<void>
  renameCategory: (categoryId: string, name: string) => Promise<void>
  updateCategory: (categoryId: string, updates: Partial<Omit<Category, 'id'>>) => Promise<void>
  deleteCategory: (categoryId: string) => Promise<void>

  // Sub Sections
  addSubSection: (name: string, icon?: string) => Promise<void>
  renameSubSection: (sectionId: string, name: string) => Promise<void>
  deleteSubSection: (sectionId: string) => Promise<void>

  // Sub Categories
  addSubCategory: (sectionId: string, name: string) => Promise<void>
  renameSubCategory: (subCategoryId: string, name: string) => Promise<void>
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
  saveCachedIcon: (domain: string, dataOrBlob: string | Blob, objectUrl?: string) => Promise<void>
  saveFailedIcon: (domain: string) => Promise<void>
  refreshIcon: (domain: string, bookmarkUrl?: string) => Promise<void>
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
type PendingIconItem = {
  dataUrl?: string
  blob?: Blob
  objectUrl: string
  notFound?: boolean
}
let pendingIconBatch: Record<string, PendingIconItem> = {}
let iconBatchTimer: ReturnType<typeof setTimeout> | null = null

function flushIconBatch(set: any) {
  const batch = { ...pendingIconBatch }
  pendingIconBatch = {}
  iconBatchTimer = null
  const entries = Object.entries(batch)
  if (entries.length === 0) return

  const rows = entries.map(([domain, item]) => ({
    domain,
    dataUrl: item.dataUrl,
    blob: item.blob,
    notFound: item.notFound,
    updatedAt: Date.now(),
  }))
  void db.iconCache.bulkPut(rows)

  const newCachedIcons: Record<string, string> = {}
  const newFailedDomains: Record<string, boolean> = {}
  for (const [domain, item] of entries) {
    if (item.notFound) {
      newFailedDomains[domain] = true
    } else {
      newCachedIcons[domain] = item.objectUrl || item.dataUrl || ''
    }
  }

  set((state: any) => ({
    cachedIcons: { ...state.cachedIcons, ...newCachedIcons },
    failedDomains: { ...state.failedDomains, ...newFailedDomains },
  }))
}

async function saveSettings(value: Settings): Promise<void> {
  await db.settings.put({ key: SETTINGS_KEY, value })
}

// ---------------------------------------------------------------------------
// 云同步运行时（刻意放在 React state 之外，避免这些内部标记触发重渲染）
// ---------------------------------------------------------------------------

const PUSH_DEBOUNCE_MS = 1200

/** 应用云端数据期间要抑制自动上传，否则刚拉下来就会被原样推回去 */
let suppressPush = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
/** 最近一次「已确认与云端一致」的内容指纹，用来过滤只改 UI 状态的空转推送 */
let lastPushedSignature = ''
/** 本次会话是否已经读到过云端权威时间戳；没确认过就不允许直接写云端 */
let remoteConfirmed = false
/** 启动同步的进行中句柄：自动上传要排在它后面，避免「拉取」和「推送」互相踩 */
let bootstrapPromise: Promise<void> | null = null

function currentSignature(): string {
  return syncDocSignature(buildSyncDoc(useNavStore.getState()))
}

async function replaceTable<T>(
  table: { clear: () => Promise<void>; bulkAdd: (rows: readonly T[]) => Promise<unknown> },
  rows: T[] | undefined,
): Promise<void> {
  await table.clear()
  if (rows && rows.length > 0) {
    await table.bulkAdd(rows)
  }
}

/** 把云端快照落到本地：IndexedDB 全量替换 + 内存状态更新（本机 UI 状态保持不动） */
async function applyRemoteDoc(doc: NavData, updatedAt: number): Promise<void> {
  const current = useNavStore.getState().settings
  const categories = doc.categories ?? []

  suppressPush = true
  try {
    await Promise.all([
      replaceTable(db.categories, doc.categories),
      replaceTable(db.subSections, doc.subSections),
      replaceTable(db.subCategories, doc.subCategories),
      replaceTable(db.bookmarks, doc.bookmarks),
      replaceTable(db.memos, doc.memos),
      replaceTable(db.totpAccounts, doc.totpAccounts),
    ])

    const settings: Settings = {
      ...current,
      ...(doc.settings ?? {}),
      // 这几项是「这台设备现在看到哪一屏」，不被云端覆盖
      activeCategoryId: current.activeCategoryId,
      activeSubSectionId: current.activeSubSectionId,
      activeSubCategoryId: current.activeSubCategoryId,
      activeWidgetTab: current.activeWidgetTab,
      isSortMode: current.isSortMode,
      showNotice: current.showNotice,
    }

    if (!categories.some((category) => category.id === settings.activeCategoryId)) {
      settings.activeCategoryId = categories[0]?.id ?? settings.activeCategoryId
    }

    await saveSettings(settings)
    saveLocalTimestamp(updatedAt)
    lastPushedSignature = syncDocSignature(
      buildSyncDoc({ ...doc, settings: doc.settings ?? settings }),
    )

    useNavStore.setState({
      categories: [...categories].sort((a, b) => a.order - b.order),
      subSections: [...(doc.subSections ?? [])].sort((a, b) => a.order - b.order),
      subCategories: [...(doc.subCategories ?? [])].sort((a, b) => a.order - b.order),
      bookmarks: [...(doc.bookmarks ?? [])].sort((a, b) => a.order - b.order),
      memos: [...(doc.memos ?? [])].sort((a, b) => b.createdAt - a.createdAt),
      totpAccounts: [...(doc.totpAccounts ?? [])].sort((a, b) => a.createdAt - b.createdAt),
      settings,
      localUpdatedAt: updatedAt,
      ready: true,
    })
  } finally {
    suppressPush = false
  }
}

/**
 * 启动时的首次同步。规则的核心是「不确定就不要覆盖」：
 * - 云端为空 → 把本地推上去（老设备接入云同步的迁移路径）
 * - 本机是空库（新浏览器 / 清过站点数据）→ 云端为准，直接恢复
 * - 两边都有真实数据但本机从未同步过 → 报冲突，交给人选
 * - 否则比时间戳，新的赢
 */
async function bootstrapSync(hadLocalData: boolean): Promise<void> {
  const config = useNavStore.getState().syncConfig
  if (!config) return

  useNavStore.setState({ syncStatus: 'syncing', syncMessage: '正在检查云端数据…' })
  try {
    const signatureAtStart = currentSignature()
    const remote = await remoteGet(config)
    remoteConfirmed = true
    useNavStore.setState({ remoteUpdatedAt: remote.updatedAt })

    if (!remote.doc) {
      await useNavStore.getState().pushToCloud()
      return
    }

    if (!hadLocalData) {
      // 本机只是默认种子，云端为准；但若这期间用户已经动过手，就不硬盖
      if (currentSignature() !== signatureAtStart) {
        useNavStore.setState({
          syncStatus: 'conflict',
          syncMessage: '刚连上云端时你本机也改动过数据，没有自动覆盖。请选择用哪一边。',
        })
        return
      }
      await useNavStore.getState().pullFromCloud()
      return
    }

    const localUpdatedAt = useNavStore.getState().localUpdatedAt
    if (localUpdatedAt === 0) {
      useNavStore.setState({
        syncStatus: 'conflict',
        syncMessage:
          '本机数据和云端数据没有共同的同步记录，需要你选一次：上传本地，或从云端恢复。',
      })
      return
    }

    if (remote.updatedAt > localUpdatedAt) {
      // 网络往返期间如果本机又产生了新改动，就不要用云端盖掉它
      if (currentSignature() !== signatureAtStart) {
        useNavStore.setState({
          syncStatus: 'conflict',
          syncMessage: '云端有更新的版本，而本机刚刚也改动过，没有自动覆盖。请选择用哪一边。',
        })
        return
      }
      await useNavStore.getState().pullFromCloud()
      return
    }
    if (localUpdatedAt > remote.updatedAt) {
      await useNavStore.getState().pushToCloud()
      return
    }

    lastPushedSignature = currentSignature()
    useNavStore.setState({
      syncStatus: 'synced',
      syncMessage: '本地与云端一致',
      lastSyncedAt: Date.now(),
    })
  } catch (error) {
    useNavStore.setState({ syncStatus: 'error', syncMessage: describeSyncError(error) })
  }
}

function scheduleSyncPush(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    // 排在启动同步之后，避免「正在拉取」和「刚推送」同时改状态
    const gate = bootstrapPromise ?? Promise.resolve()
    bootstrapPromise = gate
      .catch(() => {})
      .then(() => useNavStore.getState().pushToCloud())
      .catch(() => {})
  }, PUSH_DEBOUNCE_MS)
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
  failedDomains: {},
  syncConfig: null,
  autoSync: true,
  syncStatus: 'off',
  syncMessage: '',
  localUpdatedAt: 0,
  remoteUpdatedAt: 0,
  lastSyncedAt: 0,

  initialize() {
    if (get().ready) return Promise.resolve()

    if (!initializationPromise) {
      initializationPromise = (async () => {
        const syncConfig = loadSyncConfig()
        const autoSync = loadAutoSync()
        const localUpdatedAt = loadLocalTimestamp()

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
        const nextFailedDomains: Record<string, boolean> = {}
        const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000
        const now = Date.now()
        for (const row of cachedIconRows) {
          if (row.notFound) {
            if (now - (row.updatedAt || 0) < SEVEN_DAYS_MS) {
              nextFailedDomains[row.domain] = true
            }
          } else if (row.blob && row.blob instanceof Blob) {
            nextCachedIcons[row.domain] = URL.createObjectURL(row.blob)
          } else if (row.dataUrl && (row.dataUrl.startsWith('data:') || row.dataUrl.startsWith('blob:'))) {
            nextCachedIcons[row.domain] = normalizeIconUrl(row.dataUrl) || row.dataUrl
          }
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

        // 本机在这一次加载之前是否已经有真实数据（用来区分「新浏览器」和「老设备首次接入云同步」）
        let hadLocalData = nextCategories.length > 0 || nextBookmarks.length > 0

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

          hadLocalData = false
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
          failedDomains: nextFailedDomains,
          syncConfig,
          autoSync,
          localUpdatedAt,
          remoteUpdatedAt: 0,
          syncStatus: syncConfig ? 'idle' : 'off',
          syncMessage: syncConfig ? '' : '未开启云同步',
        })

        // 首次同步放到后台跑，不阻塞首屏渲染
        if (syncConfig && autoSync) {
          lastPushedSignature = currentSignature()
          bootstrapPromise = bootstrapSync(hadLocalData).catch(() => {})
        }
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

  async renameSubCategory(subCategoryId, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.subCategories.update(subCategoryId, { name: trimmed })
    set((state) => ({
      subCategories: state.subCategories.map((sc) =>
        sc.id === subCategoryId ? { ...sc, name: trimmed } : sc,
      ),
    }))
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

  async addSubSection(name, icon = 'folder') {
    const trimmed = name.trim()
    if (!trimmed) return
    const subSections = get().subSections
    const newSection: SubSection = {
      id: crypto.randomUUID(),
      name: trimmed,
      icon: icon || 'folder',
      order: subSections.length,
    }
    await db.subSections.add(newSection)
    set({ subSections: [...subSections, newSection] })
    get().updateSettings({ activeSubSectionId: newSection.id })
  },

  async renameSubSection(sectionId, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.subSections.update(sectionId, { name: trimmed })
    set((state) => ({
      subSections: state.subSections.map((s) =>
        s.id === sectionId ? { ...s, name: trimmed } : s,
      ),
    }))
  },

  async deleteSubSection(sectionId) {
    const subCategoriesToDelete = get().subCategories.filter((sc) => sc.sectionId === sectionId)
    const subCategoryIds = subCategoriesToDelete.map((sc) => sc.id)
    const bookmarksToDelete = get().bookmarks.filter(
      (b) => b.subCategoryId && subCategoryIds.includes(b.subCategoryId),
    )

    await Promise.all([
      db.subSections.delete(sectionId),
      db.subCategories.bulkDelete(subCategoryIds),
      db.bookmarks.bulkDelete(bookmarksToDelete.map((b) => b.id)),
    ])

    set((state) => {
      const remainingSections = state.subSections.filter((s) => s.id !== sectionId)
      const remainingSubCats = state.subCategories.filter((sc) => sc.sectionId !== sectionId)
      const remainingBookmarks = state.bookmarks.filter(
        (b) => !b.subCategoryId || !subCategoryIds.includes(b.subCategoryId),
      )
      return {
        subSections: remainingSections,
        subCategories: remainingSubCats,
        bookmarks: remainingBookmarks,
        settings: {
          ...state.settings,
          activeSubSectionId:
            state.settings.activeSubSectionId === sectionId
              ? remainingSections[0]?.id ?? ''
              : state.settings.activeSubSectionId,
          activeSubCategoryId:
            subCategoryIds.includes(state.settings.activeSubCategoryId)
              ? remainingSubCats[0]?.id ?? ''
              : state.settings.activeSubCategoryId,
        },
      }
    })
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

  saveCachedIcon(domain, dataOrBlob, customObjectUrl) {
    if (!domain || !dataOrBlob) return Promise.resolve()
    if (dataOrBlob instanceof Blob) {
      const objUrl = customObjectUrl || URL.createObjectURL(dataOrBlob)
      pendingIconBatch[domain] = { blob: dataOrBlob, objectUrl: objUrl }
    } else {
      pendingIconBatch[domain] = { dataUrl: dataOrBlob, objectUrl: dataOrBlob }
    }
    if (!iconBatchTimer) {
      iconBatchTimer = setTimeout(() => flushIconBatch(set), 200)
    }
    return Promise.resolve()
  },

  saveFailedIcon(domain) {
    if (!domain) return Promise.resolve()
    pendingIconBatch[domain] = { notFound: true, objectUrl: '' }
    if (!iconBatchTimer) {
      iconBatchTimer = setTimeout(() => flushIconBatch(set), 200)
    }
    return Promise.resolve()
  },

  async refreshIcon(domain, bookmarkUrl) {
    if (!domain) return
    await db.iconCache.delete(domain)
    set((state) => {
      const nextIcons = { ...state.cachedIcons }
      const nextFailed = { ...state.failedDomains }
      delete nextIcons[domain]
      delete nextFailed[domain]
      return { cachedIcons: nextIcons, failedDomains: nextFailed }
    })

    const targetUrl = bookmarkUrl || `https://${domain}`
    const candidates = getFaviconCandidates(targetUrl, undefined, true)
    if (candidates.length > 0) {
      const result = await fetchFaviconBlob(candidates, true)
      if (result) {
        await get().saveCachedIcon(domain, result.blob, result.objectUrl)
      } else {
        await get().saveFailedIcon(domain)
      }
    }
  },

  async refreshAllIcons() {
    await db.iconCache.clear()
    set({ cachedIcons: {}, failedDomains: {} })
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

  // -------------------------------------------------------------------------
  // 云同步
  // -------------------------------------------------------------------------

  async configureSync(url, token) {
    const normalized = normalizeSyncUrl(url)
    const trimmedToken = token.trim()
    if (!normalized || !trimmedToken) {
      set({ syncStatus: 'error', syncMessage: '同步地址和 token 都要填' })
      return
    }

    const config: SyncConfig = { url: normalized, token: trimmedToken }
    saveSyncConfig(config)
    remoteConfirmed = false
    lastPushedSignature = ''
    set({ syncConfig: config, syncStatus: 'idle', syncMessage: '已保存，正在首次连接…' })
    await get().syncNow()
  },

  setAutoSync(enabled) {
    saveAutoSync(enabled)
    set({
      autoSync: enabled,
      syncMessage: enabled ? '已开启自动同步' : '已暂停自动同步（改动只留在本机）',
    })
  },

  disconnectSync() {
    clearSyncConfig()
    remoteConfirmed = false
    lastPushedSignature = ''
    set({
      syncConfig: null,
      remoteUpdatedAt: 0,
      syncStatus: 'off',
      syncMessage: '已关闭云同步，云端数据仍保留',
    })
  },

  /** 手动「立即同步」：先读云端，再按时间戳决定谁覆盖谁（不确定时以云端为准） */
  async syncNow() {
    const config = get().syncConfig
    if (!config) {
      set({ syncStatus: 'off', syncMessage: '还没配置同步地址' })
      return
    }

    if (bootstrapPromise) await bootstrapPromise.catch(() => {})

    set({ syncStatus: 'syncing', syncMessage: '正在同步…' })
    try {
      const remote = await remoteGet(config)
      remoteConfirmed = true
      set({ remoteUpdatedAt: remote.updatedAt })

      if (!remote.doc) {
        await get().pushToCloud()
        return
      }

      const localUpdatedAt = get().localUpdatedAt
      if (localUpdatedAt === 0) {
        await get().pullFromCloud()
        return
      }
      if (remote.updatedAt > localUpdatedAt) {
        await get().pullFromCloud()
        return
      }
      if (localUpdatedAt > remote.updatedAt) {
        await get().pushToCloud()
        return
      }

      lastPushedSignature = currentSignature()
      set({ syncStatus: 'synced', syncMessage: '本地与云端一致', lastSyncedAt: Date.now() })
    } catch (error) {
      set({ syncStatus: 'error', syncMessage: describeSyncError(error) })
    }
  },

  /**
   * 上传。默认是 fast-forward：只有本地基线不落后于云端才允许写，
   * 否则宁可报冲突也不覆盖 —— 这是「清 cookie 不丢数据」的前提。
   * force = true 是用户明确选择的「用本地覆盖云端」。
   */
  async pushToCloud(force = false) {
    const config = get().syncConfig
    if (!config) return

    set({ syncStatus: 'syncing', syncMessage: force ? '正在强制上传本地…' : '正在上传…' })
    try {
      if (!force && !remoteConfirmed) {
        // 本会话还没读到过云端版本，先确认一次，绝不盲写
        const remote = await remoteGet(config)
        remoteConfirmed = true
        set({ remoteUpdatedAt: remote.updatedAt })

        if (remote.doc && remote.updatedAt > get().localUpdatedAt) {
          set({
            syncStatus: 'conflict',
            syncMessage:
              '云端有比本地更新的版本，本地这次改动没有上传。可以选择「从云端恢复」或「强制上传本地」。',
          })
          return
        }
      }

      if (!force && get().remoteUpdatedAt > get().localUpdatedAt) {
        set({
          syncStatus: 'conflict',
          syncMessage:
            '云端有比本地更新的版本，本地这次改动没有上传。可以选择「从云端恢复」或「强制上传本地」。',
        })
        return
      }

      const doc = buildSyncDoc(get())
      const signature = syncDocSignature(doc)
      const result = await remotePut(config, doc, {
        updatedAt: Math.max(Date.now(), get().localUpdatedAt + 1),
        expectedUpdatedAt: get().remoteUpdatedAt,
        force,
      })

      if (result.status === 'conflict') {
        // 内容其实一致，只是版本号被别的设备推进过：直接对齐，不算冲突
        if (result.doc && syncDocSignature(buildSyncDoc(result.doc)) === signature) {
          remoteConfirmed = true
          saveLocalTimestamp(result.updatedAt)
          lastPushedSignature = signature
          set({
            localUpdatedAt: result.updatedAt,
            remoteUpdatedAt: result.updatedAt,
            syncStatus: 'synced',
            syncMessage: '已与云端对齐',
            lastSyncedAt: Date.now(),
          })
          return
        }

        set({
          remoteUpdatedAt: result.updatedAt,
          syncStatus: 'conflict',
          syncMessage:
            '云端和你本机都改过了，没有自动覆盖。可以选择「从云端恢复」或「强制上传本地」。',
        })
        return
      }

      remoteConfirmed = true
      saveLocalTimestamp(result.updatedAt)
      lastPushedSignature = signature
      set({
        localUpdatedAt: result.updatedAt,
        remoteUpdatedAt: result.updatedAt,
        syncStatus: 'synced',
        syncMessage: force ? '已用本地覆盖云端' : '已同步到云端',
        lastSyncedAt: Date.now(),
      })
    } catch (error) {
      set({ syncStatus: 'error', syncMessage: describeSyncError(error) })
    }
  },

  async pullFromCloud() {
    const config = get().syncConfig
    if (!config) return

    set({ syncStatus: 'syncing', syncMessage: '正在从云端恢复…' })
    try {
      const remote = await remoteGet(config)
      remoteConfirmed = true
      if (!remote.doc) {
        set({
          remoteUpdatedAt: 0,
          syncStatus: 'error',
          syncMessage: '云端还没有数据，先「上传本地」建立第一份。',
        })
        return
      }

      await applyRemoteDoc(remote.doc, remote.updatedAt)
      set({
        remoteUpdatedAt: remote.updatedAt,
        syncStatus: 'synced',
        syncMessage: '已从云端恢复',
        lastSyncedAt: Date.now(),
      })
    } catch (error) {
      set({ syncStatus: 'error', syncMessage: describeSyncError(error) })
    }
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
    // 这是本机的主动覆盖，标记成「刚刚改过」，避免紧接着的启动同步把它当成旧数据拉回去
    saveLocalTimestamp(Math.max(Date.now(), get().remoteUpdatedAt + 1))
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
    saveLocalTimestamp(Math.max(Date.now(), get().remoteUpdatedAt + 1))
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

/**
 * 改动自动上传（防抖）。
 *
 * 这里用「引用比较 + 内容指纹」两层过滤：
 * - 引用比较是 O(1) 的，先把点击分类、切 tab、输入搜索词这类不产生数据变化的 set 挡掉；
 * - 内容指纹用来判断真正参与同步的那份数据有没有变，所以本机 UI 状态变动不会产生任何上传。
 */
useNavStore.subscribe((state, prev) => {
  if (suppressPush) return
  if (!state.ready || !prev.ready) return

  const dataChanged =
    state.categories !== prev.categories ||
    state.subSections !== prev.subSections ||
    state.subCategories !== prev.subCategories ||
    state.bookmarks !== prev.bookmarks ||
    state.memos !== prev.memos ||
    state.totpAccounts !== prev.totpAccounts ||
    state.settings !== prev.settings
  if (!dataChanged) return

  if (!state.syncConfig || !state.autoSync) return
  if (state.syncStatus === 'syncing') return
  if (syncDocSignature(buildSyncDoc(state)) === lastPushedSignature) return

  scheduleSyncPush()
})

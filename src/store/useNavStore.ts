import { create } from 'zustand'
import Dexie from 'dexie'
import { arrayMove } from '@dnd-kit/sortable'
import { db, openAnonymousDatabase } from '../lib/db'
import {
  claimLegacy,
  clearSession,
  fetchMe,
  loadSession,
  logoutRemote,
  saveSession,
  startLogin,
  takeLoginNotice,
  ApiError,
  type AccountUser,
  type LegacyState,
  type Session,
} from '../lib/auth'
import { fetchFaviconBlob, getFaviconCandidates, hostnameOf, normalizeIconUrl } from '../lib/utils'
import { IconRequestPool } from '../lib/iconRequestPool'
import { synchronizeWorkbench, type WorkbenchResolution } from '../lib/workbenchSync'
import { planIconCleanup, type IconFilter, type IconReloadResult } from '../lib/iconCache'
import { cacheCapabilities, refreshServerCache } from '../lib/metadataCache'
import {
  DEFAULT_SETTINGS,
  SEARCH_ENGINES,
  defaultBookmarks,
  defaultCategories,
  defaultMemos,
  defaultSubCategories,
  defaultSubSections,
  defaultSuperPinnedLinks,
  defaultTotpAccounts,
} from '../lib/defaults'
import type {
  Bookmark,
  Category,
  MemoItem,
  NavData,
  RecentVisit,
  Settings,
  SubCategory,
  SubSection,
  SuperPinnedLink,
  TotpItem,
} from '../types'
import {
  buildSyncDoc,
  describeSyncError,
  loadAutoSync,
  loadLocalTimestamp,
  remoteGet,
  remotePut,
  saveAutoSync,
  saveLocalTimestamp,
  syncDocSignature,
  type SyncConfig,
  type SyncDoc,
} from '../lib/sync'

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'synced' | 'error' | 'conflict'

/** 首次进入一个空账号时可选的数据来源 */
export type ImportOffer = {
  /** 未登录时本机库里的书签数量 */
  anonymousBookmarks: number
  /** 管理员可以认领单用户时代的云端数据 */
  legacyClaimable: boolean
}
export type ImportChoice = 'local' | 'legacy' | 'skip'

const IMPORT_DECIDED_KEY = 'nav_import_decided'

// 按本地库名记录（库名已包含账号与 /dev/ 环境），每个账号库只问一次
function importDecided(): boolean {
  return localStorage.getItem(`${IMPORT_DECIDED_KEY}:${db.name}`) === '1'
}

function markImportDecided(): void {
  localStorage.setItem(`${IMPORT_DECIDED_KEY}:${db.name}`, '1')
}

function markImportDecidedUndo(): void {
  localStorage.removeItem(`${IMPORT_DECIDED_KEY}:${db.name}`)
}

function syncConfigFor(session: Session | null): SyncConfig | null {
  return session && session.user.status === 'active' ? { url: session.url, token: session.token } : null
}

type NavState = {
  ready: boolean
  categories: Category[]
  subSections: SubSection[]
  subCategories: SubCategory[]
  bookmarks: Bookmark[]
  memos: MemoItem[]
  totpAccounts: TotpItem[]
  recentVisits: RecentVisit[]
  superPinnedLinks: SuperPinnedLink[]
  scratchpadContent: string
  settings: Settings
  searchQuery: string
  cachedIcons: Record<string, string>
  failedDomains: Record<string, boolean>
  loadingIconDomains: Record<string, boolean>
  iconCleanupRunning: boolean

  // 账号（GitHub 登录）
  session: Session | null
  account: AccountUser | null
  /** 仅管理员可见：旧单用户云端数据是否存在 / 已认领 */
  legacy: LegacyState | null
  /** 首次进入账号时的数据来源选择；null 表示不需要选择 */
  importOffer: ImportOffer | null
  accountMessage: string

  // 云同步（Cloudflare Worker + D1）；只有已审批（active）的账号才有 syncConfig
  syncConfig: SyncConfig | null
  autoSync: boolean
  syncStatus: SyncStatus
  syncMessage: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  lastSyncedAt: number
  workbenchStatus: SyncStatus
  workbenchMessage: string
  workbenchBackendReady: boolean
  backendUpgradeRequired: boolean
  syncWorkbench: (resolution?: WorkbenchResolution) => Promise<void>

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

  // Account
  login: () => void
  logout: () => Promise<void>
  refreshAccount: () => Promise<void>
  resolveImport: (choice: ImportChoice) => Promise<void>
  hasUnsyncedChanges: () => boolean

  // Cloud sync
  setAutoSync: (enabled: boolean) => void
  syncNow: () => Promise<void>
  pushToCloud: (force?: boolean) => Promise<void>
  pullFromCloud: () => Promise<void>

  // Categories
  addCategory: (name: string) => Promise<void>
  renameCategory: (categoryId: string, name: string) => Promise<void>
  updateCategory: (categoryId: string, updates: Partial<Omit<Category, 'id'>>) => Promise<void>
  reorderCategories: (activeId: string, overId: string) => Promise<void>
  deleteCategory: (categoryId: string) => Promise<void>

  // Sub Sections
  addSubSection: (name: string, icon?: string) => Promise<void>
  renameSubSection: (sectionId: string, name: string) => Promise<void>
  reorderSubSections: (activeId: string, overId: string) => Promise<void>
  deleteSubSection: (sectionId: string) => Promise<void>

  // Sub Categories
  addSubCategory: (sectionId: string, name: string) => Promise<void>
  renameSubCategory: (subCategoryId: string, name: string) => Promise<void>
  reorderSubCategories: (activeId: string, overId: string) => Promise<void>
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
  moveBookmarkToSubCategory: (bookmarkId: string, subCategoryId: string) => Promise<void>
  ensureIcon: (url: string) => Promise<IconReloadResult>
  markIconFailed: (domain: string, expectedIcon: string) => Promise<void>
  clearAndReloadIcons: (bookmarkIds: string[], filter: IconFilter) => Promise<IconReloadResult[]>
  refreshIcon: (domain: string, bookmarkUrl?: string) => Promise<void>
  applyServerIcon: (bookmarkId: string, version: string, expectedUrl?: string) => Promise<void>

  // Memos
  addMemo: (text: string) => Promise<void>
  updateMemo: (id: string, text: string) => Promise<void>
  toggleMemo: (id: string) => Promise<void>
  deleteMemo: (id: string) => Promise<void>

  // TOTP
  addTotpAccount: (name: string, secret: string, issuer?: string) => Promise<void>
  deleteTotpAccount: (id: string) => Promise<void>

  // Backup & Restore
  exportBackup: () => Promise<NavData>
  importBackup: (data: Partial<NavData>) => Promise<void>
  resetToDefaults: () => Promise<void>

  // History & Pinned & Scratchpad
  recordVisit: (link: { id?: string; title: string; url: string; iconUrl?: string }) => Promise<void>
  removeRecentVisit: (id: string) => Promise<void>
  clearRecentVisits: () => Promise<void>
  addSuperPinnedLink: (link: { title: string; url: string; iconUrl?: string }) => Promise<void>
  removeSuperPinnedLink: (id: string) => Promise<void>
  reorderSuperPinnedLinks: (activeId: string, overId: string) => Promise<void>
  saveScratchpad: (content: string) => Promise<void>
}

const SETTINGS_KEY = 'app'
let initializationPromise: Promise<void> | null = null
const iconRequests = new IconRequestPool<IconReloadResult>()

function withoutKeys<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  const next = { ...record }
  for (const key of keys) delete next[key]
  return next
}

function revokeIcon(url: string | undefined): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

function loadAutoIcon(domain: string, url: string, force = false): Promise<IconReloadResult> {
  return iconRequests.run(domain, async (isCurrent, signal) => {
    if (!isCurrent()) return { domain, status: 'superseded' }
    useNavStore.setState(state => ({ loadingIconDomains: { ...state.loadingIconDomains, [domain]: true } }))
    let result: Awaited<ReturnType<typeof fetchFaviconBlob>> = null
    let published = false
    try {
      result = await fetchFaviconBlob(getFaviconCandidates(url, undefined, force), force, signal)
      if (!isCurrent()) return { domain, status: 'superseded' }
      // Check ownership inside the transaction too: an older put is either skipped,
      // or commits before the newer delete, never after it.
      await db.transaction('rw', db.iconCache, async () => {
        if (!isCurrent()) return
        await db.iconCache.put({
          domain,
          blob: result?.blob,
          notFound: !result,
          updatedAt: Date.now(),
        })
      })
      if (!isCurrent()) return { domain, status: 'superseded' }
      const previous = useNavStore.getState().cachedIcons[domain]
      useNavStore.setState(state => ({
        cachedIcons: result
          ? { ...state.cachedIcons, [domain]: result.objectUrl }
          : withoutKeys(state.cachedIcons, [domain]),
        failedDomains: result
          ? withoutKeys(state.failedDomains, [domain])
          : { ...state.failedDomains, [domain]: true },
      }))
      published = Boolean(result)
      revokeIcon(previous)
      return result
        ? { domain, status: 'success' }
        : { domain, status: 'failed', message: '未能获取有效图标，可重试' }
    } catch (error) {
      if (!isCurrent()) return { domain, status: 'superseded' }
      // Stop automatic retry loops on storage/network errors; explicit retry remains available.
      useNavStore.setState(state => ({ failedDomains: { ...state.failedDomains, [domain]: true } }))
      return { domain, status: 'failed', message: error instanceof Error ? error.message : '图标更新失败' }
    } finally {
      if (result && !published) revokeIcon(result.objectUrl)
      if (isCurrent()) {
        useNavStore.setState(state => ({ loadingIconDomains: withoutKeys(state.loadingIconDomains, [domain]) }))
      }
    }
  })
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
let workbenchPromise: Promise<void> | null = null
let workbenchTimer: ReturnType<typeof setTimeout> | null = null

function scheduleWorkbench() {
  const state = useNavStore.getState()
  if (!state.syncConfig || !state.autoSync || state.importOffer) return
  if (workbenchTimer) clearTimeout(workbenchTimer)
  workbenchTimer = setTimeout(() => {
    workbenchTimer = null
    void useNavStore.getState().syncWorkbench()
  }, 400)
}

function currentSignature(): string {
  return syncDocSignature(buildSyncDoc(useNavStore.getState()))
}

function snapshotUploadBlockedMessage(): string {
  return useNavStore.getState().backendUpgradeRequired
    ? '同步服务尚未升级便签/剪贴板接口；整页上传已暂停以保护旧云端便签。请先完成后端迁移和部署，再重试。'
    : '工作台同步尚未确认，整页上传已暂停以保护旧云端便签；请先重试便签与剪贴板同步。'
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
async function applyRemoteDoc(doc: SyncDoc, updatedAt: number): Promise<void> {
  const current = useNavStore.getState().settings
  const categories = doc.categories ?? []

  suppressPush = true
  try {
    // 部署过渡期只读保全旧快照中的便签：不覆盖任何现存行、编辑或墓碑。
    // 这不是回退到旧整页写协议，所有整页写入仍需新的工作台后端已确认。
    if (!useNavStore.getState().workbenchBackendReady && Array.isArray(doc.memos)) {
      await db.transaction('rw', db.memos, async () => {
        const ids = new Set((await db.memos.toArray()).map(m => m.id))
        for (const memo of doc.memos!) {
          if (memo && typeof memo.id === 'string' && typeof memo.text === 'string' && !ids.has(memo.id)) {
            await db.memos.add({ id: memo.id, text: memo.text, done: Boolean(memo.done),
              createdAt: memo.createdAt || Date.now(), dirty: false })
            ids.add(memo.id)
          }
        }
      })
    }
    await Promise.all([
      replaceTable(db.categories, doc.categories),
      replaceTable(db.subSections, doc.subSections),
      replaceTable(db.subCategories, doc.subCategories),
      replaceTable(db.bookmarks, doc.bookmarks),
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
      memos: (await db.memos.toArray()).filter(m => !m.deletedAt).sort((a, b) => b.createdAt - a.createdAt),
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
      syncStatus: useNavStore.getState().workbenchBackendReady ? 'synced' : 'error',
      syncMessage: useNavStore.getState().workbenchBackendReady ? '本地与云端一致' : snapshotUploadBlockedMessage(),
      lastSyncedAt: Date.now(),
    })
  } catch (error) {
    useNavStore.setState({ syncStatus: 'error', syncMessage: describeSyncError(error) })
  }
}

function accountStatusText(user: AccountUser): string {
  if (user.status === 'pending') return '账号等待管理员审批，通过后即可云同步（数据暂存本机）'
  if (user.status === 'disabled') return '账号已被禁用，云同步不可用'
  return ''
}

async function countAnonymousBookmarks(): Promise<number> {
  const anonymous = openAnonymousDatabase()
  try {
    if (anonymous.name === db.name) return 0
    if (!(await Dexie.exists(anonymous.name))) return 0
    return await anonymous.bookmarks.count()
  } catch {
    return 0
  } finally {
    anonymous.close()
  }
}

/**
 * 登录状态下的启动流程：刷新账号 → 首次进入空账号时询问数据来源 → 正常启动同步。
 * 「不确定就不覆盖」：账号云端已有数据时以云端为准，不会把本机数据混进去。
 */
async function accountBootstrap(hadLocalData: boolean): Promise<void> {
  await useNavStore.getState().refreshAccount()
  const { session, syncConfig, legacy, autoSync } = useNavStore.getState()
  if (!session) return

  if (!hadLocalData && !importDecided()) {
    let remoteEmpty = true
    if (syncConfig) {
      try {
        const remote = await remoteGet(syncConfig)
        remoteConfirmed = true
        useNavStore.setState({ remoteUpdatedAt: remote.updatedAt })
        remoteEmpty = !remote.doc
      } catch (error) {
        useNavStore.setState({ syncStatus: 'error', syncMessage: describeSyncError(error) })
        return
      }
    }
    if (remoteEmpty) {
      const anonymousBookmarks = await countAnonymousBookmarks()
      const legacyClaimable = Boolean(legacy?.exists && !legacy.claimed)
      if (anonymousBookmarks > 0 || legacyClaimable) {
        useNavStore.setState({
          importOffer: { anonymousBookmarks, legacyClaimable },
          syncMessage: '请选择这个账号的初始数据',
        })
        return
      }
    }
    markImportDecided()
  }

  if (syncConfig && autoSync) {
    await useNavStore.getState().syncWorkbench()
    lastPushedSignature = currentSignature()
    await bootstrapSync(hadLocalData)
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
  recentVisits: [],
  superPinnedLinks: [],
  scratchpadContent: '',
  settings: DEFAULT_SETTINGS,
  searchQuery: '',
  cachedIcons: {},
  failedDomains: {},
  loadingIconDomains: {},
  iconCleanupRunning: false,
  session: null,
  account: null,
  legacy: null,
  importOffer: null,
  accountMessage: '',
  syncConfig: null,
  autoSync: true,
  syncStatus: 'off',
  syncMessage: '',
  localUpdatedAt: 0,
  remoteUpdatedAt: 0,
  lastSyncedAt: 0,
  workbenchStatus: 'off',
  workbenchMessage: '',
  workbenchBackendReady: false,
  backendUpgradeRequired: false,

  async syncWorkbench(resolution) {
    const config = get().syncConfig
    if (!config || get().importOffer) return
    if (workbenchPromise) {
      await workbenchPromise
      if (resolution) return get().syncWorkbench(resolution)
      return
    }
    workbenchPromise = (async () => {
      const previouslyReady = get().workbenchBackendReady
      set({ workbenchStatus: 'syncing', workbenchMessage: '正在同步便签与共享剪贴板…' })
      try {
        const result = await synchronizeWorkbench(config, resolution)
        set({ memos: result.memos, scratchpadContent: result.content,
          workbenchBackendReady: true, backendUpgradeRequired: false,
          workbenchStatus: 'synced', workbenchMessage: '便签与共享剪贴板已同步' })
        if (result.pending) scheduleWorkbench()
        if (!previouslyReady && get().autoSync && lastPushedSignature && currentSignature() !== lastPushedSignature) scheduleSyncPush()
      } catch (error) {
        const missingBackend = error instanceof ApiError && error.status === 404
        set({ workbenchStatus: error instanceof ApiError && error.status === 409 ? 'conflict' : 'error',
          workbenchBackendReady: missingBackend ? false : previouslyReady || (error instanceof ApiError && error.status === 409),
          backendUpgradeRequired: missingBackend || get().backendUpgradeRequired,
          workbenchMessage: missingBackend
            ? '同步服务尚未升级便签与共享剪贴板接口；本地修改保留，整页上传已暂停，请先升级后端再重试'
            : describeSyncError(error) + '；未同步内容保留在本机' })
      }
    })()
    try { await workbenchPromise } finally { workbenchPromise = null }
  },

  initialize() {
    if (get().ready) return Promise.resolve()

    if (!initializationPromise) {
      initializationPromise = (async () => {
        const session = loadSession()
        const syncConfig = syncConfigFor(session)
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
          recentVisitsRows,
          superPinnedRows,
          scratchpadRow,
        ] = await Promise.all([
          db.categories.toArray().catch(() => []),
          db.subSections.toArray().catch(() => []),
          db.subCategories.toArray().catch(() => []),
          db.bookmarks.toArray().catch(() => []),
          db.memos.toArray().catch(() => []),
          db.totpAccounts.toArray().catch(() => []),
          db.settings.get(SETTINGS_KEY).catch(() => undefined),
          db.iconCache.toArray().catch(() => []),
          db.recentVisits.toArray().catch(() => []),
          db.superPinnedLinks.toArray().catch(() => []),
          db.scratchpad.get('default').catch(() => undefined),
        ])

        const nextCachedIcons: Record<string, string> = {}
        const nextFailedDomains: Record<string, boolean> = {}
        const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000
        const now = Date.now()
        for (const row of cachedIconRows) {
          if (row.notFound) {
            if (now - (row.updatedAt || 0) < 5 * 60 * 1000) {
              nextFailedDomains[row.domain] = true
            }
          } else if (now - (row.updatedAt || 0) >= SEVEN_DAYS_MS) {
            // Only regenerable automatic cache is expired; bookmark/manual icon rows are untouched.
            continue
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
        let nextRecentVisits = recentVisitsRows
        let nextSuperPinned = superPinnedRows
        const nextScratchpad = scratchpadRow?.content || ''

        if (nextSuperPinned.length === 0) {
          nextSuperPinned = defaultSuperPinnedLinks()
          void db.superPinnedLinks.bulkAdd(nextSuperPinned).catch(() => {})
        }

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
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', nextSettings.themeMode === 'dark')
        }
        set({
          ready: true,
          categories: [...nextCategories].sort((a, b) => a.order - b.order),
          subSections: [...nextSubSections].sort((a, b) => a.order - b.order),
          subCategories: [...nextSubCategories].sort((a, b) => a.order - b.order),
          bookmarks: [...nextBookmarks].sort((a, b) => a.order - b.order),
          memos: [...nextMemos].filter(m => !m.deletedAt).sort((a, b) => b.createdAt - a.createdAt),
          totpAccounts: [...nextTotpAccounts].sort((a, b) => a.createdAt - b.createdAt),
          recentVisits: [...nextRecentVisits].sort((a, b) => b.visitedAt - a.visitedAt),
          superPinnedLinks: [...nextSuperPinned].sort((a, b) => a.order - b.order),
          scratchpadContent: nextScratchpad,
          settings: nextSettings,
          cachedIcons: nextCachedIcons,
          failedDomains: nextFailedDomains,
          session,
          account: session?.user ?? null,
          syncConfig,
          autoSync,
          localUpdatedAt,
          remoteUpdatedAt: 0,
          syncStatus: syncConfig ? 'idle' : 'off',
          syncMessage: syncConfig ? '' : session ? accountStatusText(session.user) : '登录后即可云同步',
          accountMessage: takeLoginNotice(),
        })

        // 账号状态刷新与首次同步放到后台跑，不阻塞首屏渲染
        if (session) {
          bootstrapPromise = accountBootstrap(hadLocalData).catch(() => {})
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
    if (typeof document !== 'undefined' && 'themeMode' in values) {
      document.documentElement.classList.toggle('dark', settings.themeMode === 'dark')
    }
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

  async reorderCategories(activeId, overId) {
    const { categories } = get()
    const activeIndex = categories.findIndex((c) => c.id === activeId)
    const overIndex = categories.findIndex((c) => c.id === overId)
    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return
    const reordered = arrayMove(categories, activeIndex, overIndex).map((cat, idx) => ({ ...cat, order: idx }))
    await db.categories.bulkPut(reordered)
    set({ categories: reordered })
    scheduleSyncPush()
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

  async reorderSubCategories(activeId, overId) {
    const { subCategories } = get()
    const active = subCategories.find((sc) => sc.id === activeId)
    const over = subCategories.find((sc) => sc.id === overId)
    if (!active || !over || active.id === over.id || active.sectionId !== over.sectionId) return
    const sectionSubCats = subCategories
      .filter((sc) => sc.sectionId === active.sectionId)
      .sort((a, b) => a.order - b.order)
    const activeIndex = sectionSubCats.findIndex((sc) => sc.id === activeId)
    const overIndex = sectionSubCats.findIndex((sc) => sc.id === overId)
    if (activeIndex < 0 || overIndex < 0) return
    const reorderedSectionSubs = arrayMove(sectionSubCats, activeIndex, overIndex).map((sc, idx) => ({ ...sc, order: idx }))
    const otherSubCats = subCategories.filter((sc) => sc.sectionId !== active.sectionId)
    const nextSubCategories = [...otherSubCats, ...reorderedSectionSubs].sort((a, b) => {
      if (a.sectionId === b.sectionId) return a.order - b.order
      return 0
    })
    await db.subCategories.bulkPut(reorderedSectionSubs)
    set({ subCategories: nextSubCategories })
    scheduleSyncPush()
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

  async reorderSubSections(activeId, overId) {
    const { subSections } = get()
    const activeIndex = subSections.findIndex((s) => s.id === activeId)
    const overIndex = subSections.findIndex((s) => s.id === overId)
    if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return
    const reordered = arrayMove(subSections, activeIndex, overIndex).map((sec, idx) => ({ ...sec, order: idx }))
    await db.subSections.bulkPut(reordered)
    set({ subSections: reordered })
    scheduleSyncPush()
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

    const targetCategoryId = over.categoryId
    const targetSubCategoryId = over.subCategoryId

    const isSameContainer = targetCategoryId
      ? active.categoryId === targetCategoryId && !active.subCategoryId
      : active.subCategoryId === targetSubCategoryId && !active.categoryId

    const containerBookmarks = bookmarks
      .filter((b) =>
        targetCategoryId
          ? b.categoryId === targetCategoryId
          : b.subCategoryId === targetSubCategoryId,
      )
      .sort((a, b) => a.order - b.order)

    const visibleIds = containerBookmarks.map((b) => b.id)

    let orderedIds: string[]
    if (isSameContainer) {
      const activeIdx = visibleIds.indexOf(active.id)
      const overIdx = visibleIds.indexOf(over.id)
      if (activeIdx < 0 || overIdx < 0) return
      orderedIds = arrayMove(visibleIds, activeIdx, overIdx)
    } else {
      const overIdx = visibleIds.indexOf(over.id)
      orderedIds = [...visibleIds]
      if (overIdx >= 0) {
        orderedIds.splice(overIdx, 0, active.id)
      } else {
        orderedIds.push(active.id)
      }
    }

    const nextBookmarks = bookmarks.map((b) => {
      const order = orderedIds.indexOf(b.id)
      if (b.id === active.id) {
        return {
          ...b,
          categoryId: targetCategoryId,
          subCategoryId: targetSubCategoryId,
          order: order >= 0 ? order : b.order,
          updatedAt: Date.now(),
        }
      }
      return order >= 0 ? { ...b, order, updatedAt: Date.now() } : b
    })

    await db.bookmarks.bulkPut(
      nextBookmarks.filter((b) => orderedIds.includes(b.id)),
    )
    set({ bookmarks: nextBookmarks })
    scheduleSyncPush()
  },

  async moveBookmarkToCategory(bookmarkId, categoryId) {
    const { bookmarks } = get()
    const active = bookmarks.find((bookmark) => bookmark.id === bookmarkId)
    if (!active) return
    const categoryBookmarks = bookmarks
      .filter((bookmark) => bookmark.categoryId === categoryId && !bookmark.subCategoryId)
      .sort((a, b) => a.order - b.order)

    if (active.categoryId === categoryId && !active.subCategoryId) {
      if (categoryBookmarks.length <= 1) return
      const last = categoryBookmarks[categoryBookmarks.length - 1]
      if (last.id === bookmarkId) return
      const otherIds = categoryBookmarks.filter((b) => b.id !== bookmarkId).map((b) => b.id)
      const orderedIds = [...otherIds, bookmarkId]
      const nextBookmarks = bookmarks.map((b) => {
        const order = orderedIds.indexOf(b.id)
        if (b.id === bookmarkId) {
          return { ...b, order: order >= 0 ? order : b.order, updatedAt: Date.now() }
        }
        return order >= 0 ? { ...b, order, updatedAt: Date.now() } : b
      })
      await db.bookmarks.bulkPut(nextBookmarks.filter((b) => orderedIds.includes(b.id)))
      set({ bookmarks: nextBookmarks })
      scheduleSyncPush()
      return
    }

    const updated: Bookmark = {
      ...active,
      categoryId,
      subCategoryId: undefined,
      order: categoryBookmarks.length,
      updatedAt: Date.now(),
    }
    await db.bookmarks.put(updated)
    set((state) => ({
      bookmarks: state.bookmarks.map((bookmark) =>
        bookmark.id === updated.id ? updated : bookmark,
      ),
    }))
    scheduleSyncPush()
  },

  async moveBookmarkToSubCategory(bookmarkId, subCategoryId) {
    const { bookmarks } = get()
    const active = bookmarks.find((bookmark) => bookmark.id === bookmarkId)
    if (!active) return
    const subCatBookmarks = bookmarks
      .filter((b) => b.subCategoryId === subCategoryId)
      .sort((a, b) => a.order - b.order)

    if (active.subCategoryId === subCategoryId && !active.categoryId) {
      if (subCatBookmarks.length <= 1) return
      const last = subCatBookmarks[subCatBookmarks.length - 1]
      if (last.id === bookmarkId) return
      const otherIds = subCatBookmarks.filter((b) => b.id !== bookmarkId).map((b) => b.id)
      const orderedIds = [...otherIds, bookmarkId]
      const nextBookmarks = bookmarks.map((b) => {
        const order = orderedIds.indexOf(b.id)
        if (b.id === bookmarkId) {
          return { ...b, order: order >= 0 ? order : b.order, updatedAt: Date.now() }
        }
        return order >= 0 ? { ...b, order, updatedAt: Date.now() } : b
      })
      await db.bookmarks.bulkPut(nextBookmarks.filter((b) => orderedIds.includes(b.id)))
      set({ bookmarks: nextBookmarks })
      scheduleSyncPush()
      return
    }

    const updated: Bookmark = {
      ...active,
      categoryId: undefined,
      subCategoryId,
      order: subCatBookmarks.length,
      updatedAt: Date.now(),
    }
    await db.bookmarks.put(updated)
    set((state) => ({
      bookmarks: state.bookmarks.map((b) => (b.id === updated.id ? updated : b)),
    }))
    scheduleSyncPush()
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

  ensureIcon(url) {
    const domain = hostnameOf(url)
    if (!domain) return Promise.resolve({ domain, status: 'failed', message: '网址无效' })
    const pending = iconRequests.get(domain)
    if (pending) return pending
    const state = get()
    if (state.cachedIcons[domain] && !state.failedDomains[domain]) {
      return Promise.resolve({ domain, status: 'success' })
    }
    if (state.failedDomains[domain] || state.loadingIconDomains[domain]) {
      return Promise.resolve({ domain, status: 'superseded' })
    }
    return loadAutoIcon(domain, url)
  },

  async markIconFailed(domain, expectedIcon) {
    if (get().cachedIcons[domain] !== expectedIcon || get().loadingIconDomains[domain]) return
    iconRequests.invalidate([domain])
    await iconRequests.run(domain, async isCurrent => {
      try {
        await db.transaction('rw', db.iconCache, async () => {
          if (isCurrent()) await db.iconCache.put({ domain, notFound: true, updatedAt: Date.now() })
        })
      } catch {
        // Still suppress rendering of a broken image in this session.
      }
      if (!isCurrent()) return { domain, status: 'superseded' }
      set(state => ({
        cachedIcons: withoutKeys(state.cachedIcons, [domain]),
        failedDomains: { ...state.failedDomains, [domain]: true },
      }))
      revokeIcon(expectedIcon)
      return { domain, status: 'failed' }
    })
  },

  async clearAndReloadIcons(bookmarkIds, filter) {
    if (get().iconCleanupRunning) throw new Error('正在清理图标，请等待本次操作完成')
    const state = get()
    const plan = planIconCleanup(state.bookmarks, bookmarkIds, filter, state.cachedIcons, state.failedDomains)
    const domains = plan.targets.map(target => target.domain)
    if (domains.length === 0) return []
    set({
      iconCleanupRunning: true,
      loadingIconDomains: { ...state.loadingIconDomains, ...Object.fromEntries(domains.map(domain => [domain, true])) },
    })
    iconRequests.invalidate(domains)
    try {
      // Only this cache table and selected keys are touched, never business data.
      await db.transaction('rw', db.iconCache, () => db.iconCache.bulkDelete(domains))
      const oldIcons = domains.map(domain => get().cachedIcons[domain])
      set(current => ({
        cachedIcons: withoutKeys(current.cachedIcons, domains),
        failedDomains: withoutKeys(current.failedDomains, domains),
      }))
      for (const icon of oldIcons) revokeIcon(icon)
      return await Promise.all(plan.targets.map(target => loadAutoIcon(target.domain, target.url)))
    } finally {
      set(current => ({
        iconCleanupRunning: false,
        loadingIconDomains: withoutKeys(current.loadingIconDomains, domains),
      }))
    }
  },

  async refreshIcon(domain, bookmarkUrl) {
    if (!domain || get().iconCleanupRunning) return
    const bookmark = get().bookmarks.find(b => !b.iconUrl?.trim() &&
      (bookmarkUrl ? b.url === bookmarkUrl : hostnameOf(b.url) === domain))
    if (!bookmark) return
    try {
      await cacheCapabilities()
      const results = await refreshServerCache([{ bookmarkId: bookmark.id, kind: 'icon', expectedUrl: bookmark.url }])
      const row = results[0]
      if (row?.status !== 'refreshed' || !row.version) throw new Error('服务端未刷新，旧图标已保留；可在缓存管理查看详情')
      await get().applyServerIcon(bookmark.id, row.version, bookmark.url)
    } catch (error) {
      set({ syncMessage: error instanceof Error ? error.message : '图标刷新失败，旧图标已保留' })
    }
  },

  async applyServerIcon(bookmarkId, version, expectedUrl) {
    const bookmark = get().bookmarks.find(b => b.id === bookmarkId)
    const session = get().session
    if (!bookmark || bookmark.iconUrl?.trim() || !session || expectedUrl !== undefined && bookmark.url !== expectedUrl) throw new Error('书签或账号已变化，未更新本地缓存')
    const domain = hostnameOf(bookmark.url)
    const unchanged = () => {
      const current = get().bookmarks.find(b => b.id === bookmarkId)
      return get().session?.user.id === session.user.id && current?.url === bookmark.url && !current.iconUrl?.trim()
    }
    iconRequests.invalidate([domain])
    const outcome = await iconRequests.run(domain, async (isCurrent, signal) => {
      set(current => ({ loadingIconDomains: { ...current.loadingIconDomains, [domain]: true } }))
      let image: Awaited<ReturnType<typeof fetchFaviconBlob>> = null
      let published = false
      try {
        const endpoint = `${session.url}/api/icon?domain=${encodeURIComponent(new URL(bookmark.url).origin)}&version=${encodeURIComponent(version)}`
        // A version-bound fetch has no fallback: an old value is not a successful local update.
        image = await fetchFaviconBlob([endpoint], true, signal)
        if (!image || !isCurrent() || !unchanged()) throw new Error('未获取到服务端新图标或书签已变化，旧图标已保留')
        await db.transaction('rw', db.iconCache, async () => {
          if (!isCurrent() || !unchanged()) throw new Error('更新已被其他操作替代')
          await db.iconCache.put({ domain, blob: image!.blob, notFound: false, updatedAt: Date.now() })
        })
        if (!isCurrent()) return { domain, status: 'superseded' }
        const old = get().cachedIcons[domain]
        set(current => ({
          cachedIcons: { ...current.cachedIcons, [domain]: image!.objectUrl },
          failedDomains: withoutKeys(current.failedDomains, [domain]),
        }))
        published = true
        revokeIcon(old)
        return { domain, status: 'success' }
      } catch (error) {
        return { domain, status: 'failed', message: error instanceof Error ? error.message : '本地更新失败' }
      } finally {
        if (image && !published) revokeIcon(image.objectUrl)
        if (isCurrent()) set(current => ({ loadingIconDomains: withoutKeys(current.loadingIconDomains, [domain]) }))
      }
    })
    if (outcome.status !== 'success') throw new Error(outcome.message || '本地更新已被替代')
  },

  async addMemo(text) {
    const trimmed = text.trim()
    if (!trimmed) return
    const memo: MemoItem = {
      id: crypto.randomUUID(),
      text: trimmed,
      done: false,
      createdAt: Date.now(),
      updatedAt: 0,
      dirty: true,
    }
    await db.memos.add(memo)
    set((state) => ({ memos: [memo, ...state.memos] }))
    scheduleWorkbench()
  },

  async updateMemo(id, text) {
    const trimmed = text.trim()
    if (!trimmed || !get().memos.some(m => m.id === id)) return
    // 只更新文本，不重新 put 整条记录：保留状态/时间，也不会复活已删除的记录。
    const changed = await db.memos.update(id, { text: trimmed, dirty: true })
    if (!changed) return
    set(state => ({
      memos: state.memos.map(m => m.id === id ? { ...m, text: trimmed, dirty: true } : m),
    }))
    scheduleWorkbench()
  },

  async toggleMemo(id) {
    const done = await db.transaction('rw', db.memos, async () => {
      const current = await db.memos.get(id)
      if (!current) return undefined
      const next = !current.done
      // 与失焦保存并发时只更新 done，不把旧 text 整行写回。
      await db.memos.update(id, { done: next, dirty: true })
      return next
    })
    if (done === undefined) return
    set((state) => ({
      memos: state.memos.map((m) => (m.id === id ? { ...m, done, dirty: true } : m)),
    }))
    scheduleWorkbench()
  },

  async deleteMemo(id) {
    await db.memos.update(id, { deletedAt: Date.now(), dirty: true })
    set((state) => ({ memos: state.memos.filter((m) => m.id !== id) }))
    scheduleWorkbench()
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

  setAutoSync(enabled) {
    saveAutoSync(enabled)
    set({
      autoSync: enabled,
      syncMessage: enabled ? '已开启自动同步' : '已暂停自动同步（改动只留在本机）',
    })
  },

  login() {
    startLogin()
  },

  /**
   * 退出登录：撤销服务端会话后重新加载页面，回到未登录时的本地库。
   * 账号库保留在本机，未同步的改动下次登录后会继续同步（调用方负责提前确认）。
   */
  async logout() {
    const session = get().session
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = null
    if (workbenchTimer) clearTimeout(workbenchTimer)
    workbenchTimer = null
    if (session) await logoutRemote(session)
    clearSession()
    window.location.reload()
  },

  /** 重新读取账号状态（审批结果、角色、旧数据认领情况） */
  async refreshAccount() {
    const session = get().session
    if (!session) return
    const wasActive = Boolean(get().syncConfig)
    try {
      const me = await fetchMe(session)
      const next: Session = { ...session, user: me.user }
      saveSession(next)
      const syncConfig = syncConfigFor(next)
      set({
        session: next,
        account: me.user,
        legacy: me.legacy,
        syncConfig,
        accountMessage: '',
        ...(syncConfig
          ? wasActive
            ? {}
            : { syncStatus: 'idle' as const, syncMessage: '账号已通过审批' }
          : { syncStatus: 'off' as const, syncMessage: accountStatusText(me.user) }),
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // 保留会话里的账号 id（决定本地库），只停掉同步，提示重新登录
        set({
          syncConfig: null,
          syncStatus: 'off',
          syncMessage: '登录已过期，请重新登录',
          accountMessage: '登录已过期，请重新登录',
        })
        return
      }
      set({ accountMessage: describeSyncError(error) })
    }
  },

  hasUnsyncedChanges() {
    const state = get()
    if (!state.syncConfig) return false
    return (
      Boolean(pushTimer) ||
      Boolean(workbenchTimer) ||
      Boolean(workbenchPromise) ||
      state.workbenchStatus === 'conflict' ||
      state.workbenchStatus === 'error' ||
      state.memos.some(m => m.dirty) ||
      state.syncStatus === 'conflict' ||
      state.syncStatus === 'error' ||
      currentSignature() !== lastPushedSignature
    )
  },

  /**
   * 首次进入空账号时的数据来源：
   * - local：导入未登录时本机的数据，随后上传到账号
   * - legacy：（管理员）认领单用户时代的云端数据并拉取
   * - skip：从默认数据开始
   */
  async resolveImport(choice) {
    const offer = get().importOffer
    const session = get().session
    if (!offer || !session) return
    set({ accountMessage: '' })
    try {
      if (choice === 'legacy') {
        await claimLegacy(session)
        markImportDecided()
        set({ importOffer: null })
        await get().refreshAccount()
        if (get().syncConfig) await get().pullFromCloud()
        return
      }
      markImportDecided()
      set({ importOffer: null })
      if (choice === 'local') {
        const anonymous = openAnonymousDatabase()
        try {
          const [categories, subSections, subCategories, bookmarks, memos, totpAccounts, settingRecord] =
            await Promise.all([
              anonymous.categories.toArray(),
              anonymous.subSections.toArray(),
              anonymous.subCategories.toArray(),
              anonymous.bookmarks.toArray(),
              anonymous.memos.toArray(),
              anonymous.totpAccounts.toArray(),
              anonymous.settings.get(SETTINGS_KEY),
            ])
          // importBackup 会重新初始化，本机版本更新，随后自动上传到账号云端
          await get().importBackup({
            categories,
            subSections,
            subCategories,
            bookmarks,
            memos,
            totpAccounts,
            ...(settingRecord ? { settings: settingRecord.value } : {}),
          })
        } finally {
          anonymous.close()
        }
        return
      }
      if (get().syncConfig && get().autoSync) {
        lastPushedSignature = currentSignature()
        bootstrapPromise = bootstrapSync(false).catch(() => {})
      }
    } catch (error) {
      markImportDecidedUndo()
      set({ importOffer: offer, accountMessage: describeSyncError(error) })
    }
  },

  /** 手动「立即同步」：先读云端，再按时间戳决定谁覆盖谁（不确定时以云端为准） */
  async syncNow() {
    if (get().importOffer) {
      set({ syncMessage: '请先选择这个账号的初始数据' })
      return
    }
    const config = get().syncConfig
    if (!config) {
      set({ syncStatus: 'off', syncMessage: '还没配置同步地址' })
      return
    }

    if (bootstrapPromise) await bootstrapPromise.catch(() => {})
    await get().syncWorkbench()

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

      if (!get().workbenchBackendReady) {
        set({ syncStatus: 'error', syncMessage: snapshotUploadBlockedMessage() })
        return
      }
      if (currentSignature() !== lastPushedSignature) {
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
    if (!config || get().importOffer) return
    await get().syncWorkbench()
    if (!get().workbenchBackendReady) {
      set({ syncStatus: 'error', syncMessage: snapshotUploadBlockedMessage() })
      return
    }

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
    await get().syncWorkbench()

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
        syncStatus: get().workbenchBackendReady ? 'synced' : 'error',
        syncMessage: get().workbenchBackendReady ? '已从云端恢复' : `已只读恢复导航快照；${snapshotUploadBlockedMessage()}`,
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
      memos: memos.map(({ id, text, done, createdAt }) => ({ id, text, done, createdAt })),
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
      await db.transaction('rw', db.memos, async () => {
        const existing = await db.memos.toArray()
        const included = new Set(data.memos!.map(m => m.id))
        for (const memo of existing) {
          if (!included.has(memo.id) && !memo.deletedAt) {
            await db.memos.update(memo.id, { deletedAt: Date.now(), dirty: true })
          }
        }
        for (const memo of data.memos!) {
          const previous = existing.find(m => m.id === memo.id)
          await db.memos.put({ id: previous?.deletedAt ? crypto.randomUUID() : memo.id,
            text: memo.text, done: memo.done, createdAt: memo.createdAt,
            updatedAt: previous?.deletedAt ? 0 : previous?.updatedAt ?? 0, dirty: true, deletedAt: null })
        }
      })
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
      db.recentVisits.clear(),
      db.superPinnedLinks.clear(),
      db.scratchpad.clear(),
    ])
    saveLocalTimestamp(Math.max(Date.now(), get().remoteUpdatedAt + 1))
    initializationPromise = null
    set({ ready: false })
    await get().initialize()
  },

  async recordVisit(link) {
    const prev = get().recentVisits
    const now = Date.now()
    const existing = prev.find((v) => v.url === link.url)
    const nextItem: RecentVisit = {
      id: existing?.id || `visit-${now}-${Math.random().toString(36).slice(2, 6)}`,
      title: link.title || link.url,
      url: link.url,
      iconUrl: link.iconUrl,
      visitedAt: now,
    }
    const filtered = prev.filter((v) => v.url !== link.url)
    const nextList = [nextItem, ...filtered].slice(0, 10)
    set({ recentVisits: nextList })
    try {
      await db.recentVisits.put(nextItem)
      const all = await db.recentVisits.toArray()
      if (all.length > 10) {
        const toDelete = all.sort((a, b) => b.visitedAt - a.visitedAt).slice(10)
        await Promise.all(toDelete.map((item) => db.recentVisits.delete(item.id)))
      }
    } catch (err) {
      console.error('Failed to save recent visit:', err)
    }
  },

  async removeRecentVisit(id) {
    const next = get().recentVisits.filter((v) => v.id !== id)
    set({ recentVisits: next })
    try {
      await db.recentVisits.delete(id)
    } catch (err) {
      console.error('Failed to remove recent visit:', err)
    }
  },

  async clearRecentVisits() {
    set({ recentVisits: [] })
    try {
      await db.recentVisits.clear()
    } catch (err) {
      console.error('Failed to clear recent visits:', err)
    }
  },

  async addSuperPinnedLink(link) {
    const prev = get().superPinnedLinks
    const now = Date.now()
    const newItem: SuperPinnedLink = {
      id: `pin-${now}`,
      title: link.title,
      url: link.url,
      iconUrl: link.iconUrl,
      order: prev.length,
    }
    const next = [...prev, newItem]
    set({ superPinnedLinks: next })
    try {
      await db.superPinnedLinks.put(newItem)
    } catch (err) {
      console.error('Failed to add super pinned link:', err)
    }
  },

  async removeSuperPinnedLink(id) {
    const next = get().superPinnedLinks.filter((p) => p.id !== id)
    set({ superPinnedLinks: next })
    try {
      await db.superPinnedLinks.delete(id)
    } catch (err) {
      console.error('Failed to remove super pinned link:', err)
    }
  },

  async reorderSuperPinnedLinks(activeId, overId) {
    const prev = get().superPinnedLinks
    const oldIndex = prev.findIndex((p) => p.id === activeId)
    const newIndex = prev.findIndex((p) => p.id === overId)
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(prev, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      order: idx,
    }))
    set({ superPinnedLinks: next })
    try {
      await Promise.all(next.map((item) => db.superPinnedLinks.put(item)))
    } catch (err) {
      console.error('Failed to reorder super pinned links:', err)
    }
  },

  async saveScratchpad(content) {
    try {
      await db.transaction('rw', db.scratchpad, async () => {
        const current = await db.scratchpad.get('default')
        await db.scratchpad.put({ ...current, id: 'default', content, updatedAt: Date.now(), dirty: true })
      })
      set({ scratchpadContent: content })
      scheduleWorkbench()
    } catch (err) {
      console.error('Failed to save scratchpad:', err)
    }
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
    state.totpAccounts !== prev.totpAccounts ||
    state.settings !== prev.settings
  if (!dataChanged) return

  if (!state.syncConfig || !state.autoSync || state.importOffer) return
  if (state.syncStatus === 'syncing') return
  if (syncDocSignature(buildSyncDoc(state)) === lastPushedSignature) return

  scheduleSyncPush()
})

if (typeof window !== 'undefined') {
  const refreshWorkbench = () => {
    if (useNavStore.getState().autoSync) void useNavStore.getState().syncWorkbench()
  }
  window.addEventListener('focus', refreshWorkbench)
  window.addEventListener('online', refreshWorkbench)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshWorkbench()
  })
}

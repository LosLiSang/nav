import Dexie, { type Table } from 'dexie'
import { currentAccountId } from './auth'
import type {
  Bookmark,
  CachedIcon,
  Category,
  MemoItem,
  RecentVisit,
  Settings,
  SubCategory,
  SubSection,
  SuperPinnedLink,
  TotpItem,
} from '../types'

type SettingRecord = {
  key: string
  value: Settings
}

/**
 * 本地数据库按「运行环境 + 账号」隔离：
 * - /dev/ 预览使用独立前缀，避免与生产数据互相升级冲突
 * - 未登录沿用原来的库名（老数据原地保留）；登录后每个账号一个独立的库
 * 库名在页面加载时确定，切换账号通过重新加载页面完成，内存里不会残留上一个账号的数据。
 */
export function databaseNameFor(accountId: string | null, isDev: boolean): string {
  const base = isDev ? 'nav-workspace-dev' : 'nav-workspace-v2'
  return accountId ? `${base}-u-${accountId}` : base
}

function isDevPreview(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.includes('/dev')
}

function resolveDatabaseName(): string {
  return databaseNameFor(currentAccountId(), isDevPreview())
}

export class NavDatabase extends Dexie {
  categories!: Table<Category, string>
  subSections!: Table<SubSection, string>
  subCategories!: Table<SubCategory, string>
  bookmarks!: Table<Bookmark, string>
  memos!: Table<MemoItem, string>
  totpAccounts!: Table<TotpItem, string>
  settings!: Table<SettingRecord, string>
  iconCache!: Table<CachedIcon, string>
  recentVisits!: Table<RecentVisit, string>
  superPinnedLinks!: Table<SuperPinnedLink, string>
  scratchpad!: Table<{ id: string; content: string; updatedAt: number }, string>

  constructor(name = resolveDatabaseName()) {
    super(name)
    this.version(2).stores({
      categories: 'id, order',
      subSections: 'id, order',
      subCategories: 'id, sectionId, order',
      bookmarks: 'id, categoryId, subCategoryId, order',
      memos: 'id, createdAt',
      totpAccounts: 'id, createdAt',
      settings: 'key',
    })
    this.version(3).stores({
      categories: 'id, order',
      subSections: 'id, order',
      subCategories: 'id, sectionId, order',
      bookmarks: 'id, categoryId, subCategoryId, order',
      memos: 'id, createdAt',
      totpAccounts: 'id, createdAt',
      settings: 'key',
      iconCache: 'domain, updatedAt',
    })
    this.version(4).stores({
      categories: 'id, order',
      subSections: 'id, order',
      subCategories: 'id, sectionId, order',
      bookmarks: 'id, categoryId, subCategoryId, order',
      memos: 'id, createdAt',
      totpAccounts: 'id, createdAt',
      settings: 'key',
      iconCache: 'domain, updatedAt',
      recentVisits: 'id, visitedAt',
      superPinnedLinks: 'id, order',
      scratchpad: 'id',
    })
  }
}

export const db = new NavDatabase()

/** 未登录时使用的本地库（登录后首次进入账号时，可从这里导入数据） */
export function openAnonymousDatabase(): NavDatabase {
  return new NavDatabase(databaseNameFor(null, isDevPreview()))
}

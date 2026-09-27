import Dexie, { type Table } from 'dexie'
import type {
  Bookmark,
  CachedIcon,
  Category,
  MemoItem,
  Settings,
  SubCategory,
  SubSection,
  TotpItem,
} from '../types'

type SettingRecord = {
  key: string
  value: Settings
}

function resolveDatabaseName(): string {
  // 当运行在 GitHub Pages 的 /dev/ 预览子路径下时，使用独立数据库隔离生产数据，避免版本升级冲突
  if (typeof window !== 'undefined' && window.location.pathname.includes('/dev')) {
    return 'nav-workspace-dev'
  }
  return 'nav-workspace-v2'
}

class NavDatabase extends Dexie {
  categories!: Table<Category, string>
  subSections!: Table<SubSection, string>
  subCategories!: Table<SubCategory, string>
  bookmarks!: Table<Bookmark, string>
  memos!: Table<MemoItem, string>
  totpAccounts!: Table<TotpItem, string>
  settings!: Table<SettingRecord, string>
  iconCache!: Table<CachedIcon, string>

  constructor() {
    super(resolveDatabaseName())
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
  }
}

export const db = new NavDatabase()

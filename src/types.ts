export type CornerRadius = 'none' | 'md' | 'xl'
export type IconShape = 'square' | 'rounded' | 'circle'

export type CategoryStyle = {
  iconShape: IconShape
  fontSize: number
  isBold: boolean
  isItalic: boolean
  textColor: string
}

export type Category = {
  id: string
  name: string
  color: string
  order: number
}

export type SubSection = {
  id: string
  name: string
  icon: string
  order: number
}

export type SubCategory = {
  id: string
  sectionId: string
  name: string
  icon: string
  order: number
}

export type CachedIcon = {
  domain: string
  dataUrl: string
  updatedAt: number
}

export type Bookmark = {
  id: string
  categoryId?: string
  subCategoryId?: string
  title: string
  url: string
  iconUrl?: string
  order: number
  isFavorite?: boolean
  createdAt: number
  updatedAt: number
}

export type SearchEngine = {
  id: string
  name: string
  searchUrl: string
  icon: string
}

export type MemoItem = {
  id: string
  text: string
  done: boolean
  createdAt: number
}

export type TotpItem = {
  id: string
  name: string
  issuer?: string
  secret: string
  createdAt: number
}

export type WidgetTab = 'calendar' | 'memo' | 'qrcode' | 'totp' | 'tools'

export type Settings = {
  activeCategoryId: string
  activeSearchEngineId: string
  activeSubSectionId: string
  activeSubCategoryId: string
  activeWidgetTab: WidgetTab
  wallpaperUrl: string
  wallpaperBlur: number
  wallpaperDim: number
  panelOpacity: number
  cardOpacity: number
  isSortMode: boolean
  showNotice: boolean
  // Global typography & styling
  cornerRadius: CornerRadius
  iconShape: IconShape
  fontSize: number
  isBold: boolean
  isItalic: boolean
  textColor: string
  fontFamily?: string
  customFontUrl?: string
  showBookmarkIcon?: boolean
  columnMode?: 'auto' | 'manual'
  manualColumns?: number
  avatarUrl?: string
  userName?: string
  highlightColor?: string
  weatherCity?: string
  themeMode?: 'light' | 'dark'
}

export type NavData = {
  categories: Category[]
  subSections: SubSection[]
  subCategories: SubCategory[]
  bookmarks: Bookmark[]
  memos: MemoItem[]
  totpAccounts: TotpItem[]
  settings: Settings
}

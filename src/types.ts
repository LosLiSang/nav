export type CornerRadius = 'none' | 'md' | 'xl'
export type IconShape = 'square' | 'rounded' | 'circle'
export type FallbackIconMode = 'letter' | 'globe' | 'bookmark' | 'custom'
export type WeatherProvider = 'open-meteo' | 'amap' | 'qweather' | 'wttr' | 'custom'

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
  dataUrl?: string
  blob?: Blob
  notFound?: boolean
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

export type RecentVisit = {
  id: string
  title: string
  url: string
  iconUrl?: string
  visitedAt: number
}

export type SuperPinnedLink = {
  id: string
  title: string
  url: string
  iconUrl?: string
  order: number
}

export type CountdownTarget = {
  id: string
  title: string
  targetDate: string
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
  /** 对话框/弹出菜单的圆角；未设置时沿用 cornerRadius（兼容老数据） */
  dialogCornerRadius?: CornerRadius
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
  cardWidth?: number
  avatarUrl?: string
  userName?: string
  highlightColor?: string
  weatherCity?: string
  weatherProvider?: WeatherProvider
  weatherApiKey?: string
  weatherCustomUrl?: string
  weatherCustomFieldPath?: string
  weatherCustomTempPath?: string
  weatherAutoRefreshMinutes?: number
  themeMode?: 'light' | 'dark'
  fallbackIconMode?: FallbackIconMode
  defaultPlaceholderIconUrl?: string
  showRightSidebar?: boolean
  rightSidebarCollapsed?: boolean
  showLeftSidebar?: boolean
  leftSidebarCollapsed?: boolean
  /** 在搜索框输入时是否同时过滤下方书签，默认开启 */
  searchFilterBookmarks?: boolean
}

export type NavData = {
  categories: Category[]
  subSections: SubSection[]
  subCategories: SubCategory[]
  bookmarks: Bookmark[]
  memos: MemoItem[]
  totpAccounts: TotpItem[]
  recentVisits?: RecentVisit[]
  superPinnedLinks?: SuperPinnedLink[]
  scratchpadContent?: string
  settings: Settings
}

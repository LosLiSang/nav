import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SEARCH_ENGINES } from './lib/defaults'
import { faviconFor, hostnameOf } from './lib/utils'
import { useNavStore } from './store/useNavStore'
import type { Bookmark } from './types'

import { BookmarkDialog } from './components/BookmarkDialog'
import { BookmarkContextMenu } from './components/BookmarkContextMenu'
import { BookmarkStyleModal } from './components/BookmarkStyleModal'
import { BottomSection } from './components/BottomSection'
import { ConfirmModal } from './components/ConfirmModal'
import { FloatingDock } from './components/FloatingDock'
import { IconPickerModal } from './components/IconPickerModal'
import { MainCategoryCard } from './components/MainCategoryCard'
import { ProfileModal } from './components/ProfileModal'
import { SearchBar, type SearchBarHandle } from './components/SearchBar'
import { SettingsPanel } from './components/SettingsPanel'
import { TopNavbar } from './components/TopNavbar'

export default function App() {
  const {
    ready,
    categories,
    subSections,
    subCategories,
    bookmarks,
    memos,
    totpAccounts,
    settings,
    searchQuery,
    cachedIcons,
    failedDomains,
    initialize,
    setActiveCategory,
    setActiveSearchEngine,
    setActiveSubSection,
    setActiveSubCategory,
    setActiveWidgetTab,
    setSearchQuery,
    updateSettings,
    toggleSortMode,
    toggleFavorite,
    addCategory,
    updateCategory,
    renameCategory,
    deleteCategory,
    addSubSection,
    renameSubSection,
    deleteSubSection,
    addSubCategory,
    renameSubCategory,
    deleteSubCategory,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    reorderBookmark,
    moveBookmarkToCategory,
    addMemo,
    toggleMemo,
    deleteMemo,
    addTotpAccount,
    deleteTotpAccount,
    saveCachedIcon,
    saveFailedIcon,
    refreshIcon,
    refreshAllIcons,
    exportBackup,
    importBackup,
    resetToDefaults,
    syncConfig,
    autoSync,
    syncStatus,
    syncMessage,
    lastSyncedAt,
    localUpdatedAt,
    remoteUpdatedAt,
    configureSync,
    setAutoSync,
    disconnectSync,
    syncNow,
    pushToCloud,
    pullFromCloud,
  } = useNavStore()

  const searchBarRef = useRef<SearchBarHandle>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [bookmarkStyleOpen, setBookmarkStyleOpen] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null)
  const [defaultSubCategoryId, setDefaultSubCategoryId] = useState<string | undefined>()
  const [deletingBookmark, setDeletingBookmark] = useState<Bookmark | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [iconPickerBookmark, setIconPickerBookmark] = useState<Bookmark | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    bookmark: Bookmark
    x: number
    y: number
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  useEffect(() => {
    void initialize()
  }, [initialize])

  // Dynamically load online web font if specified
  useEffect(() => {
    if (!settings.customFontUrl) return
    const id = 'custom-web-font-link'
    let link = document.getElementById(id) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    link.href = settings.customFontUrl
  }, [settings.customFontUrl])

  // Bookmarks for active main category (filtered by query if any)
  const activeMainBookmarks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    // ⭐ Special category: 'cat-fav' (Favorites)
    const inCat =
      settings.activeCategoryId === 'cat-fav'
        ? bookmarks.filter((b) => b.isFavorite)
        : bookmarks.filter((b) => b.categoryId === settings.activeCategoryId)

    const sorted = [...inCat].sort((a, b) => a.order - b.order)

    if (!q) return sorted

    return bookmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q),
    )
  }, [bookmarks, settings.activeCategoryId, searchQuery])

  const draggingBookmark = draggingId
    ? bookmarks.find((b) => b.id === draggingId)
    : null
  const isDark = settings.themeMode === 'dark'

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null)
    const activeId = String(event.active.id)
    const overId = event.over?.id
    if (!overId) return

    const overIdText = String(overId)
    if (overIdText.startsWith('category:')) {
      void moveBookmarkToCategory(activeId, overIdText.replace('category:', ''))
      return
    }

    void reorderBookmark(activeId, overIdText)
  }

  function openAddDialog(bookmark?: Bookmark, subCategoryId?: string) {
    setEditingBookmark(bookmark ?? null)
    setDefaultSubCategoryId(subCategoryId)
    setDialogOpen(true)
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-900 text-white">
        <div className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm backdrop-blur-md">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <span>正在加载个性化导航页...</span>
        </div>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={`relative min-h-screen w-full select-none overflow-x-hidden font-sans antialiased ${isDark ? 'dark text-neutral-100' : 'text-neutral-800'}`}>
        {/* Wallpaper background image layer */}
        <div
          className="fixed inset-0 bg-cover bg-center transition-[filter] duration-300 pointer-events-none"
          style={{
            backgroundImage: `url("${settings.wallpaperUrl}")`,
            filter: `blur(${settings.wallpaperBlur}px)`,
          }}
        />

        {/* Wallpaper Dim Overlay */}
        <div
          className="fixed inset-0 bg-black pointer-events-none transition-opacity duration-300"
          style={{
            opacity:
              settings.themeMode === 'dark'
                ? Math.max(0.45, settings.wallpaperDim / 100)
                : settings.wallpaperDim / 100,
          }}
        />

        {/* Top Navbar */}
        <TopNavbar
          avatarUrl={settings.avatarUrl}
          city={settings.weatherCity || '杭州'}
          onUpdateCity={(city) => void updateSettings({ weatherCity: city })}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenProfile={() => setProfileOpen(true)}
        />

        {/* Main Content Area */}
        <main
          className="relative z-10 mx-auto w-full px-3.5 py-3.5 sm:px-6 space-y-3.5 transition-[max-width] duration-200"
          style={{
            maxWidth:
              settings.cardWidth === 0
                ? '100%'
                : `${settings.cardWidth ?? 1380}px`,
          }}
        >
          {/* 1. Search Box */}
          <SearchBar
            ref={searchBarRef}
            engines={SEARCH_ENGINES}
            settings={settings}
            query={searchQuery}
            onChangeQuery={setSearchQuery}
            onSelectEngine={setActiveSearchEngine}
          />

          {/* 2. Top Main Category Card & 7-column Bookmarks Grid */}
          <MainCategoryCard
            categories={categories}
            activeCategoryId={settings.activeCategoryId}
            bookmarks={activeMainBookmarks}
            isSortMode={settings.isSortMode}
            cardOpacity={settings.cardOpacity}
            settings={settings}
            cachedIcons={cachedIcons}
            failedDomains={failedDomains}
            onSaveCachedIcon={(domain, dataOrBlob, objectUrl) => void saveCachedIcon(domain, dataOrBlob, objectUrl)}
            onSaveFailedIcon={(domain) => void saveFailedIcon(domain)}
            onSelectCategory={setActiveCategory}
            onAddCategory={(name) => void addCategory(name)}
            onDeleteCategory={(id) => void deleteCategory(id)}
            onUpdateCategory={(id, updates) => void updateCategory(id, updates)}
            onToggleSortMode={toggleSortMode}
            onOpenAddBookmark={() => openAddDialog()}
            onContextMenuBookmark={(b, x, y) => setContextMenu({ bookmark: b, x, y })}
            onOpenBookmarkStyle={() => setBookmarkStyleOpen(true)}
            onUpdateSettings={updateSettings}
          />

          {/* 3. Bottom Multi-tier Categories Section + Right Widgets Section */}
          {/* z-20 让工具卡片及其上方的猫咪插画盖住上方主分类卡片，避免插画被卡片裁掉 */}
          <div id="tools-section" className="relative z-20">
            <BottomSection
              subSections={subSections}
              subCategories={subCategories}
              activeSubSectionId={settings.activeSubSectionId}
              activeSubCategoryId={settings.activeSubCategoryId}
              bookmarks={bookmarks}
              cachedIcons={cachedIcons}
              failedDomains={failedDomains}
              cardOpacity={settings.cardOpacity}
              settings={settings}
              onSaveCachedIcon={(domain, dataOrBlob, objectUrl) => void saveCachedIcon(domain, dataOrBlob, objectUrl)}
              onSaveFailedIcon={(domain) => void saveFailedIcon(domain)}
              onSelectSubSection={setActiveSubSection}
              onSelectSubCategory={setActiveSubCategory}
              onAddSubSection={(name, icon) => void addSubSection(name, icon)}
              onRenameSubSection={(id, name) => void renameSubSection(id, name)}
              onDeleteSubSection={(id) => void deleteSubSection(id)}
              onAddSubCategory={(secId, name) => void addSubCategory(secId, name)}
              onRenameSubCategory={(id, name) => void renameSubCategory(id, name)}
              onDeleteSubCategory={(id) => void deleteSubCategory(id)}
              onOpenAddBookmark={(subCatId) => openAddDialog(undefined, subCatId)}
              onContextMenuBookmark={(b, x, y) => setContextMenu({ bookmark: b, x, y })}
              memos={memos}
              totpAccounts={totpAccounts}
              onSelectWidgetTab={setActiveWidgetTab}
              onAddMemo={(text) => void addMemo(text)}
              onToggleMemo={(id) => void toggleMemo(id)}
              onDeleteMemo={(id) => void deleteMemo(id)}
              onAddTotp={(name, secret, issuer) =>
                void addTotpAccount(name, secret, issuer)
              }
              onDeleteTotp={(id) => void deleteTotpAccount(id)}
            />
          </div>
        </main>

        {/* Far Right Floating Quick Dock */}
        <FloatingDock
          isSortMode={settings.isSortMode}
          themeMode={settings.themeMode}
          onToggleTheme={() =>
            updateSettings({
              themeMode: settings.themeMode === 'dark' ? 'light' : 'dark',
            })
          }
          onToggleSortMode={toggleSortMode}
          onOpenMemo={() => setActiveWidgetTab('memo')}
          onOpenTools={() => setActiveWidgetTab('tools')}
        />

        {/* Drag Overlay for dragging bookmark item */}
        <DragOverlay>
          {draggingBookmark && (
            <div className="flex h-9 w-44 cursor-grabbing items-center gap-2 rounded-lg border border-blue-400 bg-white px-3 text-xs shadow-2xl">
              <img
                src={faviconFor(draggingBookmark.url, draggingBookmark.iconUrl)}
                alt=""
                className="h-4 w-4 rounded object-contain"
              />
              <span className="truncate font-medium text-neutral-800">
                {draggingBookmark.title}
              </span>
            </div>
          )}
        </DragOverlay>

        {/* Right-click Context Menu */}
        {contextMenu && (
          <BookmarkContextMenu
            bookmark={contextMenu.bookmark}
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onEdit={(b) => {
              openAddDialog(b)
            }}
            onChangeIcon={(b) => {
              setIconPickerBookmark(b)
            }}
            onDelete={(id) => {
              const bm = bookmarks.find((b) => b.id === id)
              if (bm) setDeletingBookmark(bm)
            }}
            onToggleFavorite={(id) => {
              void toggleFavorite(id)
            }}
            onRefreshIcon={(b) => {
              void refreshIcon(hostnameOf(b.url))
            }}
          />
        )}

        {/* Direct Icon Picker Modal */}
        {iconPickerBookmark && (
          <IconPickerModal
            currentIconUrl={iconPickerBookmark.iconUrl}
            onSelectIcon={(url) => {
              void updateBookmark(iconPickerBookmark.id, { iconUrl: url })
              setIconPickerBookmark(null)
            }}
            onClose={() => setIconPickerBookmark(null)}
          />
        )}

        {/* Add / Edit Bookmark Modal */}
        {dialogOpen && (
          <BookmarkDialog
            bookmark={editingBookmark}
            categories={categories}
            subCategories={subCategories}
            defaultCategoryId={settings.activeCategoryId}
            defaultSubCategoryId={defaultSubCategoryId}
            onCancel={() => {
              setDialogOpen(false)
              setDefaultSubCategoryId(undefined)
            }}
            onSubmit={async (values) => {
              if (editingBookmark) {
                await updateBookmark(editingBookmark.id, values)
              } else {
                await addBookmark(values)
              }
            }}
          />
        )}

        {/* Settings Panel Modal */}
        {settingsOpen && (
          <SettingsPanel
            settings={settings}
            onClose={() => setSettingsOpen(false)}
            onChange={updateSettings}
            onClearIconCache={refreshAllIcons}
            sync={{
              config: syncConfig,
              autoSync,
              status: syncStatus,
              message: syncMessage,
              lastSyncedAt,
              localUpdatedAt,
              remoteUpdatedAt,
              onConfigure: configureSync,
              onToggleAuto: setAutoSync,
              onDisconnect: disconnectSync,
              onSyncNow: syncNow,
              onPush: pushToCloud,
              onPull: pullFromCloud,
            }}
          />
        )}

        {/* Profile & Data Management Modal (点击头像打开) */}
        {profileOpen && (
          <ProfileModal
            settings={settings}
            onClose={() => setProfileOpen(false)}
            onChangeSettings={updateSettings}
            onExportBackup={exportBackup}
            onImportBackup={importBackup}
            onResetToDefaults={resetToDefaults}
          />
        )}

        {/* Bookmark Typography & Style Modal (点击卡片三个点打开) */}
        {bookmarkStyleOpen && (
          <BookmarkStyleModal
            settings={settings}
            currentCategory={categories.find((c) => c.id === settings.activeCategoryId)}
            categoryBookmarks={activeMainBookmarks}
            onClose={() => setBookmarkStyleOpen(false)}
            onChangeSettings={updateSettings}
            onRenameCategory={(id, name) => void renameCategory(id, name)}
            onDeleteCategory={(id) => void deleteCategory(id)}
            onRefreshAllIcons={() => void refreshAllIcons()}
          />
        )}

        {/* Delete Bookmark Confirm Modal */}
        <ConfirmModal
          open={Boolean(deletingBookmark)}
          isDanger
          title="删除书签确认"
          message={`确定删除书签「${deletingBookmark?.title}」吗？`}
          confirmText="确认删除"
          onConfirm={() => {
            if (deletingBookmark) {
              void deleteBookmark(deletingBookmark.id)
            }
            setDeletingBookmark(null)
          }}
          onCancel={() => setDeletingBookmark(null)}
        />
      </div>
    </DndContext>
  )
}

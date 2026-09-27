import { SubCategorySection } from './SubCategorySection'
import { WidgetToolsCard } from './WidgetToolsCard'
import type {
  Bookmark,
  Settings,
  SubCategory,
  SubSection,
  TotpItem,
  WidgetTab,
} from '../types'

type Props = {
  subSections: SubSection[]
  subCategories: SubCategory[]
  activeSubSectionId: string
  activeSubCategoryId: string
  bookmarks: Bookmark[]
  cachedIcons?: Record<string, string>
  failedDomains?: Record<string, boolean>
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
  totpAccounts: TotpItem[]
  settings: Settings
  cardOpacity: number
  isSortMode?: boolean
  draggingId?: string | null
  onSelectWidgetTab: (tab: WidgetTab) => void
  onAddTotp: (name: string, secret: string, issuer?: string) => void
  onDeleteTotp: (id: string) => void
  onRecordVisit?: (link: { title: string; url: string; iconUrl?: string }) => void
}

export function BottomSection(props: Props) {
  return (
    <section className="relative mt-4">
      <div className="flex flex-col lg:flex-row gap-3.5 items-start">
        {/* Left: Multi-tier categorized secondary bookmarks */}
        <SubCategorySection
          subSections={props.subSections}
          subCategories={props.subCategories}
          activeSubSectionId={props.activeSubSectionId}
          activeSubCategoryId={props.activeSubCategoryId}
          bookmarks={props.bookmarks}
          cachedIcons={props.cachedIcons}
        failedDomains={props.failedDomains}
        cardOpacity={props.cardOpacity}
        settings={props.settings}
        isSortMode={props.isSortMode}
        draggingId={props.draggingId}
        onSaveCachedIcon={props.onSaveCachedIcon}
        onSaveFailedIcon={props.onSaveFailedIcon}
        onSelectSubSection={props.onSelectSubSection}
          onSelectSubCategory={props.onSelectSubCategory}
          onAddSubSection={props.onAddSubSection}
          onRenameSubSection={props.onRenameSubSection}
          onDeleteSubSection={props.onDeleteSubSection}
          onAddSubCategory={props.onAddSubCategory}
          onRenameSubCategory={props.onRenameSubCategory}
          onDeleteSubCategory={props.onDeleteSubCategory}
          onOpenAddBookmark={props.onOpenAddBookmark}
          onContextMenuBookmark={props.onContextMenuBookmark}
          onRecordVisit={props.onRecordVisit}
        />

        {/* Right: Widget tools (Memo, Calendar, 2FA, QR, Dev tools + cute Cat illustration) */}
        <WidgetToolsCard
          totpAccounts={props.totpAccounts}
          settings={props.settings}
          cardOpacity={props.cardOpacity}
          onSelectWidgetTab={props.onSelectWidgetTab}
          onAddTotp={props.onAddTotp}
          onDeleteTotp={props.onDeleteTotp}
        />
      </div>
    </section>
  )
}

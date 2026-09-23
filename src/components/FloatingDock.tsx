import {
  ArrowUpDown,
  Cloud,
  FileText,
  Moon,
  Sun,
  Wrench,
} from 'lucide-react'

type Props = {
  isSortMode: boolean
  themeMode?: 'light' | 'dark'
  onToggleSortMode: () => void
  onToggleTheme: () => void
  onOpenMemo: () => void
  onOpenTools: () => void
}

export function FloatingDock({
  isSortMode,
  themeMode,
  onToggleSortMode,
  onToggleTheme,
  onOpenMemo,
  onOpenTools,
}: Props) {
  return (
    <aside className="fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-full border border-white/60 dark:border-white/10 bg-white/80 dark:bg-[#18181b]/80 p-1.5 shadow-xl backdrop-blur-md lg:flex">
      {/* Note */}
      <button
        type="button"
        onClick={onOpenMemo}
        title="打开便签"
        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-600 dark:text-neutral-400 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
      >
        <FileText className="h-3.5 w-3.5" />
      </button>

      {/* PikPak Cloud */}
      <a
        href="https://mypikpak.com"
        target="_blank"
        rel="noopener noreferrer"
        title="PikPak 云盘"
        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-600 dark:text-neutral-400 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
      >
        <Cloud className="h-3.5 w-3.5" />
      </a>

      {/* Tools */}
      <button
        type="button"
        onClick={onOpenTools}
        title="开发工具"
        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-600 dark:text-neutral-400 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
      >
        <Wrench className="h-3.5 w-3.5" />
      </button>

      {/* Sort */}
      <button
        type="button"
        onClick={onToggleSortMode}
        title={isSortMode ? '关闭排序' : '打开排序'}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
          isSortMode
            ? 'bg-blue-500 text-white'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
        }`}
      >
        <ArrowUpDown className="h-3.5 w-3.5" />
      </button>

      {/* Theme */}
      <button
        type="button"
        onClick={onToggleTheme}
        title={themeMode === 'dark' ? '切换浅色模式' : '切换深色模式'}
        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-600 dark:text-neutral-400 transition hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
      >
        {themeMode === 'dark' ? (
          <Moon className="h-3.5 w-3.5 text-blue-400" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-amber-500" />
        )}
      </button>
    </aside>
  )
}

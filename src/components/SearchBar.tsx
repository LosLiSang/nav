import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Clock, Search, Settings, Trash2, X } from 'lucide-react'
import { activeEngine } from '../store/useNavStore'
import type { SearchEngine, Settings as AppSettings } from '../types'

type Props = {
  engines: SearchEngine[]
  settings: AppSettings
  query: string
  onChangeQuery: (value: string) => void
  onSelectEngine: (engineId: string) => void
}

export type SearchBarHandle = {
  focus: () => void
}

export const SearchBar = forwardRef<SearchBarHandle, Props>(function SearchBar(
  { engines, settings, query, onChangeQuery, onSelectEngine },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const engine = activeEngine(settings)
  const [showSettings, setShowSettings] = useState(false)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [saveHistory, setSaveHistory] = useState<boolean>(() => {
    const val = localStorage.getItem('nav_save_search_history')
    return val !== 'false'
  })
  const [historyList, setHistoryList] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nav_search_history') || '[]')
    } catch {
      return []
    }
  })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSettings(false)
        setShowHistoryDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus()
    },
  }))

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function selectNextEngine() {
    const index = engines.findIndex((item) => item.id === engine.id)
    const next = engines[(index + 1) % engines.length]
    onSelectEngine(next.id)
  }

  function recordSearch(q: string) {
    if (!saveHistory) return
    const text = q.trim()
    if (!text) return
    setHistoryList((prev) => {
      const next = [text, ...prev.filter((item) => item !== text)].slice(0, 15)
      localStorage.setItem('nav_search_history', JSON.stringify(next))
      return next
    })
  }

  function clearAllHistory() {
    setHistoryList([])
    localStorage.removeItem('nav_search_history')
  }

  function removeHistoryItem(item: string) {
    setHistoryList((prev) => {
      const next = prev.filter((h) => h !== item)
      localStorage.setItem('nav_search_history', JSON.stringify(next))
      return next
    })
  }

  function submit() {
    const text = query.trim()
    if (!text) return
    recordSearch(text)
    setShowHistoryDropdown(false)
    if (/^https?:\/\//i.test(text)) {
      window.open(text, '_blank', 'noopener,noreferrer')
      return
    }
    window.open(
      engine.searchUrl.replace('%s', encodeURIComponent(text)),
      '_blank',
      'noopener,noreferrer',
    )
  }

  function getEngineIcon(id: string) {
    switch (id) {
      case 'google':
        return (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
          </svg>
        )
      case 'bing':
        return (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 fill-[#008373]">
            <path d="M5 2l4.5 1.5v13.5l6-3.5-3-1.5 5.5-5.5-13-4.5z"/>
          </svg>
        )
      case 'baidu':
        return (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 fill-[#2932e1]">
            <path d="M16.5 4.5c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5zm-9 0c.8 0 1.5.7 1.5 1.5S8.3 7.5 7.5 7.5 6 6.8 6 6s.7-1.5 1.5-1.5zM12 2c1 0 1.8.8 1.8 1.8S13 5.6 12 5.6s-1.8-.8-1.8-1.8S11 2 12 2zm7.5 6c.9 0 1.6.7 1.6 1.6s-.7 1.6-1.6 1.6-1.6-.7-1.6-1.6.7-1.6 1.6-1.6zM4.5 8c.9 0 1.6.7 1.6 1.6S5.4 11.2 4.5 11.2 2.9 10.5 2.9 9.6 3.6 8 4.5 8zm7.5 2.8c3.2 0 5.6 2.5 5.6 6.2 0 2.8-2 5-5.6 5-3.6 0-5.6-2.2-5.6-5 0-3.7 2.4-6.2 5.6-6.2zm-2.8 5.6c-.6 0-1 .4-1 1s.4 1 1 1 1-.4 1-1-.4-1-1-1zm5.6 0c-.6 0-1 .4-1 1s.4 1 1 1 1-.4 1-1-.4-1-1-1z"/>
          </svg>
        )
      case 'stackoverflow':
        return (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 fill-[#f48024]">
            <path d="M18.986 21.865v-6.404h2.134V24H2.88v-8.539h2.134v6.404h13.972zM6.111 19.731H17.85v-2.134H6.111v2.134zm.278-4.801l11.496 2.399.497-2.079-11.497-2.399-.496 2.079zm1.758-4.947l10.428 5.679 1.054-1.884-10.428-5.679-1.054 1.884zm3.766-4.665l8.368 8.368 1.51-1.51-8.368-8.368-1.51 1.51zM15.753 1l-1.802 1.144 6.242 10.093 1.802-1.144L15.753 1z"/>
          </svg>
        )
      case 'segmentfault':
        return (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 fill-[#009a61]">
            <path d="M2.5 12c0-5.25 4.25-9.5 9.5-9.5s9.5 4.25 9.5 9.5-4.25 9.5-9.5 9.5-9.5-4.25-9.5-9.5zm8.1 4.8l6.8-6.8-1.4-1.4-5.4 5.4-2.4-2.4-1.4 1.4 3.8 3.8z"/>
          </svg>
        )
      case 'github':
        return (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 fill-neutral-800">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        )
      default:
        return <Search className="h-3 w-3" />
    }
  }

  const cardRadius =
    settings.cornerRadius === 'none'
      ? 'rounded-none'
      : settings.cornerRadius === 'md'
        ? 'rounded-xl'
        : 'rounded-2xl'

  const inputRadius =
    settings.cornerRadius === 'none'
      ? 'rounded-none'
      : settings.cornerRadius === 'md'
        ? 'rounded-lg'
        : 'rounded-xl'

  return (
    <section className={`relative ${showSettings || showHistoryDropdown ? 'z-40' : 'z-30'} border border-neutral-100/90 dark:border-white/10 bg-white/95 dark:bg-[#18181b]/90 p-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)] backdrop-blur-md text-neutral-800 dark:text-neutral-100 ${cardRadius}`}>
      {/* Top row engine tabs */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {engines.map((item) => {
            const isActive = item.id === engine.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectEngine(item.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                  isActive
                    ? 'bg-[#ff6900] text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {getEngineIcon(item.id)}
                <span>{item.name}</span>
              </button>
            )
          })}
        </div>

        <span className="hidden text-xs text-neutral-400 lg:block">
          Tab 切换搜索引擎 · Ctrl+K 聚焦
        </span>
      </div>

      {/* Bottom row search input */}
      <div ref={containerRef} className="relative mt-2.5">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className={`relative flex flex-1 items-center border border-neutral-200/90 dark:border-neutral-700 bg-white dark:bg-[#27272a]/90 shadow-inner transition focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/10 ${inputRadius}`}>
            <div className="pl-3.5 pr-2 text-neutral-400">{getEngineIcon(engine.id)}</div>
            <input
              ref={inputRef}
              value={query}
              onFocus={() => setShowHistoryDropdown(true)}
              onChange={(event) => onChangeQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Tab') {
                  event.preventDefault()
                  selectNextEngine()
                } else if (event.key === 'Escape') {
                  setShowHistoryDropdown(false)
                }
              }}
              placeholder={`在 ${engine.name} 中搜索 ( 试试 Tab 键切换搜索 )`}
              className="min-w-0 flex-1 py-2 text-sm text-neutral-800 dark:text-white outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
            <div className="flex items-center gap-2 pr-3 text-neutral-400">
              <button
                type="button"
                title="搜索设置 (是否保留搜索记录)"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowSettings((prev) => !prev)
                }}
                className={`rounded p-1 transition ${
                  showSettings
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-orange-600'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
                }`}
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={`border border-neutral-200/90 dark:border-neutral-700 bg-neutral-100 dark:bg-[#27272a] px-7 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-200 dark:hover:bg-[#3f3f46] hover:text-neutral-900 dark:hover:text-white ${inputRadius}`}
          >
            搜索
          </button>
        </form>

        {/* Settings Popover for controlling search history */}
        {showSettings && (
          <div className="absolute right-24 top-12 z-50 w-56 rounded-xl border border-neutral-100 dark:border-neutral-800 bg-white dark:bg-[#18181b] p-3 text-xs shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-neutral-800 font-medium text-neutral-800 dark:text-neutral-200">
              <span>搜索记录设置</span>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2.5 space-y-2">
              <label className="flex cursor-pointer items-center justify-between gap-2 text-neutral-700 dark:text-neutral-300">
                <span>保留搜索记录</span>
                <input
                  type="checkbox"
                  checked={saveHistory}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setSaveHistory(checked)
                    localStorage.setItem('nav_save_search_history', String(checked))
                  }}
                  className="h-4 w-4 rounded text-orange-500 accent-orange-500"
                />
              </label>
              {historyList.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearAllHistory()
                    setShowSettings(false)
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 py-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
                >
                  <Trash2 className="h-3.5 w-3.5 text-neutral-400" />
                  <span>清空历史记录 ({historyList.length})</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search History Dropdown */}
        {showHistoryDropdown && saveHistory && historyList.length > 0 && !showSettings && (
          <div className="absolute left-0 right-24 top-12 z-40 max-h-56 overflow-y-auto rounded-xl border border-neutral-100 dark:border-neutral-800 bg-white/95 dark:bg-[#18181b]/95 p-2 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>最近搜索记录</span>
              </span>
              <button
                type="button"
                onClick={clearAllHistory}
                className="hover:text-red-500"
              >
                清空
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 p-1">
              {historyList.map((item) => (
                <div
                  key={item}
                  className="group flex items-center gap-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 px-2.5 py-1 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-orange-50 dark:hover:bg-neutral-700 hover:text-orange-600"
                >
                  <span
                    className="cursor-pointer"
                    onClick={() => {
                      onChangeQuery(item)
                      setShowHistoryDropdown(false)
                      if (/^https?:\/\//i.test(item)) {
                        window.open(item, '_blank', 'noopener,noreferrer')
                      } else {
                        window.open(
                          engine.searchUrl.replace('%s', encodeURIComponent(item)),
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                    }}
                  >
                    {item}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeHistoryItem(item)
                    }}
                    className="text-neutral-400 hover:text-neutral-700"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
})

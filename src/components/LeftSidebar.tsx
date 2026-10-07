 import { useEffect, useRef, useState } from 'react'
 import {
   Clock,
   History,
   Plus,
   Trash2,
   X,
 } from 'lucide-react'
 import { faviconFor } from '../lib/utils'
 import type { RecentVisit, Settings, SuperPinnedLink } from '../types'
 
 type Props = {
   pinnedLinks: SuperPinnedLink[]
   recentVisits: RecentVisit[]
   cardOpacity: number
   settings: Settings
   onAddPinnedLink: (link: { title: string; url: string; iconUrl?: string }) => Promise<void>
   onRemovePinnedLink: (id: string) => Promise<void>
   onRemoveRecentVisit: (id: string) => Promise<void>
   onClearRecentVisits: () => Promise<void>
   onRecordVisit: (link: { title: string; url: string; iconUrl?: string }) => void
 }
 
 export function LeftSidebar({
   pinnedLinks,
   recentVisits,
   cardOpacity,
   settings,
   onAddPinnedLink,
   onRemovePinnedLink,
   onRemoveRecentVisit,
   onClearRecentVisits,
   onRecordVisit,
 }: Props) {
   const isDark = settings.themeMode === 'dark'
   const [showHistory, setShowHistory] = useState(false)
   const [showAddPin, setShowAddPin] = useState(false)
   const [newTitle, setNewTitle] = useState('')
   const [newUrl, setNewUrl] = useState('')
   const historyPanelRef = useRef<HTMLDivElement>(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])
 
   // ----------------- Alt + 1~8 快捷键监听 -----------------
   useEffect(() => {
     function handleKeyDown(e: KeyboardEvent) {
       // 避免在文本输入框中输入时误触发
       const target = e.target as HTMLElement
       if (
         target &&
         (target.tagName === 'INPUT' ||
           target.tagName === 'TEXTAREA' ||
           target.isContentEditable)
       ) {
         return
       }
 
       if (e.altKey && !e.ctrlKey && !e.metaKey && e.key >= '1' && e.key <= '8') {
         const index = Number(e.key) - 1
         const link = pinnedLinks[index]
         if (link) {
           e.preventDefault()
           window.open(link.url, '_blank', 'noopener,noreferrer')
           onRecordVisit({ title: link.title, url: link.url, iconUrl: link.iconUrl })
         }
       }
     }
 
     window.addEventListener('keydown', handleKeyDown)
     return () => window.removeEventListener('keydown', handleKeyDown)
   }, [pinnedLinks, onRecordVisit])
 
   // 点击外部关闭足迹抽屉
   useEffect(() => {
     function handleClickOutside(e: MouseEvent) {
       if (
         historyPanelRef.current &&
         !historyPanelRef.current.contains(e.target as Node)
       ) {
         setShowHistory(false)
       }
     }
     if (showHistory) {
       document.addEventListener('mousedown', handleClickOutside)
     }
     return () => document.removeEventListener('mousedown', handleClickOutside)
   }, [showHistory])
 
   const cardBg = isDark
     ? `rgba(24, 24, 27, ${cardOpacity / 100})`
     : `rgba(255, 255, 255, ${cardOpacity / 100})`
 
   const cardRadius =
     settings.cornerRadius === 'none'
       ? 'rounded-none'
       : settings.cornerRadius === 'md'
         ? 'rounded-2xl'
         : 'rounded-full'
 
   const iconRadius =
     settings.iconShape === 'circle'
       ? 'rounded-full'
       : settings.iconShape === 'square'
         ? 'rounded-lg'
         : 'rounded-xl'
 
  function formatTimeAgo(timestamp: number, now: number) {
    const diff = Math.floor((now - timestamp) / 1000)
     if (diff < 60) return '刚刚'
     if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
     if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
     return `${Math.floor(diff / 86400)} 天前`
   }
 
   function handleAddSubmit() {
     if (!newUrl.trim()) return
     let validUrl = newUrl.trim()
     if (!/^https?:\/\//i.test(validUrl)) {
       validUrl = 'https://' + validUrl
     }
     const title = newTitle.trim() || new URL(validUrl).hostname
     void onAddPinnedLink({ title, url: validUrl })
     setNewTitle('')
     setNewUrl('')
     setShowAddPin(false)
   }
 
   return (
    <aside id="left-dock" className="sticky top-14 hidden shrink-0 lg:flex flex-col items-center gap-3 z-30">
       {/* Pinned Super-Links Dock */}
       <div
         className={`flex flex-col items-center gap-2 p-2 border border-white/60 dark:border-white/10 shadow-2xl backdrop-blur-md transition-all duration-200 ${cardRadius}`}
         style={{ backgroundColor: cardBg }}
       >
         <div className="flex flex-col items-center gap-1.5">
           {pinnedLinks.map((link, index) => {
             const hotkeyLabel = index < 8 ? `Alt+${index + 1}` : undefined
             return (
               <div key={link.id} className="group relative flex items-center justify-center">
                 <a
                   href={link.url}
                   target="_blank"
                   rel="noopener noreferrer"
                   onClick={() => onRecordVisit({ title: link.title, url: link.url, iconUrl: link.iconUrl })}
                   className={`relative flex h-10 w-10 items-center justify-center ${iconRadius} bg-black/[0.03] dark:bg-white/[0.05] p-2 transition-all duration-200 hover:scale-110 hover:bg-black/[0.08] dark:hover:bg-white/[0.12] hover:shadow-lg`}
                 >
                   <img
                     src={faviconFor(link.url, link.iconUrl)}
                     alt=""
                     className="h-5 w-5 object-contain"
                     onError={(e) => {
                       const el = e.currentTarget
                       el.style.display = 'none'
                     }}
                   />
 
                   {/* Hotkey Badge */}
                   {hotkeyLabel && (
                     <span className="absolute -bottom-1 -right-1 flex h-3.5 px-1 items-center justify-center rounded-full bg-neutral-800 dark:bg-neutral-200 text-[9px] font-bold text-white dark:text-neutral-900 shadow">
                       {index + 1}
                     </span>
                   )}
                 </a>
 
                 {/* Hover Tooltip */}
                 <div className="pointer-events-none absolute left-full ml-3 hidden -translate-y-1/2 top-1/2 whitespace-nowrap rounded-xl border border-white/60 dark:border-white/10 bg-white/95 dark:bg-[#18181b]/95 px-3 py-1.5 text-xs shadow-2xl backdrop-blur-md group-hover:flex items-center gap-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                   <span className="font-semibold text-neutral-800 dark:text-neutral-100">{link.title}</span>
                   {hotkeyLabel && (
                     <span className="rounded bg-orange-500/10 dark:bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-mono text-orange-600 dark:text-orange-400">
                       {hotkeyLabel}
                     </span>
                   )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      void onRemovePinnedLink(link.id)
                    }}
                    className="pointer-events-auto text-neutral-400 hover:text-rose-500 transition ml-1"
                    title="从 Dock 移除"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                 </div>
               </div>
             )
           })}
 
           {/* Add Pin Button */}
           <button
             type="button"
             onClick={() => setShowAddPin(!showAddPin)}
             title="添加超频常驻站点"
             className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
           >
             <Plus className="h-4 w-4" />
           </button>
         </div>
 
         {/* Subtle Divider */}
         <div className="h-px w-6 bg-black/10 dark:bg-white/10 my-0.5" />
 
         {/* History Toggle Button */}
         <div className="relative">
           <button
             type="button"
             onClick={() => setShowHistory(!showHistory)}
             title="近期访问足迹"
             className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
               showHistory
                 ? 'bg-blue-500 text-white shadow-md'
                 : 'text-neutral-600 dark:text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-neutral-900 dark:hover:text-white'
             }`}
           >
             <History className="h-4 w-4" />
             {recentVisits.length > 0 && (
               <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white shadow">
                 {recentVisits.length}
               </span>
             )}
           </button>
 
           {/* History Expandable Flyout */}
           {showHistory && (
             <div
               ref={historyPanelRef}
               className="absolute left-full ml-3.5 top-0 w-72 rounded-2xl border border-white/60 dark:border-white/10 bg-white/95 dark:bg-[#18181b]/95 p-3.5 text-xs shadow-2xl backdrop-blur-md z-50 animate-in fade-in slide-in-from-left-2 duration-150"
             >
               <div className="flex items-center justify-between pb-2.5 border-b border-black/5 dark:border-white/10">
                 <div className="flex items-center gap-1.5 font-semibold text-neutral-800 dark:text-neutral-200">
                   <Clock className="h-3.5 w-3.5 text-blue-500" />
                   <span>近期足迹</span>
                 </div>
                 <button
                   type="button"
                   onClick={() => setShowHistory(false)}
                   className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                 >
                   <X className="h-3.5 w-3.5" />
                 </button>
               </div>
 
               <div className="my-2.5 max-h-72 overflow-y-auto space-y-1">
                 {recentVisits.length === 0 ? (
                   <div className="py-6 text-center text-neutral-400 text-xs">
                     暂无近期足迹，点击书签后会自动沉淀在此
                   </div>
                 ) : (
                   recentVisits.map((item) => (
                     <div
                       key={item.id}
                       className="group flex items-center justify-between gap-2 rounded-xl p-2 transition hover:bg-black/5 dark:hover:bg-white/5"
                     >
                       <a
                         href={item.url}
                         target="_blank"
                         rel="noopener noreferrer"
                         onClick={() => onRecordVisit(item)}
                         className="flex flex-1 items-center gap-2 min-w-0"
                       >
                         <img
                           src={faviconFor(item.url, item.iconUrl)}
                           alt=""
                           className="h-4 w-4 shrink-0 rounded object-contain"
                         />
                         <div className="min-w-0 flex-1">
                           <div className="truncate font-medium text-neutral-800 dark:text-neutral-200 group-hover:text-blue-500">
                             {item.title}
                           </div>
                           <div className="text-[10px] text-neutral-400">
                            {formatTimeAgo(item.visitedAt, currentTime)}
                           </div>
                         </div>
                       </a>
                       <button
                         type="button"
                         onClick={() => onRemoveRecentVisit(item.id)}
                         className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-rose-500 transition"
                         title="移除此记录"
                       >
                         <X className="h-3 w-3" />
                       </button>
                     </div>
                   ))
                 )}
               </div>
 
               {recentVisits.length > 0 && (
                 <div className="flex justify-between items-center pt-2 border-t border-black/5 dark:border-white/10 text-[11px]">
                   <span className="text-neutral-400">最多保留 10 条</span>
                   <button
                     type="button"
                     onClick={onClearRecentVisits}
                     className="flex items-center gap-1 text-rose-500 hover:text-rose-600 transition"
                   >
                     <Trash2 className="h-3 w-3" />
                     <span>清空足迹</span>
                   </button>
                 </div>
               )}
             </div>
           )}
         </div>
       </div>
 
       {/* Add Pin Modal */}
       {showAddPin && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
           <div className="nav-dialog w-full max-w-xs rounded-2xl bg-white dark:bg-[#18181b] p-5 shadow-2xl border border-neutral-100 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200">
             <h3 className="font-semibold text-sm mb-3">添加常驻应用 Dock</h3>
             <div className="space-y-2.5 text-xs">
               <div>
                 <label className="text-[11px] text-neutral-400 block mb-1">站点名称</label>
                 <input
                   placeholder="如: GitHub / Gmail"
                   value={newTitle}
                   onChange={(e) => setNewTitle(e.target.value)}
                   className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent px-3 py-2 outline-none text-neutral-800 dark:text-neutral-100 focus:border-blue-500"
                 />
               </div>
               <div>
                 <label className="text-[11px] text-neutral-400 block mb-1">站点网址</label>
                 <input
                   placeholder="https://..."
                   value={newUrl}
                   onChange={(e) => setNewUrl(e.target.value)}
                   className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-transparent px-3 py-2 outline-none text-neutral-800 dark:text-neutral-100 focus:border-blue-500"
                 />
               </div>
             </div>
             <div className="mt-4 flex justify-end gap-2 text-xs">
               <button
                 type="button"
                 onClick={() => setShowAddPin(false)}
                 className="rounded-xl px-3 py-1.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
               >
                 取消
               </button>
               <button
                 type="button"
                 disabled={!newUrl.trim()}
                 onClick={handleAddSubmit}
                 className="rounded-xl bg-blue-500 px-4 py-1.5 font-medium text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
               >
                 添加
               </button>
             </div>
           </div>
         </div>
       )}
     </aside>
   )
 }

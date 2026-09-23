import { createPortal } from 'react-dom'
import { useState } from 'react'
import { AlertTriangle, Check, Database, Download, RefreshCw, Upload, User, X } from 'lucide-react'
import type { NavData, Settings } from '../types'

type Props = {
  settings: Settings
  onClose: () => void
  onChangeSettings: (values: Partial<Settings>) => void
  onExportBackup: () => Promise<NavData>
  onImportBackup: (data: Partial<NavData>) => Promise<void>
  onResetToDefaults: () => Promise<void>
}

type TabType = 'profile' | 'data'

const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=star&backgroundColor=ffd5dc',
  'https://api.dicebear.com/7.x/bottts/svg?seed=ideal&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/cyber&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/bottts/svg?seed=spark&backgroundColor=d1d4f9',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/notionists/svg?seed=Lucky&backgroundColor=ffd5dc',
  'https://api.dicebear.com/7.x/notionists/svg?seed=Oliver&backgroundColor=c0aede',
]

export function ProfileModal({
  settings,
  onClose,
  onChangeSettings,
  onExportBackup,
  onImportBackup,
  onResetToDefaults,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const [customAvatar, setCustomAvatar] = useState(settings.avatarUrl || AVATAR_PRESETS[0])
  const [userName, setUserName] = useState(settings.userName || 'Nav 探索者')
  const [importing, setImporting] = useState(false)
  const [showConfirmReset, setShowConfirmReset] = useState(false)

  async function handleExport() {
    const data = await onExportBackup()
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nav-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(file: File) {
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const json = JSON.parse(String(reader.result))
        await onImportBackup(json)
        alert('数据恢复成功！')
        onClose()
      } catch {
        alert('解析备份文件失败，请检查文件格式！')
      } finally {
        setImporting(false)
      }
    }
    reader.readAsText(file)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 shadow-2xl max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 border border-neutral-200/80 dark:border-neutral-800">
        
        {/* Fixed Header */}
        <div className="p-6 pb-3 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
                <User className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">个人中心与数据</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 transition"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Segmented Control / Tabs */}
          <div className="flex rounded-xl bg-neutral-100 dark:bg-neutral-800 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition ${
                activeTab === 'profile'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <User className="h-4 w-4 text-orange-500" />
              个人资料
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('data')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 font-medium transition ${
                activeTab === 'data'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              <Database className="h-4 w-4 text-blue-500" />
              数据备份
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {activeTab === 'profile' ? (
            <>
              {/* Avatar & Nickname */}
              <div>
                <label className="block font-medium text-neutral-800 dark:text-neutral-200 mb-2">
                  头像与昵称
                </label>
                <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50/50 dark:bg-neutral-800/40">
                  <img
                    src={customAvatar}
                    alt="Avatar"
                    className="h-14 w-14 rounded-full border-2 border-white dark:border-neutral-700 shadow object-cover flex-shrink-0"
                  />
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={userName}
                      onChange={(e) => {
                        setUserName(e.target.value)
                        onChangeSettings({ userName: e.target.value })
                      }}
                      placeholder="输入昵称"
                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-800 dark:text-neutral-200 outline-none focus:border-orange-500"
                    />
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500 block">
                      用于主页顶部问候与个性化标识
                    </span>
                  </div>
                </div>

                {/* Avatar Presets */}
                <div className="mt-3">
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2 block font-medium">选择预设头像：</span>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_PRESETS.map((preset) => {
                      const isSelected = (settings.avatarUrl || AVATAR_PRESETS[0]) === preset
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setCustomAvatar(preset)
                            onChangeSettings({ avatarUrl: preset })
                          }}
                          className={`relative h-9 w-9 rounded-full overflow-hidden border-2 transition ${
                            isSelected
                              ? 'border-orange-500 ring-2 ring-orange-500/30 scale-105'
                              : 'border-white dark:border-neutral-700 hover:opacity-80 shadow-sm'
                          }`}
                        >
                          <img src={preset} alt="" className="h-full w-full object-cover" />
                          {isSelected && (
                            <div className="absolute inset-0 bg-orange-500/30 flex items-center justify-center">
                              <Check className="h-3 w-3 text-white stroke-[3]" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Custom Avatar URL */}
                <div className="mt-3 space-y-1">
                  <label className="text-[11px] text-neutral-500 dark:text-neutral-400 block font-medium">
                    自定义头像链接：
                  </label>
                  <input
                    value={customAvatar}
                    onChange={(e) => {
                      setCustomAvatar(e.target.value)
                      onChangeSettings({ avatarUrl: e.target.value })
                    }}
                    placeholder="输入自定义头像图片链接 (https://...)"
                    className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2 text-xs outline-none focus:border-orange-500 focus:bg-white dark:focus:bg-neutral-900"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Full Data Management */}
              <div className="space-y-4">
                <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800/60 p-3.5 border border-neutral-200/80 dark:border-neutral-700/80">
                  <p className="leading-relaxed text-neutral-500 dark:text-neutral-400 text-[11px]">
                    您的书签、分类、便签和设置全部存储在本地浏览器的 IndexedDB 中。建议定期导出备份文件，以防清理浏览器缓存或重装系统时数据丢失。
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block font-medium text-neutral-800 dark:text-neutral-200">
                    备份与恢复
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={handleExport}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80 py-2.5 font-medium text-neutral-700 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <Download className="h-4 w-4 text-blue-500" />
                      <span>导出备份 (JSON)</span>
                    </button>

                    <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/80 py-2.5 font-medium text-neutral-700 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-50 dark:hover:bg-neutral-800">
                      <Upload className="h-4 w-4 text-emerald-500" />
                      <span>{importing ? '恢复中...' : '导入恢复备份'}</span>
                      <input
                        type="file"
                        accept=".json"
                        className="hidden"
                        disabled={importing}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleImportFile(file)
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Reset Defaults */}
                <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
                  <label className="block font-medium text-neutral-800 dark:text-neutral-200 mb-2">
                    危险操作
                  </label>
                  {!showConfirmReset ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmReset(true)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200/80 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/30 py-2.5 text-xs text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/50 font-medium"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>恢复系统出厂初始默认数据</span>
                    </button>
                  ) : (
                    <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/40 p-3.5">
                      <div className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400 text-xs">
                        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                        <span>确定要重置吗？这将覆盖现有所有书签和设置！</span>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowConfirmReset(false)}
                          className="rounded-lg bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await onResetToDefaults()
                            setShowConfirmReset(false)
                            alert('已恢复为初始数据！')
                            onClose()
                          }}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 shadow-sm"
                        >
                          确认重置
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Fixed Footer */}
        <div className="flex justify-end border-t border-neutral-100 dark:border-neutral-800 px-6 py-3.5 bg-neutral-50/50 dark:bg-neutral-900/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-neutral-900 dark:bg-neutral-800 px-5 py-2 font-medium text-white dark:text-neutral-100 shadow-sm hover:bg-neutral-800 dark:hover:bg-neutral-700 transition border border-transparent dark:border-neutral-700"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  , document.body)
}

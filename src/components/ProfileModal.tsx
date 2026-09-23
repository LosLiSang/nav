import { useState } from 'react'
import { AlertTriangle, Check, Download, RefreshCw, Upload, User, X } from 'lucide-react'
import type { NavData, Settings } from '../types'

type Props = {
  settings: Settings
  onClose: () => void
  onChangeSettings: (values: Partial<Settings>) => void
  onExportBackup: () => Promise<NavData>
  onImportBackup: (data: Partial<NavData>) => Promise<void>
  onResetToDefaults: () => Promise<void>
}

const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=star&backgroundColor=ffd5dc',
  'https://api.dicebear.com/7.x/bottts/svg?seed=ideal&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/bottts/svg?seed=cyber&backgroundColor=c0aede',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 p-6 text-neutral-800 dark:text-neutral-200 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
              <User className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">个人中心与数据管理</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5 text-xs">
          {/* 1. Avatar & Nickname */}
          <div>
            <label className="block font-medium text-neutral-800 dark:text-neutral-200 mb-2.5">
              个人头像与昵称
            </label>
            <div className="flex items-center gap-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700 p-3 bg-neutral-50/50 dark:bg-neutral-800/40">
              <img
                src={customAvatar}
                alt="Avatar"
                className="h-14 w-14 rounded-full border-2 border-white shadow object-cover flex-shrink-0"
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
            <div className="mt-2.5">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5 block">选择预设头像：</span>
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
                          : 'border-white hover:opacity-80 shadow-sm'
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
            <div className="mt-2.5">
              <input
                value={customAvatar}
                onChange={(e) => {
                  setCustomAvatar(e.target.value)
                  onChangeSettings({ avatarUrl: e.target.value })
                }}
                placeholder="或者输入自定义头像图片链接 (https://...)"
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2.5 py-1.5 text-xs outline-none focus:border-orange-500 focus:bg-white"
              />
            </div>
          </div>

          {/* 2. Full Data Management */}
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-4">
            <label className="block font-medium text-neutral-800 dark:text-neutral-200 mb-2">
              数据导入、导出与安全备份
            </label>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mb-3">
              您的书签、分类、便签和设置全部存储在本地浏览器的 IndexedDB 中。建议定期备份以防清理浏览器缓存时丢失。
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 py-2.5 font-medium text-neutral-700 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Download className="h-4 w-4 text-blue-500" />
                <span>导出全部备份 (JSON)</span>
              </button>

              <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 py-2.5 font-medium text-neutral-700 dark:text-neutral-200 shadow-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800">
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

            {/* Reset Defaults */}
            <div className="mt-3">
              {!showConfirmReset ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-100 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/40 py-2 text-xs text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>恢复系统出厂初始默认数据</span>
                </button>
              ) : (
                <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3">
                  <div className="flex items-center gap-1.5 font-medium text-red-800 text-xs">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                    <span>确定要重置吗？这将覆盖现有所有书签和设置！</span>
                  </div>
                  <div className="mt-2.5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowConfirmReset(false)}
                      className="rounded-lg bg-white dark:bg-neutral-900 px-3 py-1 text-xs text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
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
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                    >
                      确认重置
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-neutral-100 dark:border-neutral-800 pt-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-neutral-900 px-5 py-2 font-medium text-white shadow-sm hover:bg-neutral-800"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

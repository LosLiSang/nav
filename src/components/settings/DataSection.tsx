import { useState } from 'react'
import { AlertTriangle, Download, Loader2, RefreshCw, Upload } from 'lucide-react'
import type { Bookmark, Category, NavData } from '../../types'
import { Group, Row } from './ui'
import { SECONDARY_BUTTON } from './styles'

export type DataActions = {
  onExportBackup: () => Promise<NavData>
  onImportBackup: (data: Partial<NavData>) => Promise<void>
  onResetToDefaults: () => Promise<void>
  /** 当前选中的主分类，用于「导出此分类」 */
  currentCategory?: Category
  categoryBookmarks?: Bookmark[]
}

function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function DataSection({
  onExportBackup,
  onImportBackup,
  onResetToDefaults,
  currentCategory,
  categoryBookmarks = [],
  onDone,
}: DataActions & { onDone: () => void }) {
  const [importing, setImporting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  async function handleExport() {
    downloadJson(await onExportBackup(), `nav-backup-${new Date().toISOString().slice(0, 10)}.json`)
  }

  function handleImport(file: File) {
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await onImportBackup(JSON.parse(String(reader.result)))
        alert('数据恢复成功！')
        onDone()
      } catch {
        alert('解析备份文件失败，请检查文件格式！')
      } finally {
        setImporting(false)
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <Group
        title="备份与恢复"
        footer="书签、分类、便签和设置都保存在本浏览器的 IndexedDB 中。建议定期导出备份，以防清理缓存或重装系统时丢失。"
      >
        <Row label="导出备份" hint="下载包含全部数据的 JSON 文件">
          <button type="button" onClick={() => void handleExport()} className={SECONDARY_BUTTON}>
            <Download className="h-3.5 w-3.5" />
            导出…
          </button>
        </Row>
        {currentCategory && (
          <Row label={`导出「${currentCategory.name}」`} hint={`仅导出当前分类的 ${categoryBookmarks.length} 个网址`}>
            <button
              type="button"
              onClick={() => downloadJson(categoryBookmarks, `${currentCategory.name}-bookmarks.json`)}
              className={SECONDARY_BUTTON}
            >
              <Download className="h-3.5 w-3.5" />
              导出…
            </button>
          </Row>
        )}
        <Row label="导入恢复备份" hint="会覆盖当前数据">
          <label className={`${SECONDARY_BUTTON} cursor-pointer`}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {importing ? '恢复中…' : '选择文件…'}
            <input
              type="file"
              accept=".json"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleImport(file)
                e.target.value = ''
              }}
            />
          </label>
        </Row>
      </Group>

      <Group title="还原">
        {!confirmReset ? (
          <Row label="恢复出厂默认数据" hint="清空现有书签和设置，换成初始示例数据">
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className={`${SECONDARY_BUTTON} !text-red-600 dark:!text-red-400`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              还原…
            </button>
          </Row>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
            <div className="flex items-center gap-2 text-[13px] text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              确定要重置吗？这会覆盖现有所有书签和设置。
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmReset(false)} className={SECONDARY_BUTTON}>
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onResetToDefaults()
                  setConfirmReset(false)
                  alert('已恢复为初始数据！')
                  onDone()
                }}
                className="rounded-md bg-red-600 px-3 py-1 text-[13px] font-medium text-white shadow-sm hover:bg-red-700"
              >
                确认重置
              </button>
            </div>
          </div>
        )}
      </Group>
    </>
  )
}

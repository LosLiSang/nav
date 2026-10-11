import { useNavStore } from '../store/useNavStore'

export function WorkbenchSyncStatus() {
  const { syncConfig, workbenchStatus, workbenchMessage, syncWorkbench } = useNavStore()
  if (!syncConfig) return null
  const conflict = workbenchStatus === 'conflict'
  const failed = conflict || workbenchStatus === 'error'
  return (
    <div data-testid="workbench-sync-status" role={failed ? 'alert' : 'status'}
      className={`rounded-xl border p-3 text-xs ${failed
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
        : 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300'}`}>
      <p className="font-medium">便签与共享剪贴板 · 独立同步</p>
      <p className="mt-1 break-words">{workbenchMessage || '在本机编辑；重新获得焦点时更新云端内容'}</p>
      {failed && <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-current px-2 py-1"
          onClick={() => void syncWorkbench()}>重试同步</button>
        {conflict && <>
          <button type="button" className="rounded-lg border border-current px-2 py-1" onClick={() => {
            if (window.confirm('将本机尚未同步的便签/草稿保存到云端，覆盖这些记录的云端版本？已删除的便签不会复活。')) void syncWorkbench('local')
          }}>保留本机修改</button>
          <button type="button" className="rounded-lg border border-current px-2 py-1" onClick={() => {
            if (window.confirm('丢弃本机尚未同步的便签和草稿修改，采用云端版本？请先复制需要保留的文字。')) void syncWorkbench('remote')
          }}>采用云端版本</button>
        </>}
      </div>}
    </div>
  )
}

import { Cloud, CloudAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-react'
import { useNavStore } from '../store/useNavStore'

type Tone = 'pending' | 'syncing' | 'failed' | 'synced'

/** 把独立同步状态映射为三色语义；未开始/未确认的状态是中性灰，绝不显示绿色。 */
function useWorkbenchSyncView() {
  const syncConfig = useNavStore(s => s.syncConfig)
  const workbenchStatus = useNavStore(s => s.workbenchStatus)
  const workbenchMessage = useNavStore(s => s.workbenchMessage)
  const backendUpgradeRequired = useNavStore(s => s.backendUpgradeRequired)
  const conflict = workbenchStatus === 'conflict'
  const failed = conflict || workbenchStatus === 'error' || backendUpgradeRequired
  // 重试期间（含后端待升级时的重试）显示黄色同步中，结束后再落到红/绿。
  const tone: Tone = workbenchStatus === 'syncing' ? 'syncing'
    : failed ? 'failed'
    : workbenchStatus === 'synced' ? 'synced'
    : 'pending'
  const label = tone === 'syncing' ? '正在同步' : conflict ? '同步冲突' : failed ? '同步失败'
    : tone === 'synced' ? '同步成功' : '尚未同步'
  return { configured: Boolean(syncConfig), tone, label, conflict, failed: tone === 'failed', backendUpgradeRequired,
    message: workbenchMessage || '在本机编辑；重新获得焦点时更新云端内容' }
}

const ICON_TONE: Record<Tone, string> = {
  syncing: 'text-amber-500 dark:text-amber-400',
  failed: 'text-red-600 dark:text-red-400',
  synced: 'text-emerald-600 dark:text-emerald-400',
  pending: 'text-neutral-400 dark:text-neutral-500',
}

/** 右侧栏紧凑同步图标：颜色表达状态，悬停/聚焦给出文字，点击展开详情。 */
export function WorkbenchSyncIcon({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const view = useWorkbenchSyncView()
  if (!view.configured) return null
  const Icon = view.tone === 'failed' ? (view.backendUpgradeRequired ? CloudOff : CloudAlert)
    : view.tone === 'syncing' ? RefreshCw
    : view.tone === 'synced' ? CloudCheck : Cloud
  const name = `便签与共享剪贴板：${view.label}`
  return (
    <button type="button" data-testid="workbench-sync-icon" data-sync-tone={view.tone}
      aria-label={`${name}，点击${expanded ? '收起' : '查看'}详情`} aria-expanded={expanded} aria-controls="workbench-sync-details"
      title={`${name}\n${view.message}`} onClick={onToggle}
      className={`group/sync relative flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-black/5 dark:hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-orange-500 ${ICON_TONE[view.tone]}`}>
      <Icon aria-hidden className={`h-4 w-4 ${view.tone === 'syncing' ? 'animate-spin [animation-duration:1.6s]' : ''}`} />
      {/* 悬停/键盘聚焦显示状态文字，不只依赖颜色辨认。 */}
      <span data-testid="workbench-sync-tip" aria-hidden className="pointer-events-none absolute right-0 top-full z-40 mt-1 hidden whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg group-hover/sync:block group-focus-visible/sync:block dark:bg-neutral-100 dark:text-neutral-900">
        {view.label}
      </span>
    </button>
  )
}

/** 详情与处理入口：错误、冲突、后端升级提示以及重试/冲突选择。设置页常驻展示，侧栏点击图标后展示。 */
export function WorkbenchSyncStatus() {
  const syncWorkbench = useNavStore(s => s.syncWorkbench)
  const view = useWorkbenchSyncView()
  if (!view.configured) return null
  return (
    <div data-testid="workbench-sync-status" data-sync-tone={view.tone} role={view.failed ? 'alert' : 'status'}
      className={`rounded-xl border p-3 text-xs ${view.failed
        ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200'
        : 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300'}`}>
      <p className="flex items-center gap-1.5 font-medium">
        <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${view.tone === 'failed' ? 'bg-red-500' : view.tone === 'syncing' ? 'bg-amber-400' : view.tone === 'synced' ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
        便签与共享剪贴板 · {view.label}
      </p>
      {view.backendUpgradeRequired && <p data-testid="backend-upgrade-required" className="mt-1 font-semibold">需要后端升级 · 整页上传已暂停</p>}
      <p className="mt-1 break-words">{view.message}</p>
      {view.failed && <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-current px-2 py-1"
          onClick={() => void syncWorkbench()}>重试同步</button>
        {view.conflict && <>
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

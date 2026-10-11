import { ApiError, apiRequest } from './auth'
import { db } from './db'
import type { MemoItem } from '../types'
import type { SyncConfig } from './sync'

type RemoteMemo = MemoItem & { updatedAt: number }
type RemoteClipboard = { content: string; updatedAt: number }
export type WorkbenchResolution = 'local' | 'remote'

/** 每条记录单独 CAS。失败保留 dirty；请求期间的新编辑不会被旧响应覆盖。 */
export async function synchronizeWorkbench(config: SyncConfig, resolution?: WorkbenchResolution) {
  const request = <T>(path: string, method = 'GET', body?: unknown) =>
    apiRequest<T>(config.url, path, { token: config.token, method, body })
  const cursorKey = `nav_workbench_cursor:${db.name}`
  const cursor = resolution ? 0 : Number(localStorage.getItem(cursorKey) || 0)
  const remote = await request<{ memos: RemoteMemo[]; cursor: number }>(`/api/memos?since=${cursor}`)
  const map = new Map(remote.memos.map(m => [m.id, m]))
  const locals = await db.memos.toArray()
  for (const local of locals) {
    const cloud = map.get(local.id)
    const dirty = local.dirty || local.updatedAt === undefined
    if (resolution === 'remote' && dirty && !cloud) {
      await db.memos.delete(local.id)
      continue
    }
    if (dirty && resolution !== 'remote') {
      // 历史本地记录只导入缺失项，已有云端版本（含墓碑）优先。
      if (local.updatedAt === undefined && cloud && !local.dirty) {
        await db.memos.put({ ...cloud, dirty: false })
        continue
      }
      const expected = resolution === 'local' ? cloud?.updatedAt ?? 0 : local.updatedAt ?? 0
      if (cloud?.deletedAt && !local.deletedAt) {
        throw new ApiError(409, 'memo_deleted', '便签已在其他设备删除；请选择采用云端，或复制文字后新建')
      }
      const identical = cloud && cloud.text === local.text && cloud.done === local.done && Boolean(cloud.deletedAt) === Boolean(local.deletedAt)
      const saved = identical ? { memo: cloud } : await request<{ memo: RemoteMemo }>(`/api/memos/${encodeURIComponent(local.id)}`,
        local.deletedAt ? 'DELETE' : 'PUT',
        { text: local.text, done: local.done, createdAt: local.createdAt, expectedUpdatedAt: expected })
      await db.transaction('rw', db.memos, async () => {
        const current = await db.memos.get(local.id)
        if (!current) return
        const unchanged = JSON.stringify(current) === JSON.stringify(local)
        await db.memos.put(unchanged ? { ...saved.memo, dirty: false } : { ...current, updatedAt: saved.memo.updatedAt, dirty: true })
      })
      map.delete(local.id)
    }
  }
  await db.transaction('rw', db.memos, async () => {
    for (const cloud of map.values()) {
      const local = await db.memos.get(cloud.id)
      if (local?.dirty && resolution !== 'remote') continue
      await db.memos.put({ ...cloud, dirty: false })
    }
  })

  const local = await db.scratchpad.get('default')
  const cloud = await request<RemoteClipboard>('/api/clipboard')
  if ((local?.dirty || (local?.remoteUpdatedAt === undefined && local?.content)) && resolution !== 'remote') {
    const expected = resolution === 'local' ? cloud.updatedAt : local.remoteUpdatedAt ?? 0
    const saved = cloud.content === local.content ? cloud : await request<RemoteClipboard>('/api/clipboard', 'PUT', { content: local.content, expectedUpdatedAt: expected })
    await db.transaction('rw', db.scratchpad, async () => {
      const current = await db.scratchpad.get('default')
      if (!current) return
      const unchanged = current.updatedAt === local.updatedAt && current.content === local.content
      await db.scratchpad.put(unchanged
        ? { id: 'default', ...saved, remoteUpdatedAt: saved.updatedAt, dirty: false }
        : { ...current, remoteUpdatedAt: saved.updatedAt, dirty: true })
    })
  } else {
    await db.transaction('rw', db.scratchpad, async () => {
      const current = await db.scratchpad.get('default')
      if (current?.dirty && resolution !== 'remote') return
      await db.scratchpad.put({ id: 'default', ...cloud, remoteUpdatedAt: cloud.updatedAt, dirty: false })
    })
  }
  const [memos, clipboard] = await Promise.all([db.memos.toArray(), db.scratchpad.get('default')])
  localStorage.setItem(cursorKey, String(remote.cursor))
  return { memos: memos.filter(m => !m.deletedAt).sort((a, b) => b.createdAt - a.createdAt),
    content: clipboard?.content ?? '', pending: memos.some(m => m.dirty) || Boolean(clipboard?.dirty) }
}

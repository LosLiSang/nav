import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CheckCircle2, Circle, ExternalLink, FileEdit, Target, Trash2 } from 'lucide-react'
import type { MemoItem } from '../types'

/** 只提供显式 http(s) 链接；不把任意文字或 javascript/data 协议变成导航。 */
function firstHttpLink(text: string): string | null {
  const candidates = text.matchAll(/https?:\/\/[^\s<>"'`，。；、！？（）【】「」《》]+/gi)
  for (const match of candidates) {
    let candidate = match[0].replace(/[.,;:!?]+$/, '')
    // 去除包裹网址的右括号，但保留 Wikipedia 等 URL 内的平衡括号。
    for (const [left, right] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      let excess = candidate.split(right).length - candidate.split(left).length
      while (excess > 0 && candidate.endsWith(right)) {
        candidate = candidate.slice(0, -1)
        excess--
      }
    }
    candidate = candidate.replace(/[.,;:!?]+$/, '')
    try {
      const url = new URL(candidate)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname) return url.href
    } catch { /* 无效候选不妨碍后续有效链接 */ }
  }
  return null
}

type Props = {
  memo: MemoItem
  timeLabel: string
  onToggle: (id: string) => Promise<void> | void
  onUpdate: (id: string, text: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
  onFocus: (id: string) => void
}

export function MemoRow({ memo, timeLabel, onToggle, onUpdate, onDelete, onFocus }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(memo.text)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const editor = useRef<HTMLTextAreaElement | null>(null)
  const editingRef = useRef(false)
  const savingRef = useRef(false)
  const draftRef = useRef(memo.text)
  const mounted = useRef(false)
  const link = firstHttpLink(memo.text)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; editingRef.current = false }
  }, [])
  useLayoutEffect(() => {
    if (!editing || !editor.current) return
    editor.current.focus()
    editor.current.select()
  }, [editing])
  useLayoutEffect(() => {
    if (!editing || !editor.current) return
    editor.current.style.height = 'auto'
    editor.current.style.height = `${Math.min(160, Math.max(32, editor.current.scrollHeight))}px`
    // 展开编辑器/错误提示后把整行带回列表可见范围，避免底部帮助文字被截断。
    editor.current.closest('[data-memo-id]')?.scrollIntoView({ block: 'nearest' })
  }, [editing, draft, error])

  function beginEditing() {
    if (savingRef.current || editingRef.current) return
    draftRef.current = memo.text
    setDraft(memo.text)
    setError('')
    editingRef.current = true
    setEditing(true)
  }
  function cancel() {
    if (savingRef.current) return
    editingRef.current = false
    setEditing(false)
    setError('')
  }
  async function save() {
    if (!editingRef.current || savingRef.current) return
    const text = draftRef.current.trim()
    if (!text || text === memo.text) { cancel(); return }
    // Enter 可能紧接 blur；同步门闩避免重复持久化与上传。
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await onUpdate(memo.id, text)
      if (!mounted.current) return
      editingRef.current = false
      setEditing(false)
    } catch {
      if (mounted.current) setError('保存失败，草稿已保留。请再次按 Enter 重试，或按 Esc 取消。')
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <div data-memo-id={memo.id} aria-busy={saving} className="group flex items-start justify-between gap-2 rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-2.5 transition hover:bg-black/[0.05] dark:hover:bg-white/[0.05]">
      <button type="button" role="checkbox" aria-checked={memo.done} aria-label="切换便签完成状态" title={memo.done ? '标记为未完成' : '标记为已完成'} onClick={() => void onToggle(memo.id)} className="mt-0.5 shrink-0 rounded text-neutral-400 hover:text-orange-500 focus-visible:outline-2 focus-visible:outline-orange-500">
        {memo.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <>
            <textarea
              ref={editor}
              data-testid="memo-editor"
              aria-label="编辑便签内容"
              aria-describedby={`memo-edit-help-${memo.id}`}
              rows={1}
              value={draft}
              readOnly={saving}
              onChange={e => { draftRef.current = e.target.value; setDraft(e.target.value) }}
              onKeyDown={e => {
                if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); void save() }
              }}
              onBlur={() => void save()}
              className="block w-full max-h-40 resize-none select-text rounded-lg border border-orange-500 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs leading-relaxed text-neutral-800 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-orange-500/20 read-only:opacity-60"
            />
            <p id={`memo-edit-help-${memo.id}`} className="mt-1 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">{saving ? '正在保存…' : 'Enter 保存 · Esc 取消 · Shift+Enter 换行'}</p>
            {error && <p role="alert" className="mt-1 text-[11px] leading-relaxed text-red-700 dark:text-red-400">{error}</p>}
          </>
        ) : (
          <div data-testid="memo-body" onDoubleClick={beginEditing} className={`cursor-text select-text whitespace-pre-wrap [overflow-wrap:anywhere] text-xs leading-relaxed ${memo.done ? 'line-through text-neutral-500 dark:text-neutral-400' : 'font-medium text-neutral-800 dark:text-neutral-100'}`}>
            {memo.text}
          </div>
        )}
        <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">{timeLabel}</div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        {link && !editing && <a data-testid="memo-open" aria-label="打开便签链接" title="打开第一个链接（新标签页）" href={link} target="_blank" rel="noopener noreferrer" className="rounded p-0.5 text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-2 focus-visible:outline-blue-500"><ExternalLink className="h-3.5 w-3.5" /></a>}
        <button type="button" aria-label="编辑便签" title="编辑便签（双击正文）" disabled={editing || saving} onClick={beginEditing} className="rounded p-0.5 text-neutral-500 hover:text-orange-500 disabled:opacity-30"><FileEdit className="h-3.5 w-3.5" /></button>
        {!memo.done && <button type="button" onClick={() => onFocus(memo.id)} className="rounded p-0.5 text-neutral-500 hover:text-orange-500" title="为此任务开启专注番茄钟"><Target className="h-3.5 w-3.5" /></button>}
        <button type="button" aria-label="删除便签" title="删除便签" onClick={() => void onDelete(memo.id)} className="rounded p-0.5 text-neutral-500 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}

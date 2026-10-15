import { useId, useState } from 'react'
import { HardDrive } from 'lucide-react'
import {
  FONT_KIND_LABEL,
  canQueryLocalFonts,
  findFont,
  quoteFamily,
  queryLocalFontFamilies,
  unquoteFamily,
  type FontKind,
  type FontOption,
} from '../../lib/fonts'
import { Row } from './ui'
import { FIELD, SECONDARY_BUTTON } from './styles'

const LOCAL = '__local__'
const KIND_ORDER: FontKind[] = ['sans', 'serif', 'script', 'mono']

/** 本机字体列表在两个字体槽之间共享，只请求一次权限。 */
export function useLocalFontFamilies() {
  const [families, setFamilies] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'denied'>('idle')
  const load = async () => {
    setStatus('loading')
    try {
      const list = await queryLocalFontFamilies()
      setFamilies(list)
      setStatus('done')
    } catch {
      setStatus('denied')
    }
  }
  return { families, status, load, supported: canQueryLocalFonts() }
}

export function FontSlotPicker({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  local,
}: {
  label: string
  ariaLabel: string
  options: FontOption[]
  value: string
  onChange: (stack: string) => void
  local: ReturnType<typeof useLocalFontFamilies>
}) {
  const listId = useId()
  const [localMode, setLocalMode] = useState(() => value !== '' && !findFont(options, value))
  const [draft, setDraft] = useState(() => (localMode ? unquoteFamily(value) : ''))

  const commitLocal = (name: string) => {
    setDraft(name)
    if (name.trim()) onChange(quoteFamily(name))
  }

  const statusHint =
    local.status === 'done'
      ? `已读取 ${local.families.length} 个本机字体，可输入筛选`
      : local.status === 'denied'
        ? '未获得读取权限，可直接输入字体名'
        : local.supported
          ? '输入本机已安装的字体名，或读取字体列表'
          : '当前浏览器不支持读取字体列表，请直接输入字体名'

  return (
    <>
      <Row label={label}>
        <select
          aria-label={ariaLabel}
          value={localMode ? LOCAL : value}
          onChange={(e) => {
            if (e.target.value === LOCAL) {
              setLocalMode(true)
              if (draft.trim()) onChange(quoteFamily(draft))
            } else {
              setLocalMode(false)
              onChange(e.target.value)
            }
          }}
          className={`${FIELD} !w-56`}
        >
          {KIND_ORDER.map((kind) => {
            const group = options.filter((f) => f.kind === kind)
            if (group.length === 0) return null
            return (
              <optgroup key={kind} label={FONT_KIND_LABEL[kind]}>
                {group.map((f) => (
                  <option key={f.label} value={f.stack}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            )
          })}
          <optgroup label="本机">
            <option value={LOCAL}>使用本机字体…</option>
          </optgroup>
        </select>
      </Row>
      {localMode && (
        <Row label={`${label} · 本机`} hint={statusHint} stacked>
          <div className="flex items-center gap-2">
            <input
              aria-label={`${ariaLabel}（本机字体名）`}
              list={listId}
              value={draft}
              onChange={(e) => commitLocal(e.target.value)}
              placeholder="例如 LXGW WenKai / Source Han Sans SC"
              className={FIELD}
              style={{ fontFamily: draft.trim() ? quoteFamily(draft) : undefined }}
            />
            {local.supported && (
              <button
                type="button"
                onClick={() => void local.load()}
                disabled={local.status === 'loading'}
                className={SECONDARY_BUTTON}
              >
                <HardDrive className="h-3.5 w-3.5" />
                {local.status === 'done' ? '重新读取' : '读取本机字体'}
              </button>
            )}
          </div>
          <datalist id={listId}>
            {local.families.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Row>
      )}
    </>
  )
}

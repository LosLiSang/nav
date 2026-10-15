import { useRef, useState } from 'react'
import { Camera, Loader2, RotateCcw, Upload } from 'lucide-react'
import type { Settings } from '../../types'
import { Group, Row } from './ui'
import { DEFAULT_AVATAR, FIELD, SECONDARY_BUTTON } from './styles'

const AVATAR_PRESETS = [
  DEFAULT_AVATAR,
  'https://api.dicebear.com/7.x/bottts/svg?seed=ideal&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/bottts/svg?seed=cyber&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/bottts/svg?seed=spark&backgroundColor=d1d4f9',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/notionists/svg?seed=Lucky&backgroundColor=ffd5dc',
  'https://api.dicebear.com/7.x/notionists/svg?seed=Oliver&backgroundColor=c0aede',
]

/** 小图直接用；大图居中裁成正方形并压到 256px，避免把大图塞进设置。 */
function processAvatarFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const src = String(e.target?.result || '')
      if (file.type === 'image/svg+xml' || file.size < 60 * 1024) {
        resolve(src)
        return
      }
      const img = new Image()
      img.onload = () => {
        const size = Math.min(img.width, img.height)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = Math.min(256, size)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(src)
          return
        }
        ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.onerror = () => resolve(src)
      img.src = src
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ProfileSection({
  settings,
  onChange,
}: {
  settings: Settings
  onChange: (values: Partial<Settings>) => void
}) {
  const avatar = settings.avatarUrl || DEFAULT_AVATAR
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      alert('请选择有效的图片文件 (PNG/JPG/WebP/GIF/SVG)！')
      return
    }
    setUploading(true)
    try {
      onChange({ avatarUrl: await processAvatarFile(file) })
    } catch {
      alert('头像处理失败，请重试！')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
        className={`flex flex-col items-center gap-2 rounded-xl py-4 transition ${
          dragging ? 'bg-orange-500/10 ring-2 ring-orange-500/40' : ''
        }`}
      >
        <button
          type="button"
          title="点击或拖拽图片更换头像"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className="group relative h-20 w-20 overflow-hidden rounded-full shadow-md ring-1 ring-black/10 dark:ring-white/10"
        >
          <img src={avatar} alt="头像" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
        <div className="text-[17px] font-semibold text-neutral-900 dark:text-neutral-100">
          {settings.userName || 'Nav 探索者'}
        </div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">点击或拖拽图片到这里更换头像</div>
      </div>

      <Group title="个人信息">
        <Row label="昵称">
          <input
            aria-label="昵称"
            value={settings.userName ?? 'Nav 探索者'}
            onChange={(e) => onChange({ userName: e.target.value })}
            placeholder="输入昵称"
            className={`${FIELD} !w-48 text-right`}
          />
        </Row>
        <Row label="本地头像" hint="大图会自动裁剪压缩到 256px">
          <div className="flex items-center gap-2">
            {avatar !== DEFAULT_AVATAR && (
              <button type="button" onClick={() => onChange({ avatarUrl: DEFAULT_AVATAR })} className={SECONDARY_BUTTON}>
                <RotateCcw className="h-3.5 w-3.5" />
                恢复默认
              </button>
            )}
            <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className={SECONDARY_BUTTON}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? '处理中…' : '上传图片'}
            </button>
          </div>
        </Row>
      </Group>

      <Group title="预设头像">
        <div className="flex flex-wrap gap-3 p-3.5">
          {AVATAR_PRESETS.map((preset) => {
            const selected = avatar === preset
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ avatarUrl: preset })}
                className={`h-10 w-10 overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/10 transition hover:scale-105 ${
                  selected ? 'outline outline-[3px] outline-offset-2 outline-orange-500' : ''
                }`}
              >
                <img src={preset} alt="" className="h-full w-full object-cover" />
              </button>
            )
          })}
        </div>
        <Row label="头像链接" stacked>
          <input
            aria-label="自定义头像链接"
            value={settings.avatarUrl || ''}
            onChange={(e) => onChange({ avatarUrl: e.target.value })}
            placeholder="https://..."
            className={FIELD}
          />
        </Row>
      </Group>
    </>
  )
}

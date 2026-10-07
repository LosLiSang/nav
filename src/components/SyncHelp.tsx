import type { ReactNode } from 'react'

function Cmd({ children }: { children: ReactNode }) {
  return (
    <code className="block overflow-x-auto whitespace-pre rounded-lg bg-neutral-900 dark:bg-black/60 px-2.5 py-1.5 font-mono text-[10.5px] text-neutral-100">
      {children}
    </code>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="font-medium text-neutral-800 dark:text-neutral-100">{title}</div>
        {children}
      </div>
    </li>
  )
}

/** 云同步配置教程：解释 Worker / D1 / SYNC_TOKEN 的关系，以及首次部署和新设备接入步骤 */
export function SyncHelp() {
  return (
    <div className="space-y-3.5 rounded-xl border border-orange-200/80 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/20 p-3.5 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
      <div>
        <div className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">工作原理</div>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>导航页的数据存在本浏览器里（IndexedDB），没有云同步也能正常用。</li>
          <li>Worker 是跑在 Cloudflare 上的小程序，它把整份数据备份到 D1 数据库。</li>
          <li>
            同步密钥只有一把，存在两处：Worker 里（<code className="font-mono">wrangler secret put</code>）和本浏览器里（下方输入框）。两处必须完全一致，否则 Worker 会拒绝请求。
          </li>
          <li>Worker 不会生成或下发密钥。「生成密钥」按钮只是在本地生成一串随机字符，需要你自己写进 Worker。</li>
        </ul>
      </div>

      <div>
        <div className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">首次部署（只做一次）</div>
        <ol className="space-y-3">
          <Step n={1} title="登录 Cloudflare 并建库">
            <p>在项目的 worker 目录执行：</p>
            <Cmd>{`cd worker
npm install
npx wrangler login
npx wrangler d1 create nav-sync`}</Cmd>
            <p>把返回的 database_id 填进 worker/wrangler.toml。</p>
          </Step>
          <Step n={2} title="建表">
            <Cmd>npx wrangler d1 execute nav-sync --remote --file=./schema.sql</Cmd>
          </Step>
          <Step n={3} title="设置同步密钥">
            <p>点下方「生成密钥」，再点眼睛图标显示明文并复制，然后执行：</p>
            <Cmd>npx wrangler secret put SYNC_TOKEN</Cmd>
            <p>按提示粘贴同一串密钥。存入后立即生效，不需要重新部署。</p>
          </Step>
          <Step n={4} title="部署 Worker">
            <Cmd>npx wrangler deploy</Cmd>
            <p>记下输出的地址，形如 https://nav-sync.你的账号.workers.dev。</p>
          </Step>
          <Step n={5} title="在本页连接">
            <p>填好 Worker 地址和同一串密钥，点「保存并连接」。状态变成「已同步」即成功。</p>
          </Step>
        </ol>
      </div>

      <div>
        <div className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">换设备 / 清理浏览器后恢复</div>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>在原设备点眼睛图标，查看并复制当前密钥。</li>
          <li>在新设备填入相同的 Worker 地址和密钥。</li>
          <li>点「保存并连接」，数据会自动从云端恢复。</li>
        </ol>
      </div>

      <div>
        <div className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">常见问题</div>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>
            <b>token 不对</b>：两处密钥不一致。重新执行 <code className="font-mono">wrangler secret put SYNC_TOKEN</code>，或在这里填对。
          </li>
          <li>
            <b>连不上同步服务</b>：检查 Worker 地址，或在浏览器直接打开该地址，应返回 <code className="font-mono">{'"ok":true'}</code>。
          </li>
          <li>
            <b>需要处理（冲突）</b>：两台设备都改过数据。选「从云端恢复」用云端覆盖本机，或「强制上传本地」用本机覆盖云端。
          </li>
          <li>
            <b>更换密钥</b>：重新执行 secret put 后，每台设备都要填入新密钥。
          </li>
        </ul>
      </div>
    </div>
  )
}

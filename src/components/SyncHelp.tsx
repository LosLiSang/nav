/** 云同步说明：账号模型、换设备恢复、常见问题 */
export function SyncHelp() {
  return (
    <div className="space-y-3.5 rounded-xl border border-orange-200/80 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/20 p-3.5 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
      <div>
        <div className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">工作原理</div>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>导航页的数据存在本浏览器里（IndexedDB），不登录也能正常使用。</li>
          <li>用 GitHub 登录后，改动会自动同步到云端（Cloudflare D1），每个账号的数据相互隔离。</li>
          <li>同一台设备上，每个账号使用独立的本地数据；退出登录会回到未登录时的数据，账号数据保留在本机。</li>
          <li>新账号需要管理员审批，审批前数据只保存在本机。</li>
        </ul>
      </div>

      <div>
        <div className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">换设备 / 清理浏览器后恢复</div>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>在新设备打开导航页，进入「设置 → 云端同步」。</li>
          <li>点击「使用 GitHub 登录」，登录同一个 GitHub 账号。</li>
          <li>数据会自动从云端恢复。</li>
        </ol>
      </div>

      <div>
        <div className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">常见问题</div>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>
            <b>等待审批</b>：联系管理员在「用户管理」中批准，批准后点账号旁的刷新按钮即可开始同步。
          </li>
          <li>
            <b>登录已过期</b>：会话 30 天未使用会失效，重新登录即可，本机数据不受影响。
          </li>
          <li>
            <b>需要处理（冲突）</b>：两台设备都改过数据。选「从云端恢复」用云端覆盖本机，或「强制上传本地」用本机覆盖云端。
          </li>
          <li>
            <b>以前用同步密钥的设备</b>：密钥方式已停用，登录 GitHub 后继续同步。管理员首次登录时可以认领旧版云端数据。
          </li>
        </ul>
      </div>
    </div>
  )
}

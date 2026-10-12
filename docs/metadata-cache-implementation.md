# #10 / #12 实施与发布说明

## 已确认的设计

公共自动图标共享；页面自动标题按账号隔离；匿名标题不持久化。
不改写保存的书签标题、手动图标、导航快照、便签或登录数据。
普通 active 用户只可刷新服务端核对过的本人书签资源。
批量最多 20 个独立资源、抓取并发最多 3；失败保留旧成功值。
管理员可推进全部公共图标的代际，不失效其他账号私有标题。
界面的逻辑批次拆为单资源 HTTP 请求、最多并行 3 个，避免将 20 个资源的 D1
查询集中到同一次 Worker 调用。后端拒绝未拆分的多资源请求并返回
`batch_requires_chunking`；不依赖未经确认的付费 Worker 配额。

## #10 缓存核心

- D1 独立 metadata 表记录有界图标 BLOB、标题、TTL、失败记录、版本与租约。
- 图标 7 天、标题 24 小时、失败 5 分钟；旧成功值最多保留到上次成功的 7 天。
- 最多 10,000 条缓存记录、每账号最多 1,000 个标题；总有效内容最多 100 MiB。
- 单图最多 256 KiB、标题最多 2 KiB，HTML 读取最多 256 KiB。
- 有界清理缓存、配额、操作和审计记录；不扫用户业务表。
- D1 条件更新取得跨实例租约；提交比较 owner、有效期及公共代际。
- 外层响应首期 `no-store`，先保证真实版本和权限语义；尚未开启 Workers Cache 加速层，
  避免缓存命中绕过鉴权/版本检查。不能把不同 Cloudflare 缓存产品视为同一个存储。
- 匿名 `force` 不执行；管理刷新走独立鉴权 POST。

## 出站安全及实际限制

目标只允许默认端口 HTTP(S)，拒绝 credentials、IP 字面量、内网/单标签域名。
固定 DoH 解析 A/AAAA，拒绝非全球地址；每次重定向重新验证，最多 3 跳。
生产使用 Cloudflare 原生 fetch 的 HTTP/TLS 实现，明确开启
`global_fetch_strictly_public`，不配置私有 origin/outbound/service 绑定。
原生 fetch 使用原域名验证 TLS，重定向由应用逐跳处理；连接层以平台公网出站
限制为最终 SSRF 边界。**DoH 预检不等于 IP 固定**，不再使用不稳定的
`startTls({ expectedServerHostname })` 作为生产 HTTPS 方案。
源站请求不携带账号会话、Cookie，不向搜索引擎发送私有 URL。
图标只存有标识的 PNG/JPEG/ICO；不缓存 SVG/HTML。

原 Socket 方案已撤下，因此不再受 Socket 禁止连接 Cloudflare IP 的覆盖限制。
网站仍可能因机器人策略、无效证书、响应超限或网络异常失败；此时保留有效旧值。
网络夹具 E2E 不证明生产可达性或平台计费，发布后须实际验证 title/icon MISS/HIT。

本地真实外网测试使用现有 HTTP_PROXY/HTTPS_PROXY（本机为 127.0.0.1:7890）。
`npm run dev:proxy --prefix worker` 启动真实本地 Worker 与只监听回环的转发进程。
转发进程带随机临时令牌、拒绝浏览器 Origin 和未授权请求；通过代理 CONNECT 到
Worker 检查过的公网 IP，并显式校验原域名证书。DNS 仅访问固定可信 DoH 服务。
本地入口与转发进程都不进入生产包，也不改变系统代理配置。

依据：

- [Cloudflare TCP Socket API 与连接限制](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- [Workerd 公网出站与严格公网标志说明](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/compatibility-date.capnp)
- [Workerd TLS 选项支持限制](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/sockets.c++)
- [D1 容量限制](https://developers.cloudflare.com/d1/platform/limits/)
- [Workers Cache 与旧缓存的区别](https://developers.cloudflare.com/workers/cache/limitations/)

## 测试

`npm run check:metadata` 使用两台真实本地 Worker、共享独立 D1 和有出站计数的网络夹具。
只替换 DNS 与网络传输，生产没有测试开关。重复运行重置的仅是 artifacts 下测试库。
`TEST_MANAGEMENT=1` 会额外执行 #12 管理操作断言。
`TEST_UI=1` 验证 `npm run build` 生成的真实生产前端，读取真实 IndexedDB，
不通过导入 store 修改内部状态。覆盖网络丢失后的管理员原操作 ID 重试。
开发模式的 `/src/index.css` 曾挂起；采用生产预览是为了验证上线工件，而非放宽验收。
报告在 `artifacts/metadata-cache-e2e/report.json`，红灯证据另存 `metadata-cache-before`。

## 发布门槛

代码和设计批准不等于生产发布/清除授权。新 `0004_metadata_cache.sql` 仅为增量建表。
获得明确授权后先备份并迁移 D1，再发布 Worker，验证后开启前端管理操作。
老 Worker 返回 404 / 未迁移后端返回 503 时，前端必须显示不可用，不假报清理成功。
不得仅因 PR merge 关闭 issue，真实生产验收仍单独记录。

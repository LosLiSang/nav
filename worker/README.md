# nav-sync —— 导航页的云端数据服务

一个跑在 Cloudflare 上的单文件 Worker + 一个 D1（托管 SQLite）库，负责让导航页的数据
不再只活在某一台浏览器里：清 cookie、清站点数据、换设备、换浏览器，数据都还在。

前端仍然是纯静态的 GitHub Pages 站点，它只是多了一个「把整份数据同步到云端」的出口。
浏览器里的 IndexedDB 继续保留，作为本地缓存和离线兜底。

## 一次性部署

在 `worker/` 目录下按顺序执行（前 4 步只需要做一次）：

```bash
npm install                       # 装 wrangler

npx wrangler login                # 打开浏览器完成 Cloudflare 授权

npx wrangler d1 create nav-sync   # 建库，把返回的 database_id 填进 wrangler.toml

npx wrangler d1 execute nav-sync --remote --file=./schema.sql   # 建表

npx wrangler secret put SYNC_TOKEN   # 粘贴一个长随机串（可在导航页设置面板点「生成」）

npx wrangler deploy               # 部署，输出形如 https://nav-sync.<你的账号>.workers.dev
```

部署完把那个 `https://...workers.dev` 地址填进导航页的「设置 → 云同步」，token 填同一个值，
点「保存并连接」就生效了。

> 部署前务必把 `wrangler.toml` 里的 `database_id` 换成 `d1 create` 返回的真实 id，
> 否则 `wrangler deploy` 会把绑定指向一个不存在的库。

## 本地开发

```bash
cd worker
npm run db:init:local   # 在 .wrangler/state 下建本地 SQLite 并建表
npm run dev             # 默认 http://127.0.0.1:8788
```

本地密钥放在 `worker/.dev.vars`（已 gitignore）：

```
SYNC_TOKEN=local-dev-token
```

## 数据模型

整份导航快照（分类、书签、备忘录、TOTP、外观设置）序列化成一个 JSON，存在
`nav_docs` 表的一行里。不做增量同步的理由：前端本来就是「本地先写、整体推一次」，
单行文档让写入保持原子，也省掉两端维护 diff 的复杂度。几百条书签约 100~300KB，
远低于 D1 单行 2MB 的限制。

**图标缓存不同步。** 那些 base64 图标是可再生的缓存，只留在浏览器本地，
不进云端（否则会把行撑爆，且没有任何价值）。

## 冲突策略

客户端每次写入都要声明它基于哪个云端版本（`expectedUpdatedAt`），服务端只在版本
对得上时才接受，否则返回 `409` 并把当前版本原样带回。

这条规则的意义：**落后的设备不可能静默覆盖云端更新**。宁可弹冲突让人选，也不能出现
「打开旧电脑随手改个书签，把前几天在另一台机器上整理的几十条全冲掉」这种事。
前端的处理是：

- 云端更新 → 自动拉取
- 本地更新 → 自动上传
- 两边都改过 / 无法判断 → 停下来，让人选「从云端恢复」或「强制上传本地」

## 安全

- 鉴权是 `Authorization: Bearer <SYNC_TOKEN>`，没配置 `SYNC_TOKEN` 时直接 500 拒绝服务，
  不会退化成公开数据库。
- token 只存在两处：Worker secret 和用户浏览器的 localStorage。**不要**把它写进
  仓库或 `.env` 提交 —— GitHub Pages 是公开的，构建产物里的任何东西等于全网可见。
- TOTP 密钥也在同步范围内，所以这个 token 值得按密码级别对待。
- `ALLOWED_ORIGIN` 默认 `*`（鉴权靠 token 而不是 cookie）。想收紧就改成你的
  Pages 域名。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | 健康检查，返回服务是否已配置 token |
| GET | `/api/data` | 取云端快照 `{ doc, updatedAt, rev }` |
| PUT | `/api/data` | 写入快照 `{ doc, updatedAt, expectedUpdatedAt, force }` |

## 常用运维命令

```bash
npx wrangler tail                                   # 实时看请求日志
npx wrangler d1 execute nav-sync --remote --command "SELECT rev, updated_at, length(doc) FROM nav_docs"
npx wrangler secret put SYNC_TOKEN                  # 轮换 token（轮换后所有设备都要重填）
```

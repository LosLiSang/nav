# nav

<p align="left">
  <a href="https://github.com/LosLiSang/nav/releases"><img src="https://img.shields.io/github/v/release/LosLiSang/nav?color=3b82f6&label=release" alt="Release"></a>
  <a href="https://github.com/LosLiSang/nav/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/LosLiSang/nav/deploy.yml?branch=main&label=deploy" alt="Deploy"></a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/Local--First-IndexedDB-8B5CF6" alt="Local First">
  <img src="https://img.shields.io/badge/license-MIT-10b981" alt="License">
</p>

本地优先（Local-First）、现代化个人专属浏览器起始页与生产力工作台。

<p align="center">
  <img src="docs/preview.png" alt="nav preview" width="100%" />
</p>

---

## 💡 About (关于本项目)

**nav** 是一款为开发者与知识工作者打造的高颜值、高定制、隐私安全的现代化浏览器导航站与个人工作台。

### 核心设计哲学

- **本地优先 (Local-First)**：所有分类、书签、草稿、便签与个性化外观配置默认完整保存在浏览器本地的 IndexedDB（基于 Dexie 驱动，库名 `nav-workspace-v2`）。无需注册、无需开箱连接后端即可离线流畅使用，零第三方跟踪与隐私收集，冷启动毫秒级加载。
- **优雅视觉体系**：采用现代化半透明磨砂毛玻璃卡片（Backdrop Blur）、深浅色主题无缝切换、多列书签网格、壁纸模糊度/遮罩调节，以及支持十六进制色值的「全局主题高亮色」，兼具观赏性与高密度实用性。
- **常驻生产力工作台 (Persistent Workbench)**：桌面端右侧配备常驻工作面板，内置可随内容自动撑高的即时草稿板、便签（待办）清单与番茄专注钟，让导航页从单纯的“网站目录”升维为日常开机即用的工作中枢。
- **坚固而轻量的云同步**：提供可自建的 Cloudflare Worker + D1（托管 SQLite）云端服务。使用 GitHub 账号登录，每个账号数据相互隔离；书签与设置走原子整页快照，便签与草稿走独立接口，全部写入带乐观并发校验，拒绝静默覆盖。

---

## ✨ 核心特性

- 🗂️ **书签与多级体系**：支持主分类自由添加与拖拽排序、下级分组与二级子分类、书签跨分类拖拽重排与批量管理。
- 🌐 **网站图标智能抓取与本地缓存**：内置多源 Favicon 解析策略与 Worker 后端代理，抓取成功后以 Blob 缓存在本地 IndexedDB。支持按分区、书签组或单个书签清理缓存，随后立即重新获取并更新显示。
- 🔍 **多引擎即时搜索**：内置 Google、Bing、百度、Stack Overflow、SegmentFault、GitHub 等搜索引擎，支持快捷键切换。
- 📝 **自适应草稿板 (Scratchpad)**：临时代码、调试命令、JSON 片段随手暂存；文本框随输入内容自动向下平滑撑高，单层滚动条与卡片自然贴合，支持一键快速复制全文与清空。
- ⏱️ **番茄钟专注**：工作/短休/长休时长均可自定义（1-120 分钟），阶段结束自动衔接下一阶段，长休间隔可配置（默认每 4 个番茄）；「专注设置」弹窗集中管理时长、结束提醒与音量，联动待办事项一键开启专注。「全屏专注」以浏览器全屏显示大号倒计时（空格开始/暂停，Esc 退出），进入和退出都不影响计时；浏览器拒绝全屏时降级为页面内全屏视图。
- 🔐 **TOTP / 2FA 二次验证口令**：纯前端安全计算生成 6 位动态验证码，关键账号安全凭证全由本地掌控。
- 🌤️ **天气组件**：支持 Open-Meteo、wttr.in（免 Key）、高德开放平台、和风天气（需 Key）以及自定义 REST API。
- 🎨 **深度外观定制**：支持自定义网络或本地壁纸、卡片宽度、背景透明度、模糊度、图标圆角、全局强调色，以及书签中文/西文字体分开设置。设置面板采用仿 macOS「系统设置」的分组布局。

---

## 🧹 本地图标缓存维护

服务端缓存与联合刷新仍处于 RFC 设计阶段；见
[待确认方案与完整 E2E 失败矩阵](docs/cache-rfc-proposal.md)。这些文档不代表 #10 / #12 已实现或已批准。
安全边界基线可用 `node scripts/probe-metadata-boundary.mjs` 重复验证，报告位于
`artifacts/metadata-boundary/report.json`；当前基线预期失败，不能当作通过的验收。

在「设置 → 网站图标 → 缓存」点击「清理本地图标缓存」：

- 默认选择**主分区当前页的空图标书签**，可逐层调整范围或选择全部书签。
- 「仅空图标」处理没有有效远程图标且未手动指定图标的书签；有效的本地远程图标缓存不算空图标，占位图标不算有效远程图标。
- 图标缓存按域名共享，预览会提示未选中书签的关联影响；不会删除书签、手动图标、保存的标题或同步配置。
- 清理后立即正常获取图标、更新缓存与渲染，支持单独重试失败项。不会删除服务器缓存，正常请求可能命中浏览器/服务器缓存。
- 当前操作仅同步更新本页面的内存状态，其他已打开标签页重新加载后读取最新本地缓存。

### 验证缓存逻辑

纯逻辑测试使用 Node.js 24 的 TypeScript 类型剥离能力，无需启动服务：

```bash
npm run check:cache
```

在已有标题/图标抓取主流程中追加了缓存选择、局部清理、数据保护与失败重试断言；本地夹具模式不会访问线上 Worker，也不等同于验证线上抓取能力：

```bash
npm run check:title:local
```

该主流程自动启动本地服务，默认使用 Windows Edge；可通过 `EDGE_PATH` 指定兼容 Chromium 的浏览器可执行文件。

---

## 📝 便签正文、编辑与网址

在右侧工作台「便签」中：

- **完成状态**只由左侧圆点切换，单击正文不会勾选；正文可正常选择和复制。
- **双击正文**或点击悬停操作区的「编辑」图标进入编辑。输入框自动增高；Enter 保存、Esc 取消、Shift+Enter 换行，失焦也会保存。中文输入法确认时的 Enter 不会误提交。
- 保存空白内容视为取消，不删除便签；保存失败会保留当前输入并提示重试。编辑保留原 ID、创建时间和完成状态，先写入 IndexedDB，登录后通过独立的便签接口同步（见下文「工作台独立同步」）。
- 文本含有效 `http(s)://` 地址时，操作区显示「打开」图标，点击在新标签页打开第一个地址，并使用 `noopener noreferrer` 隔离；正文不会变成链接，以免影响选中文字。普通文本、`javascript:` 和 `data:` 不显示入口。
- 编辑控件及帮助文字会随整行滚入列表可见区域；操作区也支持键盘聚焦后显示。

验证命令沿用 `npm run check:sidebars`。现有侧边栏流程已追加正文误触、编辑/取消/空白/失焦、输入法、多行、失败重试、保存去重、勾选竞争、删除竞争、真实新标签页隔离、明暗主题对比度和刷新持久化断言，并输出 `artifacts/sidebars-e2e/report.json` 与编辑截图。该流程不覆盖线上账号上传或跨设备恢复。

---

## 🔔 番茄钟结束提醒

右侧工作台「专注」支持工作、短休和长休完成提醒：

- **默认页面提示**：完成时显示当前与下一阶段，提示持续到关闭或切换/重置计时；不会自动启动下一阶段。切换草稿、便签或折叠侧栏后仍可看到提示。
- **可选声音**：在「结束提醒」主动开启后，支持试听和 0–100% 音量调节。浏览器限制声音时会显示降级说明，不阻断页面提示。
- **可选系统通知**：仅主动勾选时请求权限；已经拒绝时不会重复请求。点击通知尝试聚焦页面并打开专注工作台。调用成功不代表操作系统实际送达，系统免打扰等可能抑制提醒。
- **后台标题**：后台完成时在标签页标题显示阶段名称；恢复可见或关闭提示后还原标题。
- **可靠性与边界**：倒计时使用结束时间校正，恢复焦点/可见时重新检查；每次计时完成只提醒和统计一次。暂停、重置、切换阶段会取消旧计时；关闭页面或隐藏整个工作台会终止计时。刷新不恢复运行状态，也不补发过期提醒。各标签页独立计时，不共享运行状态。
- **本设备偏好**：声音、通知和音量按本设备/账号存储，不进入整页云同步；后台冻结、设备休眠或修改系统时间可能影响提醒时机，不承诺后台准时或关闭页面后提醒。
- **移动端范围**：首期沿用桌面右侧工作台入口；窄屏只保证已启动计时的页面提示可见，不新增移动端计时入口。

### 侧边栏端到端回归（Issue #8）

```bash
npm run check:sidebars
```

使用 Node.js 22+、本地 Vite 和独立临时 Edge profile（可通过 `EDGE_PATH` 指定 Chromium 兼容浏览器）。在原有草稿/便签/侧栏/主题流程中追加番茄钟测试：专注设置弹窗与自定义时长、自动阶段衔接、恢复事件去重、暂停续跑、重置/切换取消、声音与音量、通知权限与失败降级、标题恢复、刷新规则、窄屏边界。

测试驱动真实应用、DOM 和计时逻辑，通过推进浏览器内 `Date.now()` 避免实际等待完整阶段时长；AudioContext 和 Notification 使用可控浏览器 API 夹具，因此**不等同于实测扬声器声音、操作系统通知送达或真实设备休眠**，这些需要在目标设备人工验收。输出 `artifacts/sidebars-e2e/report.json` 与明暗主题、窄屏完成提示截图；`OUT_DIR` / `APP_PORT` 可覆盖输出目录和本地端口。

---

## 🚀 前端部署教程 (Frontend)

前端项目基于 **React 19 + TypeScript + Vite + Tailwind CSS v4** 构建，产物为纯静态文件，支持部署到任意静态托管服务。

### 1. 本地开发与调试

确保本地已安装 Node.js（推荐 v22+；`npm run check:cache` 依赖 Node.js 24 的 TypeScript 类型剥离）：

```bash
# 安装项目依赖
npm install

# 启动本地开发服务器（默认端口 5173）
npm run dev
```

浏览器打开 `http://127.0.0.1:5173` 即可实时预览并支持热重载（HMR）。

#### 主题端到端回归（Issue #22）

```bash
npm run check:light
```

脚本自动启动本地 Vite 和独立临时 profile 的无头 Edge，不使用现有浏览器数据，也不访问线上账号。默认测试端口为 `5202` / `9442`，可用 `APP_PORT` / `DEBUG_PORT` 覆盖；通过 `EDGE_PATH` 指定 Chromium 兼容浏览器。

覆盖 1280px / 390px 两种宽度、系统与应用的深浅色四种组合，以及 9 个弹窗/选项卡，共 72 个场景。断言应用 `color-scheme`、弹窗前景/背景、默认文字与字数统计对比度、完成按钮颜色、滑块轨道和填充、键盘操作与刷新后的持久化；截图和 JSON 报告保存在 `artifacts/light-mode/`，可用 `OUT_DIR` 指定其他目录。报告中的 `lowContrastText` 是其他辅助文字的扫描线索，不代表全站 WCAG 合规检查。

#### 主题强调色端到端回归（Issue #41）

```bash
npm run check:accent
```

「全局主题高亮色」驱动整套强调色阶：项目中作为品牌色使用的 `orange-*` 类会映射到用户选择的主题色（默认橙色保持 Tailwind 原值不变），复选框统一使用 `accent-color`，主按钮文字在浅色主题色（如琥珀黄、翡翠绿）上自动改为深色，深色模式下过暗的主题色会被提亮。红/绿/琥珀等语义色不受影响。脚本依次验证默认橙、经典蓝、琥珀黄、深色模式曜石黑四种情况下的复选框、输入框聚焦边框、主按钮背景与文字颜色和语义色，截图与报告保存在 `artifacts/accent-e2e/`。

### 2. 静态产物构建

```bash
npm run build
```

构建完成后，可在项目根目录生成 `dist/` 文件夹，该文件夹可直接作为 Web 根目录静态托管。

### 3. 部署到 GitHub Pages (推荐自动化)

本项目已内置完整的 GitHub Actions 工作流（见 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)），支持**双分支流水线**：

1. 在 GitHub 仓库设置中开启 Pages：
   - 进入仓库 **Settings → Pages**；
   - **Build and deployment** 的 Source 选择 **GitHub Actions**。
2. 推送代码触发自动构建：
   - 推送到 `main` 分支：自动打包发布至主站根路径 `https://<你的用户名>.github.io/<仓库名>/`（生产环境）；
   - 推送到 `dev` 分支：自动打包发布至预览路径 `https://<你的用户名>.github.io/<仓库名>/dev/`（测试预览环境）。

### 4. 部署到 Vercel / Cloudflare Pages / 自建 Nginx

- **Vercel / Cloudflare Pages**：
  - Framework Preset：`Vite`
  - Build Command：`npm run build`
  - Output Directory：`dist`
- **Nginx**：
  - 将 `dist/` 内容拷贝至网站目录，配置 `try_files $uri $uri/ /index.html;` 即可。

---

## ☁️ Worker 数据库与 API 部署教程 (Backend)

云端数据同步服务位于 [worker/](worker/) 目录，基于 **Cloudflare Workers**（路由使用 Hono）与 **Cloudflare D1**（边缘托管 SQLite 数据库）构建。

### 1. 架构与数据存储机制

- **账号体系**：使用 GitHub OAuth 登录。`ADMIN_GITHUB_LOGINS` 名单内的账号自动成为管理员，其他新账号需管理员在「设置 → 云端同步」中审批后才能同步。会话令牌通过 `Authorization: Bearer` 传递，D1 中只保存令牌的 SHA-256。
- **整页快照**：每个用户在 `user_docs` 表中一行快照，包含分类、书签、TOTP 与外观设置。服务端只认会话解析出的用户 ID，不信任客户端自报身份。
- **工作台独立同步（#23）**：便签存于 `user_memos`，草稿存于 `user_clipboard`，二者不再进入整页快照，编辑书签不会引发便签冲突（详见下文）。
- **图标与标题缓存**：网站图标在浏览器本地 IndexedDB 中缓存，不进入快照；服务端另有图标/标题元数据缓存（图标公共共享，标题按账号隔离，匿名标题不持久化）。
- **并发冲突防护 (Optimistic Locking)**：写入时携带客户端基于的版本号 `expectedUpdatedAt`，若服务端在此期间已被其他设备更新则返回 `409 Conflict`，由用户选择保留云端还是强制覆盖，杜绝多端静默覆盖。
- **旧版单用户数据**：早期 `SYNC_TOKEN` 模式的数据保存在 `nav_docs`（ID 为 `default`），管理员可一次性认领到自己账号，认领前原样备份到 `legacy_claims`。`LEGACY_SYNC` 默认为 `off`，即旧 token 完全停用；设为 `read` 可临时恢复只读拉取。

### 2. 一次性部署步骤

先在 GitHub **Settings → Developer settings → OAuth Apps** 新建一个 OAuth App：

- Homepage URL：前端站点地址；
- Authorization callback URL：`https://<你的 Worker 地址>/auth/github/callback`。

然后进入 `worker/` 目录执行：

```bash
cd worker

# 1. 安装依赖（Wrangler、Hono）
npm install

# 2. 登录并授权 Cloudflare 账号（会唤起浏览器完成登录）
npx wrangler login

# 3. 创建 D1 数据库
npx wrangler d1 create nav-sync
```

将第 3 步返回的实际 `database_id` 填入 `worker/wrangler.toml` 的 `[[d1_databases]]`，并按需修改 `[vars]`：

| 变量 | 说明 |
| :--- | :--- |
| `ALLOWED_ORIGIN` | 前端站点 origin（逗号分隔），用于账号/数据接口的 CORS 白名单与 GitHub 登录回跳白名单 |
| `ADMIN_GITHUB_LOGINS` | 登录后自动成为管理员的 GitHub 用户名（逗号分隔） |
| `LEGACY_SYNC` | 旧 `SYNC_TOKEN` 兼容模式：`off`（默认，停用）或 `read`（只读） |

```bash
# 4. 在远程 D1 执行全部迁移（worker/migrations/0001~0004）
npm run db:migrate:remote

# 5. 配置 GitHub OAuth App 凭据
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET

# 6. 部署 Worker 到 Cloudflare 边缘节点
npm run deploy
```

部署完成后，终端将输出 Worker 服务公网地址，格式如 `https://nav.<你的账号子域名>.workers.dev`。

> 升级已有部署时，务必**先执行迁移再部署 Worker**；前端若先于 Worker 发布，工作台新接口返回 404 时会显示「需要后端升级」并暂停整页上传，避免覆盖云端便签。

### 3. 前端绑定云同步

- 构建时可通过环境变量 `VITE_SYNC_URL` 指定默认 Worker 地址（参考 [.env.example](.env.example)，只能放非机密内容）；
- 也可在运行时打开「设置 → 云端同步 → 自建同步服务地址」覆盖；
- 点击「使用 GitHub 登录」完成授权。新账号需要管理员审批，审批后改动会自动同步，换设备登录同一账号即可恢复。

### 4. 工作台独立同步（#23）

- 便签使用 `GET /api/memos?since=...` 增量读取，单条 `PUT/DELETE /api/memos/:id` 写入；草稿使用 `/api/clipboard` 作为同账号的共享剪贴板。仅 active 账号可访问本人数据。
- 本机改动先落 IndexedDB，离线/失败保留 dirty 队列；自动同步暂停时只保存本地，手动同步仍可提交。重新获得焦点、页面可见或网络恢复时读取更新。草稿沿用 400ms 防抖，所有写入使用服务端版本 CAS。
- 工作台标签栏用云图标表示同步状态（黄色同步中、红色失败/冲突/待升级、绿色成功、灰色尚未同步），点击展开详情与处理入口。冲突时保留本机输入，由用户显式选择保留本机或采用云端；服务端删除墓碑不会被旧设备复活。
- 旧快照中的便签在首次读取时事务导入，原快照备份到 `workbench_migrations`，已有记录及墓碑不会被覆盖。旧客户端上传含 `memos` 的快照会收到 `upgrade_required`，不会覆盖独立便签。

### 5. 本地模拟与日常运维

```bash
cd worker

# 本地 D1 建表（数据存放在 .wrangler/state）
npm run db:migrate:local

# 启动本地 Worker（wrangler 默认监听 http://127.0.0.1:8787）
npm run dev

# 查看远程数据库中各用户的快照状态
npx wrangler d1 execute nav-sync --remote --command "SELECT user_id, updated_at, rev, updated_by, length(doc) AS doc_len FROM user_docs"

# 查看线上实时请求日志
npm run tail
```

本地密钥写在 `worker/.dev.vars`（已 gitignore，同名键会覆盖 `wrangler.toml` 的 `[vars]`），例如 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`ALLOWED_ORIGIN`。

#### 同步端到端验证

```bash
npm run smoke:sync
```

只运行在本地隔离数据库：启动 Worker 时使用 `--persist-to <独立测试目录>`，运行脚本时设置同一绝对路径的 `D1_STATE`，并通过 `APP_URL` / `WORKER_URL` 指定本地服务；Worker 的 `ALLOWED_ORIGIN` 必须包含测试页面 origin。脚本拒绝远程地址和未指定隔离目录的运行，输出 `artifacts/sync-e2e/report.json`，不会重置现有开发或生产数据库。

---

## 📡 API 接口规范 (API Reference)

需要鉴权的接口通过请求头携带 GitHub 登录后获得的会话令牌：

```http
Authorization: Bearer <session token>
```

| 请求方法 | 路径 | 鉴权 | 说明 |
| :--- | :--- | :---: | :--- |
| **GET** | `/` | 否 | 健康检查，返回服务状态及 GitHub 登录是否已配置 |
| **GET** | `/auth/github/start?return_to=` | 否 | 跳转 GitHub 授权；`return_to` 必须在 `ALLOWED_ORIGIN` 内 |
| **GET** | `/auth/github/callback` | 否 | OAuth 回调，携带一次性登录码回跳前端 |
| **POST** | `/auth/exchange` | 否 | 用一次性登录码换取会话令牌 |
| **POST** | `/auth/logout` | 可选 | 注销请求头中携带的会话 |
| **GET** | `/api/me` | 是 | 当前用户信息（管理员额外返回旧数据认领状态） |
| **GET** | `/api/data` | 是 | 获取整页快照 `{ ok, doc, updatedAt, rev }` |
| **PUT** | `/api/data` | 是 | 提交整页快照（乐观锁校验，冲突返回 409） |
| **GET** | `/api/memos?since=` | 是 | 增量读取便签 |
| **PUT / DELETE** | `/api/memos/:id` | 是 | 单条写入/删除便签（携带 `expectedUpdatedAt`） |
| **GET / PUT** | `/api/clipboard` | 是 | 读取/写入共享草稿 |
| **GET** | `/api/icon?domain=` | 可选 | 获取网站 Favicon（公共缓存） |
| **GET** | `/api/title?url=` | 可选 | 抓取网页标题（支持 og:title 与 twitter:title 回退） |
| **GET** | `/api/cache/capabilities` | 是 | 元数据缓存能力与限额 |
| **POST** | `/api/cache/refresh` | 是 | 授权刷新元数据缓存 |
| **GET** | `/api/admin/users` | 管理员 | 用户列表 |
| **PATCH** | `/api/admin/users/:id` | 管理员 | 修改用户角色/状态（审批、禁用） |
| **POST** | `/api/admin/claim-legacy` | 管理员 | 认领旧版单用户快照 |
| **POST** | `/api/admin/cache/invalidate-public` | 管理员 | 失效公共图标缓存 |

### 快照更新请求示例 (`PUT /api/data`)

```json
{
  "doc": {
    "categories": [...],
    "subSections": [...],
    "subCategories": [...],
    "bookmarks": [...],
    "totpAccounts": [...],
    "settings": {...}
  },
  "updatedAt": 1790615118893,
  "expectedUpdatedAt": 1790610000000,
  "force": false
}
```

快照中不能再包含 `memos` 字段，否则返回 `400 upgrade_required`。

---

## 📄 开源协议

本项目采用 MIT License 开源许可协议。

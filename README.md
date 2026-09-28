# nav

本地优先（Local-First）、现代化个人专属浏览器起始页与生产力工作台。

---

## 💡 About (关于本项目)

**nav** 是一款为开发者与知识工作者打造的高颜值、高定制、隐私安全的现代化浏览器导航站与个人工作台。

### 核心设计哲学

- **本地优先 (Local-First)**：所有分类、书签、草稿、待办与个性化外观配置默认完整保存在浏览器本地的 IndexedDB（基于 Dexie 驱动，库名 `nav-workspace-v2`）。无需注册、无需开箱连接后端即可离线流畅使用，零第三方跟踪与隐私收集，冷启动毫秒级加载。
- **优雅视觉体系**：采用现代化半透明磨砂毛玻璃卡片（Backdrop Blur）、深浅色主题无缝切换、多列书签网格、壁纸模糊度/遮罩调节，以及支持十六进制色值的「全局主题高亮色」，兼具观赏性与高密度实用性。
- **常驻生产力工作台 (Persistent Workbench)**：桌面端右侧配备常驻工作面板，内置可随内容自动撑高的即时草稿板、待办清单、番茄专注钟与重要倒数日看板，让导航页从单纯的“网站目录”升维为日常开机即用的工作中枢。
- **坚固而轻量的云同步**：提供开箱即配的 Cloudflare Worker + D1（托管 SQLite）云端服务。基于原子快照与乐观并发冲突控制，换设备或多端办公时仅凭一个密钥即可一键秒级恢复，拒绝静默覆盖。

---

## ✨ 核心特性

- 🗂️ **书签与多级体系**：支持主分类自由添加与拖拽排序、下级分组与二级子分类、书签跨分类拖拽重排与批量管理。
- 🌐 **网站图标智能抓取与本地缓存**：内置多源 Favicon 解析策略与 Worker 后端代理，抓取成功后转为 Base64 缓存在本地 IndexedDB，避免二次请求和外链失效。
- 🔍 **多引擎即时搜索**：聚合 Google、Baidu、Bing、GitHub、DuckDuckGo 等搜索引擎，支持快捷键切换。
- 📝 **自适应草稿板 (Scratchpad)**：临时代码、调试命令、JSON 片段随手暂存；文本框随输入内容自动向下平滑撑高，单层滚动条与卡片自然贴合，支持一键快速复制全文与清空。
- ⏱️ **番茄钟专注与倒数日**：内置 25min 工作 + 5min 休息标准番茄钟，联动待办事项一键开启专注；支持添加重大节假日或里程碑倒数日。
- 🔐 **TOTP / 2FA 二次验证口令**：纯前端安全计算生成 6 位动态验证码，关键账号安全凭证全由本地掌控。
- 🎨 **深度外观定制**：支持自定义网络或本地壁纸、卡片宽度、背景透明度、模糊度、字体族、图标圆角以及全局主题高亮强调色。

---

## 🚀 前端部署教程 (Frontend)

前端项目基于 **React 19 + TypeScript + Vite + Tailwind CSS v4** 构建，产物为纯静态文件，支持部署到任意静态托管服务。

### 1. 本地开发与调试

确保本地已安装 Node.js (推荐 v20+)：

```bash
# 安装项目依赖
npm install

# 启动本地开发服务器（默认端口 5173）
npm run dev
```

浏览器打开 `http://127.0.0.1:5173` 即可实时预览并支持热重载（HMR）。

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

云端数据同步服务位于 [worker/](worker/) 目录，基于 **Cloudflare Workers** 无服务器函数与 **Cloudflare D1**（边缘托管 SQLite 数据库）构建。

### 1. 架构与数据存储机制

- **存储模型**：采用单表单行快照模型（`nav_docs` 表，行 ID 固定为 `'default'`），整份导航快照（包含分类、书签、备忘录、TOTP、外观设置）序列化为单行 JSON。
- **为什么是单行快照**：前端本地拥有完整的状态和离线操作能力，单行快照能做到原子覆盖，无需两端维护复杂的双向增量 diff，几百条书签约 100~300KB，远低于 D1 单行 2MB 限制。
- **图标缓存隔离**：体积庞大的网站图标（Base64 缓存）刻意留在浏览器本地 IndexedDB，不上传云端，保证云同步毫秒级完成。
- **并发冲突防护 (Optimistic Locking)**：写入时携带客户端基于的版本号 `expectedUpdatedAt`，若服务端在此期间已被其他设备更新则返回 `409 Conflict`，前端弹窗提示由用户选择保留云端还是强制覆盖，彻底杜绝多端静默覆盖。

### 2. 一次性部署步骤

进入 `worker/` 目录执行以下步骤（前 4 步仅需首次配置）：

```bash
cd worker

# 1. 安装 Wrangler 命令行工具
npm install

# 2. 登录并授权 Cloudflare 账号（会唤起浏览器完成登录）
npx wrangler login

# 3. 创建 D1 数据库
npx wrangler d1 create nav-sync
```

执行完第 3 步后，终端会输出一段类似配置：

```toml
[[d1_databases]]
binding = "DB"
database_name = "nav-sync"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

将返回的实际 `database_id` 替换填入 `worker/wrangler.toml` 文件中。

```bash
# 4. 在远程 D1 数据库执行表结构初始化
npx wrangler d1 execute nav-sync --remote --file=./schema.sql

# 5. 配置安全的云同步鉴权密钥 (SYNC_TOKEN)
# 提示输入时粘贴一个长随机字符串（建议在前端设置面板点「生成随机 Token」获取）
npx wrangler secret put SYNC_TOKEN

# 6. 部署 Worker 到 Cloudflare 边缘节点
npx wrangler deploy
```

部署完成后，终端将输出你的 Worker 服务公网地址，格式如：

```text
https://nav-sync.<你的账号子域名>.workers.dev
```

### 3. 前端绑定云同步

1. 打开导航页，点击右上角设置图标（齿轮）进入「全局设置」；
2. 切换至「云端同步」选项卡；
3. 填入刚才部署的 Worker 地址（如 `https://nav-sync.xxx.workers.dev`）以及设置的 `SYNC_TOKEN`；
4. 点击「测试连接并保存」，状态亮起绿灯即表示云同步服务已成功连通。

### 4. 本地模拟与日常运维

```bash
# 在本地环境模拟 D1 数据库开发
npm run db:init:local
npm run dev # 启动本地 Worker 调试，默认监听 http://127.0.0.1:8788

# 查看远程数据库数据状态
npx wrangler d1 execute nav-sync --remote --command "SELECT id, updated_at, rev, updated_by, length(doc) as doc_len FROM nav_docs"

# 查看线上实时请求日志
npx wrangler tail

# 轮换同步密钥（轮换后所有使用中的设备需在设置面板同步更新）
npx wrangler secret put SYNC_TOKEN
```

---

## 📡 API 接口规范 (API Reference)

所有对云端快照的读写操作均需要通过 HTTP Authorization 请求头携带 Bearer Token 进行鉴权：

```http
Authorization: Bearer <SYNC_TOKEN>
```

| 请求方法 | 路径 | 鉴权要求 | 说明 |
| :--- | :--- | :---: | :--- |
| **GET** | `/` | 否 | 健康检查，返回服务状态及是否已配置云端 Secret |
| **GET** | `/api/data` | **是** | 获取云端导航页快照数据 `{ ok, doc, updatedAt, rev }` |
| **PUT** | `/api/data` | **是** | 提交导航数据快照（包含版本并发校验与乐观锁判定） |
| **GET** | `/api/icon` | 否 | 智能提取/代理指定域名的网站 Favicon 图标 |
| **GET** | `/api/title` | 否 | 解析并抓取目标 URL 的网页标题（支持 og:title 与 twitter:title 回退） |

### 快照更新请求示例 (`PUT /api/data`)

```json
{
  "doc": {
    "categories": [...],
    "subSections": [...],
    "subCategories": [...],
    "bookmarks": [...],
    "memos": [...],
    "totpAccounts": [...],
    "settings": {...}
  },
  "updatedAt": 1790615118893,
  "expectedUpdatedAt": 1790610000000,
  "force": false
}
```

---

## 📦 Release (发版说明与发版规范)

### 语义化分支模型

本项目遵循标准规范化的分支发布策略：

- **`main` 分支**：生产稳定分支。每次向 `main` 合并时，GitHub Actions 会构建部署至正式线上环境。
- **`dev` 分支**：日常功能开发与集成测试分支。推送到 `dev` 会自动发布至预览环境（`/dev/` 子路径），供即时测试。

### 发版工作流

1. 新功能开发、样式调优及 Bug 修复在 `dev` 分支完成并自测；
2. 推送 `dev` 分支后，在 GitHub 上发起 Pull Request（`base: main` ← `compare: dev`）；
3. 建议采用 **压缩合并 (Squash and Merge)** 将多条细碎迭代整理为一条清晰规范的 Commit 归入主线；
4. 合并成功后，GitHub Pages 自动触发正式主站上线。

### 版本演进亮点

- **v2.2.0**：
  - 增强右侧常驻工作台草稿板体验，支持随文字行数向下平滑自适应展开（Auto-grow），移除原 420px 封顶限制；
  - 彻底封杀 `<textarea>` 原生内核在文本溢出计算时的双滚动条干扰，保持纯净单层滚动；
  - 优化长文本编辑底端视口自动跟随逻辑。
- **v2.1.0**：
  - 新增「全局主题高亮焦点色」，统一搜索引擎指示灯、日历、待办进度、专注番茄钟焦点色调；
  - 扩充预设各领域精品书签资源与多级二级分类。
- **v2.0.0**：
  - 架构重构为右侧常驻多功能工作台（草稿板、待办清单、番茄钟、倒数日）；
  - 引入 Cloudflare D1 边缘单行文档快照存储与原子冲突判决机制；
  - 全面支持 TOTP 动态安全验证码。

---

## 📄 开源协议

本项目采用 MIT License 开源许可协议。

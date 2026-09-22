# nav

本地优先的个人导航页。当前版本包含分类切换、紧凑书签卡片、增删改、拖拽排序/移动、多搜索引擎、壁纸与透明度设置、日历和备忘录抽屉。

## 开发

```bash
npm install
npx vite --host 127.0.0.1 --port 5173
```

## 构建

```bash
npm run build
```

## 数据存在哪

默认情况下数据只保存在浏览器的 IndexedDB（Dexie，库名 `nav-workspace-v2`）里，
纯静态部署、没有任何服务端。代价是：清 cookie / 清站点数据 / 换浏览器 / 换设备都会丢。

想要数据离开单台浏览器，可以启用可选的云同步：`worker/` 目录是一个 Cloudflare
Worker + D1（托管 SQLite），把整份数据存到云端，换设备时填一次 token 就能整份恢复。
部署步骤见 [worker/README.md](worker/README.md)。

启用后：IndexedDB 仍然是本地缓存（离线可用），云端是防丢的那一层；写入采用
「谁更新谁生效 + 乐观并发校验」，落后的设备不会静默覆盖云端更新，拿不准时会停下来让你选。

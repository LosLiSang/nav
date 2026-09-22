-- nav-sync 的数据表：整个导航页快照存成一行文档。
--
-- 为什么是单行 JSON 而不是拆成 categories / bookmarks 多张表：
-- 前端所有写操作都是「本地 IndexedDB 先写、再整体推一次」，单行文档能做到
-- 原子覆盖 + 基于 updated_at 的冲突判定，不需要在两端维护增量同步。
-- 数据量级（几百条书签 ≈ 100~300KB）远低于 D1 单行 2MB 的限制。
--
-- 注意：图标缓存（base64 dataUrl）故意不进这个表，它是可再生的缓存，
-- 同步它既撑大体积又没意义，所以只留在浏览器本地。

CREATE TABLE IF NOT EXISTS nav_docs (
  id         TEXT    PRIMARY KEY,
  doc        TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_nav_docs_updated_at ON nav_docs (updated_at);

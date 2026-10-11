-- 单用户时代的整页快照表（已存在于线上库，IF NOT EXISTS 保证可重复执行）。
-- 用户体系上线后它只作为旧数据来源：管理员认领后复制到 user_docs，原表不删。

CREATE TABLE IF NOT EXISTS nav_docs (
  id         TEXT    PRIMARY KEY,
  doc        TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_nav_docs_updated_at ON nav_docs (updated_at);

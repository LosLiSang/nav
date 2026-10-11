-- #23：独立工作台；保留旧快照并原样记录迁移备份，禁止删除业务数据。
CREATE TABLE IF NOT EXISTS user_memos (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY(user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_user_memos_delta ON user_memos(user_id, updated_at);
CREATE TABLE IF NOT EXISTS workbench_migrations (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  backup_doc TEXT NOT NULL,
  migrated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_clipboard (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 独立可再生缓存；不修改或删除任何用户业务表。
CREATE TABLE IF NOT EXISTS metadata_state (
  id TEXT PRIMARY KEY,
  epoch INTEGER NOT NULL DEFAULT 1,
  changed_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO metadata_state (id) VALUES ('public-icons');
CREATE TABLE IF NOT EXISTS metadata_cache (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('icon', 'title')),
  scope TEXT NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  generation INTEGER NOT NULL DEFAULT 0,
  value BLOB,
  title TEXT,
  content_type TEXT,
  byte_size INTEGER NOT NULL DEFAULT 0,
  fresh_until INTEGER NOT NULL DEFAULT 0,
  stale_until INTEGER NOT NULL DEFAULT 0,
  retry_at INTEGER NOT NULL DEFAULT 0,
  touched_at INTEGER NOT NULL,
  lease_owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS metadata_scope ON metadata_cache(scope, kind, touched_at);
CREATE INDEX IF NOT EXISTS metadata_leases ON metadata_cache(lease_until);
CREATE TABLE IF NOT EXISTS metadata_limits (
  id TEXT PRIMARY KEY,
  used INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS metadata_operations (
  actor TEXT NOT NULL,
  id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  results TEXT,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(actor, id)
);
CREATE TABLE IF NOT EXISTS metadata_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  resource_hash TEXT,
  kind TEXT NOT NULL,
  operation_id TEXT,
  result TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS metadata_audit_time ON metadata_audit(created_at);

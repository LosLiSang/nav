-- 用户体系（#9）：GitHub 登录、会话、按用户隔离的快照、旧数据认领。
-- 所有令牌（会话、OAuth state、一次性登录码）只存 SHA-256，不存明文。

CREATE TABLE IF NOT EXISTS users (
  id            TEXT    PRIMARY KEY,
  github_id     INTEGER NOT NULL UNIQUE,
  login         TEXT    NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  role          TEXT    NOT NULL DEFAULT 'user'    CHECK (role IN ('admin', 'user')),
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT    PRIMARY KEY,
  return_to  TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_codes (
  code_hash  TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- 每个用户一行整页快照，语义与 nav_docs 相同（乐观并发 + 409 冲突）
CREATE TABLE IF NOT EXISTS user_docs (
  user_id    TEXT    PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  doc        TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  rev        INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT
);

-- 旧单用户快照的一次性认领记录，同时保存认领时的原样备份
CREATE TABLE IF NOT EXISTS legacy_claims (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT    NOT NULL,
  claimed_at        INTEGER NOT NULL,
  backup_doc        TEXT    NOT NULL,
  backup_updated_at INTEGER NOT NULL,
  backup_rev        INTEGER NOT NULL,
  replaced_doc      TEXT
);

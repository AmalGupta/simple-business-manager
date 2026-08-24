-- D1 migration 0009 — per-person accounts and sessions, replacing "who did
-- this" with real identity for the first time (previously just the shared
-- X-SBM-Key secret). Admin-seeded roster only (POST /api/admin/users, gated
-- by X-SBM-Key) — no public signup. Login is name + short PIN; see
-- src/lib/auth.ts for the hashing scheme. Mirrors packages/core/src/schema.sql.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,   -- login identifier
  pin_hash        TEXT NOT NULL,          -- PBKDF2-SHA256(pepper + pin, salt), hex
  pin_salt        TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  disabled_at     TEXT,                   -- soft-disable; preserves attribution on historical rows
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,         -- SHA-256(raw token); cookie carries the raw token, never this
  user_id       TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

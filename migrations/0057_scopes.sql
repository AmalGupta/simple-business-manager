-- SBM-81 — component/page-level read-only scopes.
-- Applies when an admin/superadmin views a staff member's dashboard (view-as).
-- The scope keys live in code (packages/core/src/scopes.ts); a missing row means
-- "registry default" (read), so new components ship safe without seed data.
CREATE TABLE scope_role_grants (
  role       TEXT NOT NULL,                 -- admin | superadmin
  scope_key  TEXT NOT NULL,
  level      TEXT NOT NULL,                 -- none | read | write
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (role, scope_key)
);

CREATE TABLE scope_user_overrides (
  user_id    TEXT NOT NULL REFERENCES users(id),
  scope_key  TEXT NOT NULL,
  level      TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, scope_key)
);

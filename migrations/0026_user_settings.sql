-- Per-user product customization (UI prefs). Key/value strings; app layer
-- owns typed defaults and validation (packages/core/src/user-customization.ts).
CREATE TABLE user_settings (
  user_id    TEXT NOT NULL REFERENCES users(id),
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);

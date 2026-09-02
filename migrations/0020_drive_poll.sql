-- Google Drive Calls-folder poller: idempotent file ids + app settings toggle.

ALTER TABLE calls ADD COLUMN drive_file_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_drive_file_id
  ON calls(drive_file_id)
  WHERE drive_file_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

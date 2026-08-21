-- D1 migration 0004 — separate "when this was uploaded" (recorded_at) from
-- "when the call actually happened" (recording_date, from the recorder's
-- filename timestamp). recorded_at previously did double duty: it preferred
-- the filename timestamp and only fell back to upload time when the
-- filename didn't match. Now recorded_at is always upload time, and
-- recording_date holds the filename-parsed value (NULL if unparseable).
-- Mirrors packages/core/src/schema.sql (§4).
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

ALTER TABLE calls ADD COLUMN recording_date TEXT;

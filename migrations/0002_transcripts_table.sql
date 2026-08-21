-- D1 migration 0002 — split transcript storage into its own table, linked
-- by r2_key, instead of columns on `calls`. Mirrors packages/core/src/schema.sql (§4).
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

CREATE TABLE transcripts (
  id                  TEXT PRIMARY KEY,
  r2_key              TEXT NOT NULL UNIQUE REFERENCES calls(r2_key),
  transcript          TEXT NOT NULL,
  language_code       TEXT,
  diarized_transcript TEXT,            -- JSON: { entries: [{ speaker_id, transcript }] }
  fetched_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transcripts_r2_key ON transcripts(r2_key);

INSERT INTO transcripts (id, r2_key, transcript, language_code, fetched_at)
SELECT lower(hex(randomblob(16))), r2_key, transcript, language_code, created_at
FROM calls
WHERE transcript IS NOT NULL;

ALTER TABLE calls DROP COLUMN transcript;
ALTER TABLE calls DROP COLUMN language_code;

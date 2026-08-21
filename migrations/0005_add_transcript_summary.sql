-- D1 migration 0005 — add transcripts.summary. Placeholder column: not
-- written by any code path yet, distinct from calls.summary (the LLM
-- six-field extraction). Mirrors packages/core/src/schema.sql (§4).
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

ALTER TABLE transcripts ADD COLUMN summary TEXT;

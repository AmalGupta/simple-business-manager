-- D1 migration 0003 — rename stt_status 'submitted' to 'transcription_in_progress'
-- for a clearer dashboard-facing label. Mirrors packages/core/src/schema.sql (§4).
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

UPDATE calls SET stt_status = 'transcription_in_progress' WHERE stt_status = 'submitted';

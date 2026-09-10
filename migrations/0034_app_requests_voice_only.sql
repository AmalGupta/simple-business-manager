-- D1 migration 0034 — reworks app_requests (0033) to be voice-only: the
-- staff/admin request page now records a spoken request instead of typing
-- one, transcribed through the same Sarvam batch pipeline as a site voice
-- note (src/lib/sarvam.ts) and then formatted + filed to Jira by the
-- webhook once the transcript lands (src/handlers/stt-webhook.ts). Mirrors
-- packages/core/src/schema.sql.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote
--
-- `text` (0033) is repurposed to hold the transcript once Sarvam completes
-- rather than free-typed input — no column change needed, it's always
-- inserted as '' now and updated once the transcript arrives. `status`
-- gains an intermediate 'transcribing' value between 'pending' and
-- 'submitted'/'failed' (not enforced by a CHECK, same as 0033).

ALTER TABLE app_requests ADD COLUMN r2_key TEXT;
ALTER TABLE app_requests ADD COLUMN stt_job_id TEXT;
-- Snapshot at submit time — titles the Jira issue [Staff-Request]/[Admin-Request].
ALTER TABLE app_requests ADD COLUMN created_by_role TEXT NOT NULL DEFAULT 'staff';

CREATE INDEX idx_app_requests_stt_job_id ON app_requests(stt_job_id);

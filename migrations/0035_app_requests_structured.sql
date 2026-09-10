-- D1 migration 0035 — structured fields for the My requests grid:
-- Claude fills speaker_name / title / summary once the transcript lands;
-- jira_status is snapshotted from the issue right after create.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

ALTER TABLE app_requests ADD COLUMN speaker_name TEXT;
ALTER TABLE app_requests ADD COLUMN title TEXT;
ALTER TABLE app_requests ADD COLUMN summary TEXT;
ALTER TABLE app_requests ADD COLUMN jira_status TEXT;

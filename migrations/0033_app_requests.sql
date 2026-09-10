-- D1 migration 0033 — app_requests: an in-app "request an issue/feature"
-- form (any logged-in staff or admin session) that files straight into
-- Jira via src/lib/jira.ts. Mirrors packages/core/src/schema.sql.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote
--
-- The Jira write happens synchronously in the handler right after the
-- insert below, then updates this same row with the result — so a row
-- always exists even if Jira is unreachable (status stays 'failed', with
-- `error` set), and the submitter never loses what they typed.

CREATE TABLE app_requests (
  id                 TEXT PRIMARY KEY,
  text               TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_by_name    TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending | submitted | failed
  jira_issue_key     TEXT,
  jira_issue_url     TEXT,
  error              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_app_requests_created_by ON app_requests(created_by_user_id, created_at);

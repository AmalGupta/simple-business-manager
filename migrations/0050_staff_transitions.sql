-- SBM-64: staff transitions — a joining date for new staff, and a
-- notice-period offboarding workflow.
--
-- joined_on: the day a staff member starts. The Staff list shows it, the
--   roster shows their row from that day, and login is refused before it.
--   Existing accounts backfill to the day the login was created.
-- last_working_day: set when an admin starts offboarding. Until then the
--   admin moves the leaver's open work to others; the day after it,
--   finalizeDueOffboardings (cron) sends anything left to the owner's
--   routing queue and sets disabled_at. disabled_at, not a delete, so the
--   leaver's name stays on every past call, stage and audit row.

ALTER TABLE users ADD COLUMN joined_on TEXT;               -- yyyy-mm-dd
ALTER TABLE users ADD COLUMN last_working_day TEXT;        -- yyyy-mm-dd, NULL unless offboarding
ALTER TABLE users ADD COLUMN offboarding_started_at TEXT;
ALTER TABLE users ADD COLUMN offboarding_started_by TEXT REFERENCES users(id);

UPDATE users SET joined_on = date(created_at) WHERE joined_on IS NULL;

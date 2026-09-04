-- Follow-up to 0023: two of the Calls page's query costs weren't actually
-- fixed by that migration's plain-column indexes.
--
-- 1. buildCallListWhere's date_from/date_to comparison in queries.ts is
--    `COALESCE(calls.recording_date, substr(calls.recorded_at, 1, 10)) >= ?`
--    — a function-wrapped expression, not a bare column, so a plain index
--    on `recording_date` (idx_calls_recording_date, added in 0023) can
--    never be used for it. Replaced here with an expression index matching
--    that exact shape. idx_calls_recording_date is dropped since nothing
--    queries the bare `recording_date` column on its own — keeping it
--    around would misleadingly suggest the date filter was covered.
--
-- 2. countCallsMatching's `WHERE calls.deleted_at IS NULL AND
--    calls.stt_status != 'skipped'` runs on every single page fetch (not
--    just the first) and had no supporting index at all, so it was a full
--    table-row scan every time. A composite index lets it run as a
--    narrower index-only scan instead — still roughly O(matching rows)
--    since most rows satisfy both predicates, but far cheaper per row than
--    reading full table pages.

DROP INDEX idx_calls_recording_date;

CREATE INDEX idx_calls_effective_date
  ON calls(COALESCE(recording_date, substr(recorded_at, 1, 10)));

CREATE INDEX idx_calls_deleted_status ON calls(deleted_at, stt_status);

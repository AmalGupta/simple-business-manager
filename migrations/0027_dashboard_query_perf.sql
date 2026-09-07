-- SBM-18: dashboard/summary queries were getting slower as `calls` grows,
-- independent of how many calls actually need attention on a given day.
--
-- 1. Calls Needing Action (countCallsNeedingAction / getCallsNeedingAction,
--    queries.ts). In practice almost nobody uses the manual "Resolve" ack
--    (31 of 4032 UAT calls resolved), so `resolved_at IS NULL` matches
--    ~99% of the table. The list query's `ORDER BY
--    COALESCE(recording_date, substr(recorded_at,1,10)), recorded_at` had
--    no supporting index, so SQLite pulled ~every unresolved call and
--    sorted the whole set just to hand back the oldest 200
--    (confirmed via EXPLAIN QUERY PLAN on UAT: SEARCH ... USING INDEX
--    idx_calls_resolved_at, no index used for the ORDER BY). This
--    composite expression index lets it walk already-sorted and stop at
--    LIMIT instead of scanning+sorting the whole matching set, and grows
--    with "how many are actually old", not with total call count.
--    Supersedes the plain idx_calls_resolved_at from migration 0025.
--
-- 2. closed_today (getDashboardSummary, queries.ts): `WHERE status='done'
--    AND substr(completed_at,1,10)=?` — the substr() wrapper defeats a
--    plain index the same way calls.recording_date did before migration
--    0024 fixed that case. Zero `done` todos on UAT today, but the count
--    scans the entire done-todos history on every dashboard load and that
--    only grows. Same expression-index fix, applied here before it bites.

DROP INDEX idx_calls_resolved_at;

CREATE INDEX idx_calls_needing_action
  ON calls(resolved_at, deleted_at, (COALESCE(recording_date, substr(recorded_at, 1, 10))), recorded_at);

CREATE INDEX idx_todos_status_completed_date
  ON todos(status, (substr(completed_at, 1, 10)));

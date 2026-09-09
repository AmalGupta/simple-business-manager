-- SBM-26: the "when did this call happen" expression was truncating the wrong
-- side of its COALESCE, and both indexes on it encoded that mistake.
--
-- queries.ts used `COALESCE(recording_date, substr(recorded_at, 1, 10))`,
-- which only truncates the fallback. But `recording_date` is itself a full
-- timestamp — it's the recorder's own filename timestamp (migration 0004,
-- e.g. "2026-09-03T04:11:49.000Z"), and it's non-NULL for 293 of the 305
-- calls on dev — so for nearly every row the expression returned a timestamp
-- where a date was meant. That broke two things:
--
--   1. Every windowed query silently dropped the last day of its window: no
--      timestamp is ever `<= '2026-09-03'`. Measured on dev, the Calls
--      Needing Action window 1–3 Sept returned 62 calls instead of 93 — the
--      31 missing ones were all of 3 Sept. Same off-by-a-day in the Calls
--      page's date_from/date_to filters (buildCallListWhere).
--
--   2. `GROUP BY` on it grouped per second rather than per day, so the Calls
--      Needing Action date strip received keys like
--      "2026-09-03T04:11:49.000Z" that could never match the yyyy-mm-dd day
--      it renders, and showed no dots on any day.
--
-- The expression is now `substr(COALESCE(recording_date, recorded_at), 1, 10)`
-- — the same shape migration 0028 already uses for site-discovery ordering,
-- which got this right. SQLite matches expression indexes by shape, so both
-- indexes have to be rebuilt against the corrected string or every date
-- filter quietly reverts to a table scan. Rebuilt rather than corrected in
-- place: an applied migration is never edited (see 0014 correcting 0013).
--
-- idx_calls_effective_date came from 0024 (the Calls page date filter);
-- idx_calls_needing_action from 0027 (the carousel's ORDER BY + its
-- resolved_at/deleted_at predicates). Neither changes shape here beyond the
-- expression itself.

DROP INDEX idx_calls_effective_date;

CREATE INDEX idx_calls_effective_date
  ON calls(substr(COALESCE(recording_date, recorded_at), 1, 10));

DROP INDEX idx_calls_needing_action;

CREATE INDEX idx_calls_needing_action
  ON calls(resolved_at, deleted_at, (substr(COALESCE(recording_date, recorded_at), 1, 10)), recorded_at);

-- SBM-23: the Callers Directory ("Clients" screen) query is
--   WHERE callers.category = ? ORDER BY callers.name ASC
-- idx_callers_category (migration 0021) covers the filter but not the
-- sort, so SQLite index-seeks the category then sorts the matching rows
-- in memory. Cheap at today's ~90 client-category rows, but the callers
-- table is the target of a ~3.3k-row full-contacts re-import (see
-- docs/UAT_RESET_RUNBOOK.md), so it won't stay cheap by accident. This
-- composite index lets the query walk already-sorted-by-name within a
-- category instead of sorting after the fact.

DROP INDEX idx_callers_category;

CREATE INDEX idx_callers_category ON callers(category, name);

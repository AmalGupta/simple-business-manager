-- D1 migration 0037 — site display name recomputation (marker).
--
-- The set-based CTE that mirrors composeSiteNameBeingUsed OOMs remote D1
-- (SQLITE_NOMEM) even when staged into a temp table — D1 re-evaluates the
-- graph under memory pressure on this account. Data rewrite is therefore
-- done by scripts/backfill-site-display-names.mjs (same rules as
-- packages/core/src/queries.ts composeSiteNameBeingUsed).
--
-- After `wrangler d1 migrations apply …`, run:
--   node scripts/backfill-site-display-names.mjs dev
--   node scripts/backfill-site-display-names.mjs uat
-- Deploy scripts call the backfill automatically when this migration is new.

SELECT 1;

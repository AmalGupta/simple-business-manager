-- D1 migration 0028 — record which call a site came from, so the review
-- screen can answer "who said this, and when" before someone marks an
-- unconfirmed site valid or not valid. Mirrors packages/core/src/schema.sql.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote
--
-- Until now the only call<->site linkage was `call_sites` (call_id, site_id)
-- with no ordering or "discovered by" marker, so a site name hallucinated by
-- the Haiku scan (packages/core/prompts/site-scan.ts, whose rule 3 lets it
-- report names that aren't on the roster) arrived on the review screen as a
-- bare string with nothing to judge it against.
--
-- The column holds the call id rather than a copy of the caller name and
-- date: caller names are editable in the Callers Directory, and a snapshot
-- would drift. Reads join through to `calls`/`callers` — see SITE_ROW_SELECT
-- in packages/core/src/queries.ts.

ALTER TABLE sites ADD COLUMN discovered_from_call_id TEXT REFERENCES calls(id);

-- Backfill. Going forward upsertSite stamps the call that actually created
-- the row; for sites that already exist that call is gone, so the earliest
-- linked call is the closest available answer — it's the first call we know
-- mentioned the name. Ordering truncates to a day because recording_date is
-- not uniformly day-granular (UAT rows carry full ISO timestamps, so a bare
-- COALESCE would sort '2026-09-04' before '2026-09-04T05:00:00Z'); ties then
-- break on recorded_at, the upload timestamp.
--
-- Spam calls are excluded: a soft-deleted call is hidden everywhere else in
-- the app, so it must not surface as a site's origin either. A site whose
-- only links are spam calls stays NULL and reads as "no originating call",
-- which is the honest answer.
--
-- The nine sites seeded by migration 0006 have no call_sites rows at all and
-- stay NULL — they were hardcoded from the transcript analysis, not
-- discovered from a call, so there is no provenance to recover.
UPDATE sites
SET discovered_from_call_id = (
  SELECT cs.call_id
  FROM call_sites cs
  JOIN calls c ON c.id = cs.call_id
  WHERE cs.site_id = sites.id
    AND c.deleted_at IS NULL
  ORDER BY substr(COALESCE(c.recording_date, c.recorded_at), 1, 10) ASC, c.recorded_at ASC
  LIMIT 1
)
WHERE discovered_from_call_id IS NULL;

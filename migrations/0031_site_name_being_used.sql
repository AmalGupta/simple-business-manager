-- D1 migration 0031 — the name the site tables show, composed from the
-- details: "#244, IAS-PCS | CL. Raj Kamal Ji". Mirrors
-- packages/core/src/schema.sql.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote
--
-- A second column rather than a rewrite of `name`, so the two can be used
-- interchangeably: `name` remains the pipeline's match key (upsertSiteByName
-- conflicts on it, and the extraction roster reads it), while this is what
-- the Sites and Review Sites grids render. NULL while a site carries none of
-- the details — a site discovered from a call is just its name until someone
-- fills the form in.

ALTER TABLE sites ADD COLUMN site_name_being_used TEXT;

-- Backfill for sites whose details were filled in before this column
-- existed. Going forward createSite and updateSite write it through
-- composeSiteNameBeingUsed in packages/core/src/queries.ts; the stages below
-- are that function expressed once in SQL, and the two have to agree:
--
--   locality = sector-city, or whichever of the two exists
--   address  = "#<house_no>, <locality>", or whichever part exists
--   result   = address (falling back to `name` when there is no address),
--              plus " | CL. <poc_name>" when there is a contact person
--
-- nullif(trim(...)) throughout because a blank string means "not filled in"
-- here, the same way the TS helper treats it — rows from the earlier intake
-- form carry '' rather than NULL. Concatenation with NULL yields NULL in
-- SQLite, which is what makes the coalesce chains pick the right shape
-- instead of producing "#244, " or "-PCS".
WITH cleaned AS (
  SELECT id,
         nullif(trim(coalesce(house_no, '')), '') AS hn,
         nullif(trim(coalesce(sector, '')), '')   AS se,
         nullif(trim(coalesce(city, '')), '')     AS ci,
         nullif(trim(coalesce(poc_name, '')), '') AS pc,
         nullif(trim(coalesce(name, '')), '')     AS nm
  FROM sites
),
located AS (
  SELECT id, hn, pc, nm, coalesce(se || '-' || ci, se, ci) AS locality FROM cleaned
),
addressed AS (
  SELECT id, pc, nm, coalesce('#' || hn || ', ' || locality, '#' || hn, locality) AS address FROM located
),
composed AS (
  SELECT id,
         CASE
           WHEN address IS NULL AND pc IS NULL THEN NULL
           WHEN pc IS NULL THEN address
           ELSE coalesce(address, nm, '') || ' | CL. ' || pc
         END AS display_name
  FROM addressed
)
UPDATE sites
SET site_name_being_used = (SELECT display_name FROM composed WHERE composed.id = sites.id)
WHERE site_name_being_used IS NULL;

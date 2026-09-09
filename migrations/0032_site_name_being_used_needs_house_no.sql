-- D1 migration 0032 — corrects the composed name that 0031 introduced.
-- Mirrors packages/core/src/schema.sql and composeSiteNameBeingUsed in
-- packages/core/src/queries.ts.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote
--
-- Two changes, both found by running 0031 against real UAT data:
--
-- 1. The address half now requires a house number AND a locality, where 0031
--    built it from any one of house_no/sector/city. Replacing the name costs
--    whatever only the name carried, so a partial address is not worth it:
--    six UAT sites hold a locality alone, which made "Homeland REGALI" and
--    "E NEST BUILDING (CHAWLA SIR)" both read "AIRPORT ROAD" and "Twin Tower
--    MARBELLA GRAND" and "THE TIARA" both read "NEW CHANDIGARH"; and
--    "H.NO 244 IAS Society" holds a house number alone, where "#244" drops
--    the society nobody typed into a field. Short of both, the site keeps its
--    own name and only takes the client suffix.
--
-- 2. A house number that already carries its label ("H.NO 244", "H.NO E1")
--    has that prefix stripped, so the row reads "#244" rather than
--    "#H.NO 244". Only when something follows the prefix — a lone "H.NO" is
--    left as typed instead of being blanked. The CASE below is the SQL mirror
--    of HOUSE_NO_PREFIX in queries.ts; the two have to stay in step.
--
-- Every row is recomputed, not just the NULL ones: 0031 has already written
-- wrong values on both dev and UAT, and rows that no longer qualify have to
-- go back to NULL so the grids fall back to sites.name.

WITH cleaned AS (
  SELECT id,
         nullif(trim(coalesce(house_no, '')), '') AS hn,
         nullif(trim(coalesce(sector, '')), '')   AS se,
         nullif(trim(coalesce(city, '')), '')     AS ci,
         nullif(trim(coalesce(poc_name, '')), '') AS pc,
         nullif(trim(coalesce(name, '')), '')     AS nm
  FROM sites
),
unprefixed AS (
  SELECT id, se, ci, pc, nm, hn,
         CASE
           WHEN hn LIKE 'HOUSE NO.%' THEN trim(substr(hn, 10))
           WHEN hn LIKE 'HOUSE NO%'  THEN trim(substr(hn, 9))
           WHEN hn LIKE 'HOUSENO.%'  THEN trim(substr(hn, 9))
           WHEN hn LIKE 'HOUSENO%'   THEN trim(substr(hn, 8))
           WHEN hn LIKE 'H.NO.%'     THEN trim(substr(hn, 6))
           WHEN hn LIKE 'H NO.%'     THEN trim(substr(hn, 6))
           WHEN hn LIKE 'HNO.%'      THEN trim(substr(hn, 5))
           WHEN hn LIKE 'H.NO%'      THEN trim(substr(hn, 5))
           WHEN hn LIKE 'H NO%'      THEN trim(substr(hn, 5))
           WHEN hn LIKE 'HNO%'       THEN trim(substr(hn, 4))
           WHEN hn LIKE '#%'         THEN trim(substr(hn, 2))
           ELSE hn
         END AS hn_bare
  FROM cleaned
),
located AS (
  -- coalesce back to the original when stripping leaves nothing, which is
  -- the SQL equivalent of the regex only matching when a value follows.
  SELECT id, pc, nm,
         coalesce(nullif(hn_bare, ''), hn) AS hn,
         coalesce(se || '-' || ci, se, ci) AS locality
  FROM unprefixed
),
addressed AS (
  -- Missing either half yields NULL through the concatenation, which is
  -- exactly the rule.
  SELECT id, pc, nm, '#' || hn || ', ' || locality AS address
  FROM located
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
SET site_name_being_used = (SELECT display_name FROM composed WHERE composed.id = sites.id);

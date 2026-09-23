-- D1 migration 0037 — site display name: keep pipeline identity, append
-- partial locality/address, client, and phone.
-- Mirrors composeSiteNameBeingUsed in packages/core/src/queries.ts.
-- Applied via: wrangler d1 migrations apply sbm-dev|sbm-uat --local|--remote
--
-- Fixes UAT cases where SiteView rebuilt a label from sector/city/phone and
-- dropped sites.name (Twin Tower → "NEW CHANDIGARH | …", Nobel → "SECTOR 88…",
-- AGI → "LUDHIANA"). Also appends poc_contact_number so grid and header match.
--
-- Rules (same as TS):
-- 1. Full house + locality → "#hn, locality" is the left identity (no name prepend).
-- 2. Else partial address (sites.address or sector/city locality) → prepend name.
-- 3. Client via " | CL. "; phone via " | " when set.
-- 4. House number alone still does not replace the name.

WITH cleaned AS (
  SELECT id,
         nullif(trim(coalesce(house_no, '')), '') AS hn,
         nullif(trim(coalesce(sector, '')), '') AS se,
         nullif(trim(coalesce(city, '')), '') AS ci,
         nullif(trim(coalesce(address, '')), '') AS ad,
         nullif(trim(coalesce(poc_name, '')), '') AS pc,
         nullif(trim(coalesce(poc_contact_number, '')), '') AS ph,
         nullif(trim(coalesce(name, '')), '') AS nm
  FROM sites
),
unprefixed AS (
  SELECT id, se, ci, ad, pc, ph, nm, hn,
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
  SELECT id, ad, pc, ph, nm,
         coalesce(nullif(hn_bare, ''), hn) AS hn,
         coalesce(se || '-' || ci, se, ci) AS locality
  FROM unprefixed
),
parts AS (
  SELECT id, pc, ph, nm,
         CASE WHEN hn IS NOT NULL AND locality IS NOT NULL
              THEN '#' || hn || ', ' || locality END AS full_address,
         CASE WHEN hn IS NOT NULL AND locality IS NOT NULL THEN NULL
              ELSE coalesce(ad, locality) END AS partial_address
  FROM located
),
meta AS (
  SELECT id, pc, ph, nm, full_address, partial_address,
         CASE
           WHEN full_address IS NOT NULL AND pc IS NOT NULL
             THEN full_address || ' | CL. ' || pc
           WHEN full_address IS NOT NULL
             THEN full_address
           WHEN partial_address IS NOT NULL AND pc IS NOT NULL
             THEN partial_address || ' | CL. ' || pc
           WHEN partial_address IS NOT NULL
             THEN partial_address
           ELSE NULL
         END AS meta_syntax
  FROM parts
),
body AS (
  SELECT id, ph,
         CASE
           WHEN full_address IS NOT NULL THEN meta_syntax
           WHEN meta_syntax IS NOT NULL AND nm IS NOT NULL
                AND meta_syntax != nm
                AND meta_syntax NOT LIKE nm || ' | %'
                AND meta_syntax NOT LIKE nm || ' | CL. %'
             THEN nm || ' | ' || meta_syntax
           WHEN meta_syntax IS NOT NULL THEN meta_syntax
           WHEN pc IS NOT NULL AND nm IS NOT NULL
             THEN nm || ' | CL. ' || pc
           ELSE NULL
         END AS display_core
  FROM meta
),
composed AS (
  SELECT id,
         CASE
           WHEN display_core IS NULL THEN NULL
           WHEN ph IS NOT NULL AND instr(display_core, ph) = 0
             THEN display_core || ' | ' || ph
           ELSE display_core
         END AS display_name
  FROM body
)
UPDATE sites
SET site_name_being_used = (SELECT display_name FROM composed WHERE composed.id = sites.id);

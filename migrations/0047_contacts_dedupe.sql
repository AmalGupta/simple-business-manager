-- SBM-65: one-time cleanup of existing duplicate contacts. The code that
-- stopped new duplicates shipped separately (findOrCreateCaller name/phone
-- reuse, canonical 10-digit phones, staff ↔ contact linking).
--
-- What went wrong (UAT, 2026-09-28): the 4 Sep phone-contacts import created
-- ~3.5k rows WITH numbers and no calls. The Drive poller then created a
-- second, name-only row whenever a recording's filename carried the saved
-- contact name instead of the number, so the calls hang off a phoneless
-- duplicate — 280 names had both. The same number was also stored in several
-- formats (+91…, 0…, bare 10 digits): 31 numbers had 2-3 rows. And 3 staff
-- logins were never linked to the contact carrying their own number.
--
-- Phases. Every merge moves calls, site links and aliases to the surviving
-- row, carries over a staff link / non-default type / real name, then deletes
-- the duplicate:
--   1. Same number, any format → one row; then every Indian number is stored
--      as its bare 10 digits (what normalizeCallerPhone writes now).
--   2. Same name, exactly one row has a number → phoneless rows fold into
--      it. A name with 2+ different numbers is ambiguous (likely different
--      people) and is left alone.
--   3. Staff logins → linked to the contact carrying their number.
-- Idempotent: a second run finds nothing to merge.

CREATE TABLE _caller_keys (
  id          TEXT PRIMARY KEY,
  pkey        TEXT,     -- canonical 10-digit Indian number; NULL if none/unparseable
  nkey        TEXT,     -- lower(trim(name))
  has_letters INTEGER,  -- a real name, not a phone number
  calls       INTEGER
);

INSERT INTO _caller_keys (id, pkey, nkey, has_letters, calls)
SELECT id,
       CASE
         WHEN d = '' OR d GLOB '*[^0-9]*' THEN NULL
         WHEN length(d) = 10 THEN d
         WHEN length(d) = 11 AND substr(d, 1, 1) = '0' THEN substr(d, 2)
         WHEN length(d) = 12 AND substr(d, 1, 2) = '91' THEN substr(d, 3)
       END,
       lower(trim(name)),
       trim(name) GLOB '*[a-zA-Z]*',
       (SELECT COUNT(*) FROM calls WHERE calls.client_id = c.id)
FROM (
  SELECT id, name,
         replace(replace(replace(replace(replace(replace(ifnull(phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '.', '') AS d
  FROM callers
) AS c;

CREATE TABLE _caller_merge (
  loser_id    TEXT PRIMARY KEY,
  survivor_id TEXT NOT NULL
);

-- Phase 1: same number ------------------------------------------------------
-- Survivor: staff-linked, then a real name, then most calls, then oldest.

INSERT INTO _caller_merge (loser_id, survivor_id)
SELECT id, survivor_id FROM (
  SELECT k.id,
         first_value(k.id) OVER (
           PARTITION BY k.pkey
           ORDER BY (c.staff_user_id IS NOT NULL) DESC, k.has_letters DESC, k.calls DESC, c.created_at ASC, k.id ASC
         ) AS survivor_id
  FROM _caller_keys k JOIN callers c ON c.id = k.id
  WHERE k.pkey IS NOT NULL
)
WHERE id <> survivor_id;

-- apply merges (same block after phase 2)
UPDATE callers SET name = (
    SELECT l.name FROM _caller_merge m JOIN callers l ON l.id = m.loser_id JOIN _caller_keys lk ON lk.id = l.id
    WHERE m.survivor_id = callers.id AND lk.has_letters = 1 ORDER BY lk.calls DESC LIMIT 1)
WHERE id IN (SELECT survivor_id FROM _caller_merge)
  AND trim(name) NOT GLOB '*[a-zA-Z]*'
  AND EXISTS (SELECT 1 FROM _caller_merge m JOIN _caller_keys lk ON lk.id = m.loser_id
              WHERE m.survivor_id = callers.id AND lk.has_letters = 1);
UPDATE callers SET staff_user_id = (
    SELECT l.staff_user_id FROM _caller_merge m JOIN callers l ON l.id = m.loser_id
    WHERE m.survivor_id = callers.id AND l.staff_user_id IS NOT NULL LIMIT 1)
WHERE staff_user_id IS NULL
  AND id IN (SELECT m.survivor_id FROM _caller_merge m JOIN callers l ON l.id = m.loser_id WHERE l.staff_user_id IS NOT NULL);
-- A survivor still on the default 'client' takes a type someone set on a
-- duplicate: staff types first, then business types; spam only when the
-- survivor has no real name (a named, imported contact is never hidden).
UPDATE callers SET category = (
    SELECT l.category FROM _caller_merge m JOIN callers l ON l.id = m.loser_id
    WHERE m.survivor_id = callers.id AND l.category <> 'client'
      AND (l.category <> 'spam' OR trim(callers.name) NOT GLOB '*[a-zA-Z]*')
    ORDER BY (l.category IN ('office_staff', 'service_staff')) DESC, (l.category = 'spam') ASC LIMIT 1)
WHERE category = 'client'
  AND EXISTS (SELECT 1 FROM _caller_merge m JOIN callers l ON l.id = m.loser_id
              WHERE m.survivor_id = callers.id AND l.category <> 'client'
                AND (l.category <> 'spam' OR trim(callers.name) NOT GLOB '*[a-zA-Z]*'));
UPDATE calls SET client_id = (SELECT survivor_id FROM _caller_merge WHERE loser_id = calls.client_id)
WHERE client_id IN (SELECT loser_id FROM _caller_merge);
INSERT OR IGNORE INTO caller_sites (caller_id, site_id)
SELECT m.survivor_id, cs.site_id FROM caller_sites cs JOIN _caller_merge m ON m.loser_id = cs.caller_id;
DELETE FROM caller_sites WHERE caller_id IN (SELECT loser_id FROM _caller_merge);
-- Moved, not copied: aliases are unique across all contacts
-- (idx_caller_aliases_alias_lower), so a copy would collide with the
-- loser's own row and be dropped.
UPDATE OR IGNORE caller_aliases SET caller_id = (SELECT survivor_id FROM _caller_merge WHERE loser_id = caller_aliases.caller_id)
WHERE caller_id IN (SELECT loser_id FROM _caller_merge);
DELETE FROM caller_aliases WHERE caller_id IN (SELECT loser_id FROM _caller_merge);
DELETE FROM callers WHERE id IN (SELECT loser_id FROM _caller_merge);
DELETE FROM _caller_merge;

-- Canonical number format. No collisions: phase 1 left one row per pkey.
UPDATE callers SET phone = (SELECT pkey FROM _caller_keys WHERE _caller_keys.id = callers.id)
WHERE id IN (SELECT id FROM _caller_keys WHERE pkey IS NOT NULL)
  AND phone IS NOT (SELECT pkey FROM _caller_keys WHERE _caller_keys.id = callers.id);

-- Phase 1 may have given a survivor a real name and moved calls onto it —
-- refresh the keys phase 2 matches on.
DELETE FROM _caller_keys WHERE id NOT IN (SELECT id FROM callers);
UPDATE _caller_keys SET
  nkey = (SELECT lower(trim(name)) FROM callers WHERE callers.id = _caller_keys.id),
  has_letters = (SELECT trim(name) GLOB '*[a-zA-Z]*' FROM callers WHERE callers.id = _caller_keys.id),
  calls = (SELECT COUNT(*) FROM calls WHERE calls.client_id = _caller_keys.id);

-- Phase 2: same name, one numbered row --------------------------------------

INSERT INTO _caller_merge (loser_id, survivor_id)
SELECT c.id, (
    SELECT p.id FROM callers p JOIN _caller_keys pk ON pk.id = p.id
    WHERE pk.nkey = k.nkey AND p.phone IS NOT NULL)
FROM callers c JOIN _caller_keys k ON k.id = c.id
WHERE c.phone IS NULL
  AND k.nkey <> ''
  AND (SELECT COUNT(*) FROM callers p JOIN _caller_keys pk ON pk.id = p.id
       WHERE pk.nkey = k.nkey AND p.phone IS NOT NULL) = 1;

-- Several phoneless rows under one name with no numbered twin → keep the one
-- with the most calls.
INSERT OR IGNORE INTO _caller_merge (loser_id, survivor_id)
SELECT id, survivor_id FROM (
  SELECT c.id,
         first_value(c.id) OVER (PARTITION BY k.nkey ORDER BY k.calls DESC, c.created_at ASC, c.id ASC) AS survivor_id
  FROM callers c JOIN _caller_keys k ON k.id = c.id
  WHERE c.phone IS NULL AND k.nkey <> ''
    AND NOT EXISTS (SELECT 1 FROM callers p JOIN _caller_keys pk ON pk.id = p.id
                    WHERE pk.nkey = k.nkey AND p.phone IS NOT NULL)
)
WHERE id <> survivor_id;

-- apply merges (same block as phase 1)
UPDATE callers SET name = (
    SELECT l.name FROM _caller_merge m JOIN callers l ON l.id = m.loser_id JOIN _caller_keys lk ON lk.id = l.id
    WHERE m.survivor_id = callers.id AND lk.has_letters = 1 ORDER BY lk.calls DESC LIMIT 1)
WHERE id IN (SELECT survivor_id FROM _caller_merge)
  AND trim(name) NOT GLOB '*[a-zA-Z]*'
  AND EXISTS (SELECT 1 FROM _caller_merge m JOIN _caller_keys lk ON lk.id = m.loser_id
              WHERE m.survivor_id = callers.id AND lk.has_letters = 1);
UPDATE callers SET staff_user_id = (
    SELECT l.staff_user_id FROM _caller_merge m JOIN callers l ON l.id = m.loser_id
    WHERE m.survivor_id = callers.id AND l.staff_user_id IS NOT NULL LIMIT 1)
WHERE staff_user_id IS NULL
  AND id IN (SELECT m.survivor_id FROM _caller_merge m JOIN callers l ON l.id = m.loser_id WHERE l.staff_user_id IS NOT NULL);
UPDATE callers SET category = (
    SELECT l.category FROM _caller_merge m JOIN callers l ON l.id = m.loser_id
    WHERE m.survivor_id = callers.id AND l.category <> 'client'
      AND (l.category <> 'spam' OR trim(callers.name) NOT GLOB '*[a-zA-Z]*')
    ORDER BY (l.category IN ('office_staff', 'service_staff')) DESC, (l.category = 'spam') ASC LIMIT 1)
WHERE category = 'client'
  AND EXISTS (SELECT 1 FROM _caller_merge m JOIN callers l ON l.id = m.loser_id
              WHERE m.survivor_id = callers.id AND l.category <> 'client'
                AND (l.category <> 'spam' OR trim(callers.name) NOT GLOB '*[a-zA-Z]*'));
UPDATE calls SET client_id = (SELECT survivor_id FROM _caller_merge WHERE loser_id = calls.client_id)
WHERE client_id IN (SELECT loser_id FROM _caller_merge);
INSERT OR IGNORE INTO caller_sites (caller_id, site_id)
SELECT m.survivor_id, cs.site_id FROM caller_sites cs JOIN _caller_merge m ON m.loser_id = cs.caller_id;
DELETE FROM caller_sites WHERE caller_id IN (SELECT loser_id FROM _caller_merge);
-- Moved, not copied: aliases are unique across all contacts
-- (idx_caller_aliases_alias_lower), so a copy would collide with the
-- loser's own row and be dropped.
UPDATE OR IGNORE caller_aliases SET caller_id = (SELECT survivor_id FROM _caller_merge WHERE loser_id = caller_aliases.caller_id)
WHERE caller_id IN (SELECT loser_id FROM _caller_merge);
DELETE FROM caller_aliases WHERE caller_id IN (SELECT loser_id FROM _caller_merge);
DELETE FROM callers WHERE id IN (SELECT loser_id FROM _caller_merge);
DELETE FROM _caller_merge;

-- Phase 3: staff logins ↔ their contact -------------------------------------

-- Login numbers in the same canonical form as contacts.
UPDATE users
SET phone = substr(replace(replace(replace(phone, ' ', ''), '-', ''), '+', ''), -10)
WHERE phone IS NOT NULL
  AND length(replace(replace(replace(phone, ' ', ''), '-', ''), '+', '')) IN (11, 12)
  AND (replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') GLOB '0[0-9]*'
       OR replace(replace(replace(phone, ' ', ''), '-', ''), '+', '') GLOB '91[0-9]*');

-- The contact carrying a staff login's number becomes that login's contact.
UPDATE callers
SET staff_user_id = (
      SELECT u.id FROM users u
      WHERE u.role = 'staff' AND u.disabled_at IS NULL AND u.phone = callers.phone
      LIMIT 1)
WHERE staff_user_id IS NULL
  AND phone IS NOT NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.role = 'staff' AND u.disabled_at IS NULL AND u.phone = callers.phone);

-- A linked contact always carries a staff type.
UPDATE callers SET category = 'service_staff'
WHERE staff_user_id IS NOT NULL AND category NOT IN ('office_staff', 'service_staff');

-- A linked contact that is only a phone number takes the login's name.
UPDATE callers
SET name = (SELECT u.name FROM users u WHERE u.id = callers.staff_user_id)
WHERE staff_user_id IS NOT NULL AND trim(name) NOT GLOB '*[a-zA-Z]*';

DROP TABLE _caller_merge;
DROP TABLE _caller_keys;

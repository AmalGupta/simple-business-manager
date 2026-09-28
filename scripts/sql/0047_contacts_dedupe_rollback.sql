-- Undo of migrations/0047_contacts_dedupe.sql, from the snapshot taken by
-- 0047_contacts_dedupe_backup.sql. Run ONLY to roll back, through
-- `scripts/contacts-dedupe-0047.sh rollback <env>` — never automatically.
--
-- Puts back, for every row that existed before 0047: each contact (deleted
-- duplicates re-created with their original id; kept contacts get their old
-- name, number, type and staff link), each call's contact, contact↔site
-- links, aliases, and login numbers 0047 reformatted.
-- Rows created AFTER 0047 are left in place: new contacts, new calls (a new
-- call on a kept contact stays on it), site links added to other contacts.
-- An edit made after 0047 to a contact that existed before it IS reverted —
-- roll back soon rather than late.
--
-- d1_migrations still lists 0047 afterwards on purpose, so it is not re-run on
-- the next `migrations apply`. Safe to run twice.

-- Guard: stops here with "no such table" when no snapshot was taken.
SELECT COUNT(*) FROM _bak0047_meta;

-- Contacts 0047 deleted (captured before they're re-created below).
CREATE TABLE _rb0047_deleted AS
SELECT id FROM _bak0047_callers WHERE id NOT IN (SELECT id FROM callers);

-- 1. Kept contacts back to their pre-0047 name / number / type / staff link.
--    Done before re-creating the deleted ones so their original numbers are
--    free again (UNIQUE phone).
UPDATE callers
SET name = b.name, phone = b.phone, category = b.category, staff_user_id = b.staff_user_id
FROM _bak0047_callers AS b
WHERE b.id = callers.id
  AND (callers.name IS NOT b.name OR callers.phone IS NOT b.phone
       OR callers.category IS NOT b.category OR callers.staff_user_id IS NOT b.staff_user_id);

-- 2. Re-create deleted duplicates with their original ids.
INSERT INTO callers (id, name, phone, category, staff_user_id, created_at)
SELECT b.id, b.name, b.phone, b.category, b.staff_user_id, b.created_at
FROM _bak0047_callers AS b
WHERE b.id IN (SELECT id FROM _rb0047_deleted);

-- 3. Every pre-0047 call back on its original contact.
UPDATE calls
SET client_id = b.client_id
FROM _bak0047_call_links AS b
WHERE b.id = calls.id AND calls.client_id IS NOT b.client_id;

-- 4. Site links: drop the ones 0047 copied onto a kept contact (a pair not in
--    the snapshot, for a site a deleted duplicate was linked to), then put
--    back every snapshot link.
DELETE FROM caller_sites
WHERE caller_id IN (SELECT id FROM _bak0047_callers)
  AND site_id IN (SELECT site_id FROM _bak0047_caller_sites WHERE caller_id IN (SELECT id FROM _rb0047_deleted))
  AND NOT EXISTS (SELECT 1 FROM _bak0047_caller_sites b
                  WHERE b.caller_id = caller_sites.caller_id AND b.site_id = caller_sites.site_id);
INSERT OR IGNORE INTO caller_sites (caller_id, site_id)
SELECT caller_id, site_id FROM _bak0047_caller_sites;

-- 5. Aliases back on their original contact (0047 moved them), and any
--    missing one re-created.
UPDATE caller_aliases
SET caller_id = b.caller_id
FROM _bak0047_caller_aliases AS b
WHERE b.id = caller_aliases.id AND caller_aliases.caller_id IS NOT b.caller_id;
INSERT OR IGNORE INTO caller_aliases (id, caller_id, alias, created_at)
SELECT id, caller_id, alias, created_at FROM _bak0047_caller_aliases;

-- 6. Login numbers 0047 reformatted (only where the number is still exactly
--    what 0047 wrote, so a number changed since is kept).
UPDATE users
SET phone = b.phone
FROM _bak0047_user_phones AS b
WHERE b.id = users.id
  AND users.phone IS NOT b.phone
  AND users.phone = substr(replace(replace(replace(b.phone, ' ', ''), '-', ''), '+', ''), -10);

DROP TABLE _rb0047_deleted;

CREATE TABLE IF NOT EXISTS _bak0047_rollbacks (rolled_back_at TEXT NOT NULL);
INSERT INTO _bak0047_rollbacks (rolled_back_at) VALUES (datetime('now'));

-- Snapshot taken immediately BEFORE migrations/0047_contacts_dedupe.sql, so
-- 0047 can be undone with 0047_contacts_dedupe_rollback.sql. Not a migration:
-- run it through scripts/contacts-dedupe-0047.sh (which runs it and then 0047).
--
-- Copies every row 0047 can change: all contacts, each call's contact link,
-- contact↔site links, aliases, and login phone numbers. Refuses to overwrite
-- an existing snapshot — the first one is the pre-0047 state; a second run
-- after 0047 would capture the merged state and make the rollback a no-op.

-- Fails with "table _bak0047_meta already exists" if a snapshot is present.
CREATE TABLE _bak0047_meta (
  taken_at TEXT NOT NULL,
  callers  INTEGER NOT NULL,
  calls    INTEGER NOT NULL
);

CREATE TABLE _bak0047_callers AS
SELECT id, name, phone, category, staff_user_id, created_at FROM callers;

CREATE TABLE _bak0047_call_links AS
SELECT id, client_id FROM calls;

CREATE TABLE _bak0047_caller_sites AS
SELECT caller_id, site_id FROM caller_sites;

CREATE TABLE _bak0047_caller_aliases AS
SELECT id, caller_id, alias, created_at FROM caller_aliases;

CREATE TABLE _bak0047_user_phones AS
SELECT id, phone FROM users;

INSERT INTO _bak0047_meta (taken_at, callers, calls)
SELECT datetime('now'), (SELECT COUNT(*) FROM _bak0047_callers), (SELECT COUNT(*) FROM _bak0047_call_links);

-- A contact can have more than one number, and contacts can be merged.
--
-- callers.phone stays the contact's main number — every existing read keeps
-- working unchanged. caller_phones holds the ADDITIONAL numbers a contact
-- picked up by being merged with another (e.g. "Rahul" on two numbers). A
-- number lives in exactly one place across callers.phone and caller_phones;
-- lookups by number check both (findCallerByPhone in queries.ts).
CREATE TABLE caller_phones (
  phone      TEXT PRIMARY KEY,   -- canonical form (normalizeCallerPhone)
  caller_id  TEXT NOT NULL REFERENCES callers(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_caller_phones_caller ON caller_phones(caller_id);

-- One row per merge, with a snapshot of the contact that was folded in
-- (row, numbers, aliases, site links, call ids) so a merge can be traced or
-- reversed by hand.
CREATE TABLE caller_merges (
  id                TEXT PRIMARY KEY,
  survivor_id       TEXT NOT NULL REFERENCES callers(id),
  merged_caller_id  TEXT NOT NULL,           -- deleted; no FK on purpose
  merged_snapshot   TEXT NOT NULL,           -- JSON
  calls_moved       INTEGER NOT NULL,
  merged_by_user_id TEXT REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_caller_merges_survivor ON caller_merges(survivor_id, created_at DESC);

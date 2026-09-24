-- D1 migration 0039 — contact aliases for extraction/auto-assign matching.
-- Spoken todo.owner can match an alias → callers.staff_user_id → assignee.
-- Global uniqueness is on lower(trim(alias)) so nicknames map to one contact.

CREATE TABLE caller_aliases (
  id TEXT PRIMARY KEY,
  caller_id TEXT NOT NULL REFERENCES callers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (caller_id, alias)
);

CREATE UNIQUE INDEX idx_caller_aliases_alias_lower ON caller_aliases (lower(trim(alias)));
CREATE INDEX idx_caller_aliases_caller ON caller_aliases(caller_id);

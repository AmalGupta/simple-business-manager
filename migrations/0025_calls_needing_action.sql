-- "Calls Needing Action" carousel (admin dashboard). Three additions:
--
-- 1. calls.resolved_at / resolved_by_user_id — a manual admin ack that a
--    call has been reviewed, independent of whether its todos are done.
--    The carousel's qualifying-calls query filters on resolved_at IS NULL.
--
-- 2. todo_voice_notes — a raw-audio clip an admin attaches to one todo row
--    from inside the carousel card. Deliberately NOT modeled as a `calls`
--    row (unlike site voice memos / installation_updates.voice_note_call_id,
--    which DO go through the Sarvam/Claude pipeline) — these never get
--    transcribed, so calls-shaped columns (stt_status, prompt_version, ...)
--    would never apply. Multiple rows per todo are allowed (append-only);
--    the UI always plays the most recent one, older rows are kept for audit
--    rather than deleted.
--
-- 3. todo_assignees — replaces todos.assigned_to_user_id/assigned_by_user_id/
--    assigned_at with a proper many-to-many join table so a todo can be
--    assigned to more than one staff member (the carousel card's "assign to
--    one or more staff members" requirement). Scoped to `todos` only —
--    site_tasks.assigned_to_user_id and escalations.assigned_to_user_id are
--    untouched, this is not a general assignment-system rewrite. Existing
--    single assignments are backfilled before the old columns are dropped.

ALTER TABLE calls ADD COLUMN resolved_at TEXT;
ALTER TABLE calls ADD COLUMN resolved_by_user_id TEXT REFERENCES users(id);

CREATE INDEX idx_calls_resolved_at ON calls(resolved_at);

CREATE TABLE todo_voice_notes (
  id                  TEXT PRIMARY KEY,
  todo_id             TEXT NOT NULL REFERENCES todos(id),
  r2_key              TEXT NOT NULL,
  content_type        TEXT NOT NULL,
  duration_s          INTEGER,
  uploaded_by_user_id TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_todo_voice_notes_todo ON todo_voice_notes(todo_id, created_at DESC);

CREATE TABLE todo_assignees (
  todo_id             TEXT NOT NULL REFERENCES todos(id),
  user_id             TEXT NOT NULL REFERENCES users(id),
  assigned_by_user_id TEXT REFERENCES users(id),
  assigned_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (todo_id, user_id)
);

CREATE INDEX idx_todo_assignees_user ON todo_assignees(user_id);

INSERT INTO todo_assignees (todo_id, user_id, assigned_by_user_id, assigned_at)
SELECT id, assigned_to_user_id, assigned_by_user_id, COALESCE(assigned_at, datetime('now'))
FROM todos
WHERE assigned_to_user_id IS NOT NULL;

ALTER TABLE todos DROP COLUMN assigned_to_user_id;
ALTER TABLE todos DROP COLUMN assigned_by_user_id;
ALTER TABLE todos DROP COLUMN assigned_at;

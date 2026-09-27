-- Staff roster: per-staff day planning, admin "urgent" flag, and an audit
-- trail of every staff action on assigned work.
--
-- "Assigned work" is two existing sources, deliberately not merged into a new
-- table: call todos (todo_assignees, many-to-many) and workflow site tasks
-- (site_tasks.assigned_to_user_id, single). The planned date therefore lives
-- per assignee on todo_assignees (two staff on one todo can plan different
-- days) and directly on site_tasks.

-- The day the assignee plans to do it. Distinct from due_date (the deadline
-- the call/admin set) — a staff member moving this is planning, not missing.
ALTER TABLE todo_assignees ADD COLUMN scheduled_for TEXT;
ALTER TABLE site_tasks ADD COLUMN scheduled_for TEXT;

-- Admin-set urgency. While set, staff cannot move scheduled_for, and the
-- item is due within 24h of urgent_at. Cleared (NULL) when unmarked.
ALTER TABLE todos ADD COLUMN urgent_at TEXT;
ALTER TABLE todos ADD COLUMN urgent_by_user_id TEXT REFERENCES users(id);
ALTER TABLE site_tasks ADD COLUMN urgent_at TEXT;
ALTER TABLE site_tasks ADD COLUMN urgent_by_user_id TEXT REFERENCES users(id);

-- Append-only audit of transitions on assigned work. item_kind/item_id is a
-- polymorphic pointer (todo | site_task), same shape as
-- site_activity_summary's source/ref_id. from_value/to_value hold dates for
-- 'scheduled', user ids for 'handed_off'/'assigned', NULL otherwise.
--   event: scheduled | completed | reopened | handed_off | received | assigned |
--          marked_urgent | urgent_cleared
CREATE TABLE work_events (
  id             TEXT PRIMARY KEY,
  item_kind      TEXT NOT NULL,
  item_id        TEXT NOT NULL,
  site_id        TEXT REFERENCES sites(id),
  actor_user_id  TEXT REFERENCES users(id),
  -- whose work this was at the time — the staff member the audit is filed
  -- under (differs from actor when an admin marks urgent or reassigns).
  subject_user_id TEXT REFERENCES users(id),
  event          TEXT NOT NULL,
  from_value     TEXT,
  to_value       TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_work_events_subject ON work_events(subject_user_id, created_at DESC);
CREATE INDEX idx_work_events_item ON work_events(item_kind, item_id, created_at DESC);
CREATE INDEX idx_todo_assignees_scheduled ON todo_assignees(user_id, scheduled_for);
CREATE INDEX idx_site_tasks_scheduled ON site_tasks(assigned_to_user_id, scheduled_for);

-- Per-todo site assignment (CNA "Assign to Site"). The parent call also
-- gets a call_sites row when a todo is assigned — see assignTodoToSite.
ALTER TABLE todos ADD COLUMN site_id TEXT REFERENCES sites(id);
CREATE INDEX IF NOT EXISTS idx_todos_site ON todos(site_id);

-- Complaint assignee — mirrors todos/site_tasks assignment columns.
ALTER TABLE escalations ADD COLUMN assigned_to_user_id TEXT REFERENCES users(id);
ALTER TABLE escalations ADD COLUMN assigned_by_user_id TEXT REFERENCES users(id);
ALTER TABLE escalations ADD COLUMN assigned_at TEXT;

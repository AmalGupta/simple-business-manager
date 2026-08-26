ALTER TABLE todos ADD COLUMN assigned_to_user_id TEXT REFERENCES users(id);
ALTER TABLE todos ADD COLUMN assigned_by_user_id TEXT REFERENCES users(id);
ALTER TABLE todos ADD COLUMN assigned_at TEXT;

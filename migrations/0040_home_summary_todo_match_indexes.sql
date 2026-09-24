-- SBM-52: home dashboard summary was ~9s on UAT after staff My call tasks /
-- contact-alias matching. listStaffWithOpenCallTodos and countMyOpenTodos both
-- filter open todos by lower(trim(owner)); without an expression index SQLite
-- scans every open todo. idx_todo_assignees_user already covers the assignee
-- path; this covers owner-name and alias equality joins.

CREATE INDEX IF NOT EXISTS idx_todos_open_owner_norm
  ON todos(status, (lower(trim(owner))));

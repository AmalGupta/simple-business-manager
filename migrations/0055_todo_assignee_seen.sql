-- Read receipts on assigned todos: assigned_at is "delivered" (grey double
-- tick); seen_at is stamped the first time the assignee's own Assigned work
-- screen shows the todo (blue double tick). A reassignment inserts a fresh
-- row, so a new assignee starts unseen.
ALTER TABLE todo_assignees ADD COLUMN seen_at TEXT;

-- Backfill: a done todo was necessarily seen by whoever held it. Open ones
-- stay unseen until the assignee next opens Assigned work.
UPDATE todo_assignees SET seen_at = COALESCE(
  (SELECT todos.completed_at FROM todos WHERE todos.id = todo_assignees.todo_id),
  todo_assignees.assigned_at
)
WHERE seen_at IS NULL
  AND (SELECT todos.status FROM todos WHERE todos.id = todo_assignees.todo_id) = 'done';

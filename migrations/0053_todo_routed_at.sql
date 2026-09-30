-- SBM-82: a todo can only be marked done once it has been routed.
-- routed_at is set when an admin saves the todo's assignees (Route / Reassign /
-- Assign to me). Todos that land with the router at extraction stay NULL until
-- he routes them — even to himself.
ALTER TABLE todos ADD COLUMN routed_at TEXT;

-- Backfill: already routed if an admin assignment was logged, if anyone other
-- than the router holds it (with no router set, any assignee counts), or if
-- it's already done.
UPDATE todos SET routed_at = COALESCE(
  (SELECT MIN(e.created_at) FROM work_events e
    WHERE e.item_kind = 'todo' AND e.item_id = todos.id AND e.event = 'assigned'),
  (SELECT MIN(a.assigned_at) FROM todo_assignees a
    WHERE a.todo_id = todos.id
      AND a.user_id IS NOT (SELECT value FROM app_settings WHERE key = 'todo_router_user_id')),
  CASE WHEN todos.status = 'done' THEN COALESCE(todos.completed_at, todos.created_at) END
)
WHERE routed_at IS NULL;

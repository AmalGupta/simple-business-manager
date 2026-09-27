-- Owner-routed todos + per-todo context.
--
-- The owner (Piyush) now reviews every call's todos and routes each one to a
-- staff member himself. So, from this migration on:
--   * app_settings 'todo_router_user_id' names the router. While it is set,
--     every new todo (call extraction, desk/site voice memo) is assigned to
--     the router only — auto-assign by spoken name and the staff-side
--     name/alias claiming are off (see getTodoRouterUserId in queries.ts).
--   * Every todo that isn't done, and every assigned site task, moves to the
--     router now. Each staff member's loss of an item is written to
--     work_events as 'rerouted' so their audit shows why it left their list.
-- Everything below is a no-op when no matching active admin exists (local
-- dev, a tenant without him) — the router setting is simply never written.

-- Short note of what was said around a todo (prompt v8 todos[].context).
ALTER TABLE todos ADD COLUMN context TEXT;

INSERT OR REPLACE INTO app_settings (key, value, updated_at)
SELECT 'todo_router_user_id', id, datetime('now')
FROM users
WHERE (lower(trim(name)) = 'piyush' OR lower(trim(name)) LIKE 'piyush %')
  AND role IN ('admin', 'superadmin')
  AND disabled_at IS NULL
ORDER BY (role = 'superadmin') DESC, created_at ASC
LIMIT 1;

-- Call todos -----------------------------------------------------------------

INSERT INTO work_events (id, item_kind, item_id, site_id, actor_user_id, subject_user_id, event, to_value)
SELECT lower(hex(randomblob(16))), 'todo', todo_assignees.todo_id, todos.site_id, NULL,
       todo_assignees.user_id, 'rerouted', app_settings.value
FROM todo_assignees
JOIN todos ON todos.id = todo_assignees.todo_id
JOIN calls ON calls.id = todos.call_id AND calls.deleted_at IS NULL
JOIN app_settings ON app_settings.key = 'todo_router_user_id'
WHERE todos.status <> 'done' AND todo_assignees.user_id <> app_settings.value;

DELETE FROM todo_assignees
WHERE EXISTS (SELECT 1 FROM app_settings WHERE key = 'todo_router_user_id')
  AND user_id <> (SELECT value FROM app_settings WHERE key = 'todo_router_user_id')
  AND todo_id IN (
    SELECT todos.id FROM todos JOIN calls ON calls.id = todos.call_id
    WHERE todos.status <> 'done' AND calls.deleted_at IS NULL
  );

INSERT OR IGNORE INTO todo_assignees (todo_id, user_id, assigned_by_user_id, assigned_at)
SELECT todos.id, app_settings.value, NULL, datetime('now')
FROM todos
JOIN calls ON calls.id = todos.call_id AND calls.deleted_at IS NULL
JOIN app_settings ON app_settings.key = 'todo_router_user_id'
WHERE todos.status <> 'done';

-- Site tasks -----------------------------------------------------------------

INSERT INTO work_events (id, item_kind, item_id, site_id, actor_user_id, subject_user_id, event, to_value)
SELECT lower(hex(randomblob(16))), 'site_task', site_tasks.id, site_tasks.site_id, NULL,
       site_tasks.assigned_to_user_id, 'rerouted', app_settings.value
FROM site_tasks
JOIN app_settings ON app_settings.key = 'todo_router_user_id'
WHERE site_tasks.status = 'assigned'
  AND site_tasks.assigned_to_user_id IS NOT NULL
  AND site_tasks.assigned_to_user_id <> app_settings.value;

UPDATE site_tasks
SET assigned_to_user_id = (SELECT value FROM app_settings WHERE key = 'todo_router_user_id'),
    assigned_at = datetime('now'),
    scheduled_for = NULL
WHERE status = 'assigned'
  AND EXISTS (SELECT 1 FROM app_settings WHERE key = 'todo_router_user_id')
  AND assigned_to_user_id IS NOT (SELECT value FROM app_settings WHERE key = 'todo_router_user_id');

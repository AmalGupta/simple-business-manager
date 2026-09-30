-- SBM-92: the client contact a todo is for, linked when the STT webhook
-- creates it (saveExtraction), alongside todos.site_id.
--   phone / Drive call   → the caller (calls.client_id), unless a staff contact
--   desk / site memo     → the todo's site contact, only when the site has exactly one
ALTER TABLE todos ADD COLUMN client_caller_id TEXT REFERENCES callers(id) ON DELETE SET NULL;

UPDATE todos SET client_caller_id = (
  SELECT callers.id FROM calls JOIN callers ON callers.id = calls.client_id
  WHERE calls.id = todos.call_id
    AND calls.uploaded_by_user_id IS NULL AND calls.recorded_for_site_id IS NULL
    AND callers.category NOT IN ('office_staff', 'service_staff') AND callers.staff_user_id IS NULL
)
WHERE client_caller_id IS NULL;

UPDATE todos SET client_caller_id = (
  SELECT caller_sites.caller_id FROM caller_sites WHERE caller_sites.site_id = todos.site_id
)
WHERE client_caller_id IS NULL
  AND todos.site_id IS NOT NULL
  AND (SELECT COUNT(*) FROM caller_sites WHERE caller_sites.site_id = todos.site_id) = 1;

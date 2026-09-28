-- SBM-67: Assigned work is split per site into Office and Factory tabs.
--
-- work_location is an admin override set while routing. NULL means "use the
-- default" rather than a stored copy of it, so the default rule lives in one
-- place (effectiveWorkLocation in packages/core/src/work-location.ts):
--   * site tasks: procurement / production / quality_control → factory,
--     every other workflow category → office
--   * call todos: office
-- No backfill — every existing row reads as its default until routed.

ALTER TABLE todos ADD COLUMN work_location TEXT;       -- NULL | 'office' | 'factory'
ALTER TABLE site_tasks ADD COLUMN work_location TEXT;  -- NULL | 'office' | 'factory'

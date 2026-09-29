-- SBM-71 follow-up: admin-filed complaints can be given a deadline, and
-- creating a complaint is itself an audited step (the Task audit's
-- "Complaint audit" tab starts each complaint's story at "Created").

ALTER TABLE escalations ADD COLUMN due_date TEXT;   -- yyyy-mm-dd, admin-set deadline

-- One 'created' event for every staff-filed complaint that predates this,
-- stamped with the complaint's own filing time so history reads in order.
INSERT INTO work_events (id, item_kind, item_id, site_id, actor_user_id, subject_user_id, event, created_at)
SELECT lower(hex(randomblob(16))), 'complaint', escalations.id, escalations.site_id,
       escalations.created_by_user_id, escalations.created_by_user_id, 'created', escalations.created_at
FROM escalations
WHERE escalations.source = 'staff_field'
  AND NOT EXISTS (SELECT 1 FROM work_events
                  WHERE work_events.item_kind = 'complaint' AND work_events.item_id = escalations.id
                    AND work_events.event = 'created');

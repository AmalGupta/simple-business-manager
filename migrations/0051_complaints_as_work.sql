-- SBM-71: complaints become work items, like call todos and site stages.
--
-- A staff-filed complaint is assigned to one person who can plan it onto a
-- day and pass it on; an admin can flag it urgent (same rules as tasks: due
-- within 24h, pinned to today, staff can't move it) or important (a flag
-- that sorts it first, no scheduling rule). Every transition lands in
-- work_events with item_kind = 'complaint', so the Task audit shows it —
-- including resolution, which stays admin-only.
--
-- New complaints are assigned to their creator, planned for the day they're
-- filed, so they're on that person's roster at once (handlers, not SQL).

ALTER TABLE escalations ADD COLUMN scheduled_for TEXT;              -- yyyy-mm-dd planned day
ALTER TABLE escalations ADD COLUMN urgent_at TEXT;
ALTER TABLE escalations ADD COLUMN urgent_by_user_id TEXT REFERENCES users(id);
ALTER TABLE escalations ADD COLUMN important_at TEXT;
ALTER TABLE escalations ADD COLUMN important_by_user_id TEXT REFERENCES users(id);
ALTER TABLE escalations ADD COLUMN resolved_by_user_id TEXT REFERENCES users(id);
-- The voice note that describes the complaint. Site-level complaints never
-- stored this link; checklist complaints reach it via installation_updates.
ALTER TABLE escalations ADD COLUMN voice_call_id TEXT REFERENCES calls(id);
-- Photos/videos attached to a site-level complaint.
ALTER TABLE site_media ADD COLUMN escalation_id TEXT REFERENCES escalations(id);
CREATE INDEX idx_site_media_escalation ON site_media(escalation_id);
CREATE INDEX idx_escalations_assignee ON escalations(assigned_to_user_id, status);

-- Backfill voice notes: checklist complaints via their installation update…
UPDATE escalations
SET voice_call_id = (SELECT voice_note_call_id FROM installation_updates WHERE installation_updates.id = escalations.installation_update_id)
WHERE voice_call_id IS NULL AND installation_update_id IS NOT NULL;

-- …site-level complaints by the voice note the same person recorded for the
-- same site in the same submit (the handler writes the call just before the
-- complaint row; allow two minutes either side).
UPDATE escalations
SET voice_call_id = (
  SELECT calls.id FROM calls
  WHERE calls.recorded_for_site_id = escalations.site_id
    AND calls.uploaded_by_user_id = escalations.created_by_user_id
    AND abs(julianday(calls.created_at) - julianday(escalations.created_at)) * 86400 <= 120
  ORDER BY calls.created_at DESC
  LIMIT 1)
WHERE voice_call_id IS NULL AND installation_update_id IS NULL
  AND source = 'staff_field' AND created_by_user_id IS NOT NULL AND site_id IS NOT NULL;

-- Backfill media: checklist complaints share the installation update id…
UPDATE site_media
SET escalation_id = (SELECT escalations.id FROM escalations
                     WHERE escalations.installation_update_id = site_media.installation_update_id LIMIT 1)
WHERE escalation_id IS NULL AND installation_update_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM escalations WHERE escalations.installation_update_id = site_media.installation_update_id);

-- …site-level ones were captioned "Complaint attachment" by the same person,
-- same site, within five minutes after the complaint was filed.
UPDATE site_media
SET escalation_id = (
  SELECT escalations.id FROM escalations
  WHERE escalations.source = 'staff_field'
    AND escalations.site_id = site_media.site_id
    AND escalations.created_by_user_id = site_media.uploaded_by
    AND (julianday(site_media.created_at) - julianday(escalations.created_at)) * 86400 BETWEEN -5 AND 300
  ORDER BY escalations.created_at DESC
  LIMIT 1)
WHERE escalation_id IS NULL AND caption = 'Complaint attachment';

-- Open staff complaints nobody was assigned to go to whoever filed them, so
-- each is on someone's list (staff now only see complaints assigned to them).
-- Only if that person still works here — a former staff member's stay with
-- the admin to assign.
UPDATE escalations
SET assigned_to_user_id = created_by_user_id, assigned_at = COALESCE(assigned_at, created_at)
WHERE source = 'staff_field' AND status = 'open'
  AND assigned_to_user_id IS NULL AND created_by_user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM users WHERE users.id = escalations.created_by_user_id AND users.disabled_at IS NULL);


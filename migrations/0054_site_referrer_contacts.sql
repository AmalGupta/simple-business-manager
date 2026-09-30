-- SBM-83: "Assigned by" and "Referred by" on a site are Callers Directory
-- contacts, picked through the associate-contacts modal, not free text.
-- The text columns stay as the display snapshot (and the only value for
-- legacy rows nobody has re-picked yet); SITE_ROW_SELECT prefers the linked
-- contact's current name.
ALTER TABLE sites ADD COLUMN assigned_by_caller_id TEXT REFERENCES callers(id) ON DELETE SET NULL;
ALTER TABLE sites ADD COLUMN referred_by_caller_id TEXT REFERENCES callers(id) ON DELETE SET NULL;

-- Backfill: link existing text only when exactly one directory contact
-- carries that name (case-insensitive). Ambiguous or unknown names stay
-- text-only until someone picks the contact.
UPDATE sites SET assigned_by_caller_id = (
  SELECT c.id FROM callers c WHERE lower(trim(c.name)) = lower(trim(sites.assigned_by))
)
WHERE assigned_by_caller_id IS NULL
  AND trim(COALESCE(assigned_by, '')) <> ''
  AND (SELECT COUNT(*) FROM callers c WHERE lower(trim(c.name)) = lower(trim(sites.assigned_by))) = 1;

UPDATE sites SET referred_by_caller_id = (
  SELECT c.id FROM callers c WHERE lower(trim(c.name)) = lower(trim(sites.referred_by))
)
WHERE referred_by_caller_id IS NULL
  AND trim(COALESCE(referred_by, '')) <> ''
  AND (SELECT COUNT(*) FROM callers c WHERE lower(trim(c.name)) = lower(trim(sites.referred_by))) = 1;

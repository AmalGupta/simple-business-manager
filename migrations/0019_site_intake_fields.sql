-- D1 migration 0019 — structured site intake fields for staff "Add new site"
-- (H.No, sector, city, contact number, assigned/referred by, GPS pin).
-- Mirrors packages/core/src/schema.sql.

ALTER TABLE sites ADD COLUMN house_no TEXT;
ALTER TABLE sites ADD COLUMN sector TEXT;
ALTER TABLE sites ADD COLUMN city TEXT;
ALTER TABLE sites ADD COLUMN poc_contact_number TEXT;
ALTER TABLE sites ADD COLUMN assigned_by TEXT;
ALTER TABLE sites ADD COLUMN referred_by TEXT;
ALTER TABLE sites ADD COLUMN site_location TEXT;

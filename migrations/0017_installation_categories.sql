-- D1 migration 0017 — generalizes `installations` (migration 0016) beyond
-- the single "Installation" category. The site-visit category grid's "New
-- Measurement" and "Material Delivery" boxes turned out to want the exact
-- same pattern as Installation (pick/create an instance at the site, then
-- the same 6-row voice-note-first checklist) rather than being separate
-- concepts — so one table now serves all three, distinguished by this
-- column, instead of three near-identical tables.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

ALTER TABLE installations ADD COLUMN category TEXT NOT NULL DEFAULT 'installation';
-- 'installation' | 'measurement' | 'material_delivery'
CREATE INDEX idx_installations_site_category ON installations(site_id, category);

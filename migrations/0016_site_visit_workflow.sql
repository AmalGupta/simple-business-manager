-- D1 migration 0016 — staff field workflow: "installations" (physical
-- windows/openings at a site — a site can have many) and a 6-category
-- checklist ("installation_updates") logged against each one over repeat
-- visits. Distinct from the migration 0013 site_tasks/workflow_stages
-- system, which is a fixed one-row-per-stage-per-site production catalog
-- with no attachments and no repeat visits — this is a repeatable field
-- log per physical installation, each entry requiring a voice note before
-- photo/video attachment is even offered (enforced client-side; the voice
-- note is what the checklist UI is gated on).
--
-- Complaints filed from this flow write straight into the existing
-- `escalations` table (extended below) rather than forking a second
-- complaints system, so they appear in the admin Escalations tile
-- immediately. Material-short reports get a real ledger, unlike the
-- existing self-expiring `calls.material_needs` field, since these need
-- open/fulfilled tracking across sites.
--
-- Mirrors packages/core/src/schema.sql. Applied via:
-- wrangler d1 migrations apply sbm-dev --local|--remote

CREATE TABLE installations (
  id          TEXT PRIMARY KEY,
  site_id     TEXT NOT NULL REFERENCES sites(id),
  label       TEXT NOT NULL,   -- staff-entered at creation, e.g. "Window 3 - Living Room"
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_installations_site ON installations(site_id);

-- One row per checklist-category report on one installation. A row is
-- "complete" purely as a read-time computation (voice_note_call_id set AND
-- at least one site_media row references it) — no stored status column.
CREATE TABLE installation_updates (
  id                   TEXT PRIMARY KEY,
  installation_id      TEXT NOT NULL REFERENCES installations(id),
  category             TEXT NOT NULL,  -- location|work_done|work_pending|material_short|complaints|site_delay
  voice_note_call_id   TEXT REFERENCES calls(id),
  reported_by_user_id  TEXT NOT NULL REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_installation_updates_installation ON installation_updates(installation_id);

-- Photo/video attaches to the specific checklist row it documents, in
-- addition to always being tied to the site (keeps every existing
-- site_id-scoped query, incl. getSiteTimeline, working unmodified).
ALTER TABLE site_media ADD COLUMN installation_update_id TEXT REFERENCES installation_updates(id);
CREATE INDEX idx_site_media_installation_update ON site_media(installation_update_id);

-- Links the voice-note call back to the checklist row it documents. The
-- call itself still goes through the normal Sarvam/Claude pipeline
-- (recorded_for_site_id set as usual by handlePostSiteVoiceNote's sibling
-- for this flow) — this column is purely the reverse pointer.
ALTER TABLE calls ADD COLUMN installation_update_id TEXT REFERENCES installation_updates(id);

-- Field-filed complaints (both the per-installation "Complaints" checklist
-- row and the site-level "Complaints" category box) become real
-- escalations, attributed to whoever filed them.
ALTER TABLE escalations ADD COLUMN created_by_user_id TEXT REFERENCES users(id);
ALTER TABLE escalations ADD COLUMN source TEXT NOT NULL DEFAULT 'admin';  -- admin|staff_field
ALTER TABLE escalations ADD COLUMN installation_update_id TEXT REFERENCES installation_updates(id);

-- Material-short reports get a real ledger (open/fulfilled), unlike the
-- existing self-expiring calls.material_needs field — admin needs to see
-- outstanding shortages across sites and mark them resolved.
CREATE TABLE material_shortages (
  id                      TEXT PRIMARY KEY,
  site_id                 TEXT NOT NULL REFERENCES sites(id),
  installation_id         TEXT REFERENCES installations(id),
  installation_update_id  TEXT REFERENCES installation_updates(id),
  description             TEXT,        -- admin fills in from the voice transcript; nullable at creation
  status                  TEXT NOT NULL DEFAULT 'open',  -- open|fulfilled
  reported_by_user_id     TEXT NOT NULL REFERENCES users(id),
  reported_at             TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_by_user_id     TEXT REFERENCES users(id),
  resolved_at             TEXT
);
CREATE INDEX idx_material_shortages_status ON material_shortages(status);
CREATE INDEX idx_material_shortages_site ON material_shortages(site_id);

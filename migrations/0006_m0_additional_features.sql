-- D1 migration 0006 — M0 additional features, derived from 11-transcript
-- analysis. See docs/ADDITIONAL_FEATURES_M0.md for the full rationale.
-- Mirrors packages/core/src/schema.sql. Applied via:
--   wrangler d1 migrations apply sbm-dev --local|--remote
--
-- Summary of changes:
--   - calls gains call_type (client/internal/low_signal) and material_needs
--   - calls.unresolved changes shape (app-level only, no column change):
--     string[] -> { item, blocked_on }[]
--   - todos.owner goes from the 'self'/'customer' enum to free text (no
--     column change needed — it was never CHECK-constrained)
--   - new sites / call_sites / commitments / escalations tables
--
-- Site roster confirmed with the owner as provisional — see "Known roster
-- and sites" in docs/ADDITIONAL_FEATURES_M0.md. Both this list and the
-- staff vocabulary (kept in the extraction prompt, not a DB table — see
-- packages/core/prompts/v2/system.ts) will grow as more calls surface names.

ALTER TABLE calls ADD COLUMN call_type TEXT;
ALTER TABLE calls ADD COLUMN material_needs TEXT;

CREATE TABLE sites (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE call_sites (
  call_id     TEXT NOT NULL REFERENCES calls(id),
  site_id     TEXT NOT NULL REFERENCES sites(id),
  PRIMARY KEY (call_id, site_id)
);

CREATE TABLE commitments (
  id                 TEXT PRIMARY KEY,
  call_id            TEXT NOT NULL REFERENCES calls(id),
  raw_phrase         TEXT NOT NULL,
  resolved_datetime  TEXT,
  promised_to        TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE escalations (
  id          TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  site_id     TEXT REFERENCES sites(id),
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at   TEXT
);

CREATE INDEX idx_call_sites_site ON call_sites(site_id);
CREATE INDEX idx_commitments_call ON commitments(call_id);
CREATE INDEX idx_escalations_status ON escalations(status, created_at DESC);

INSERT INTO sites (id, name) VALUES
  (lower(hex(randomblob(16))), 'Sector 35'),
  (lower(hex(randomblob(16))), 'Sector 70'),
  (lower(hex(randomblob(16))), 'Sector 106'),
  (lower(hex(randomblob(16))), 'Sector 241'),
  (lower(hex(randomblob(16))), '123/125'),
  (lower(hex(randomblob(16))), 'Regalia'),
  (lower(hex(randomblob(16))), 'Eco City / Mullanpur'),
  (lower(hex(randomblob(16))), 'Dera Bassi'),
  (lower(hex(randomblob(16))), 'Homeland');

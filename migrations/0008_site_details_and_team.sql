-- D1 migration 0008 — site details (address, point of contact) and a
-- per-site team roster. Always-editable on the per-site page (SiteView),
-- not gated on call/item count. Mirrors packages/core/src/schema.sql.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

ALTER TABLE sites ADD COLUMN address TEXT;
ALTER TABLE sites ADD COLUMN poc_name TEXT;

CREATE TABLE site_team_members (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL REFERENCES sites(id),
  name            TEXT NOT NULL,
  contact_number  TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_site_team_members_site ON site_team_members(site_id);

-- D1 migration 0010 — site media (photos/videos), a site-edit log, and the
-- columns needed to link a call to a site explicitly at upload time (voice
-- notes reuse the call pipeline rather than being a separate attachment
-- type — see docs/BUILD_BRIEF.md-adjacent plan notes). The unified site
-- timeline is composed at read time from these tables plus `calls` and
-- `site_team_members`, not from a generic write-time activity log — see
-- getSiteTimeline in packages/core/src/queries.ts. Mirrors
-- packages/core/src/schema.sql. Applied via:
-- wrangler d1 migrations apply sbm-dev --local|--remote

CREATE TABLE site_media (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES sites(id),
  media_type    TEXT NOT NULL,           -- 'photo' | 'video'  (voice notes live in `calls`, not here)
  r2_key        TEXT NOT NULL UNIQUE,
  content_type  TEXT NOT NULL,
  file_size     INTEGER,
  caption       TEXT,
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_site_media_site ON site_media(site_id, created_at DESC);

-- sites.address/poc_name are overwritten in place with no history. One row
-- here per PATCH that actually changed something, so the timeline has
-- something to show for "site details edited."
CREATE TABLE site_edits (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES sites(id),
  actor_user_id TEXT REFERENCES users(id),  -- NULL if no session was present on the request
  summary       TEXT NOT NULL,              -- e.g. "Address, point of contact updated"
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_site_edits_site ON site_edits(site_id, created_at DESC);

ALTER TABLE site_team_members ADD COLUMN added_by TEXT REFERENCES users(id);

-- Explicit site link + uploader for a voice memo, set at upload time (the
-- user is already on the site's page — no need to wait for extraction to
-- infer the site from transcript content). NULL for every ordinary
-- phone-uploaded call.
ALTER TABLE calls ADD COLUMN recorded_for_site_id TEXT REFERENCES sites(id);
ALTER TABLE calls ADD COLUMN uploaded_by_user_id TEXT REFERENCES users(id);
CREATE INDEX idx_calls_recorded_for_site ON calls(recorded_for_site_id);

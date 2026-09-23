-- D1 migration 0038 — site_activity_summary for directory "Last activity".
-- Forward-looking only: no historical backfill. Rows appear when a write
-- path calls touchSiteActivity (packages/core/src/queries.ts). Directory
-- sorts by last_activity_at DESC NULLS LAST so untouched sites sink below
-- anything that has moved since this shipped.

CREATE TABLE site_activity_summary (
  site_id TEXT PRIMARY KEY NOT NULL REFERENCES sites(id),
  last_activity_at TEXT NOT NULL,
  last_source TEXT,
  last_ref_id TEXT
);

CREATE INDEX idx_site_activity_summary_at ON site_activity_summary (last_activity_at DESC);

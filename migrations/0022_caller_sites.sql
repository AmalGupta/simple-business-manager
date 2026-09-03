-- "Associated sites" on a caller — normal-form join table, mirrors
-- call_sites exactly (packages/core/src/schema.sql). Schema only for now;
-- nothing populates it yet — linking logic is a later feature.
CREATE TABLE caller_sites (
  caller_id   TEXT NOT NULL REFERENCES callers(id),
  site_id     TEXT NOT NULL REFERENCES sites(id),
  PRIMARY KEY (caller_id, site_id)
);

CREATE INDEX idx_caller_sites_site ON caller_sites(site_id);

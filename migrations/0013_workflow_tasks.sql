-- D1 migration 0013 — the site-task workflow system: a fixed catalog of
-- production task types (the "Process Aluminium" pipeline) instantiated
-- once per site and assignable to staff. These are independent task types,
-- not sequential pipeline steps — no ordering column, and completing one
-- never implies which other one is "next" (confirmed with the owner: the
-- states are not sequential). Mirrors packages/core/src/schema.sql.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

CREATE TABLE workflow_stages (
  id        TEXT PRIMARY KEY,
  label     TEXT NOT NULL,
  category  TEXT NOT NULL
);

CREATE TABLE site_tasks (
  id                    TEXT PRIMARY KEY,
  site_id               TEXT NOT NULL REFERENCES sites(id),
  stage_id              TEXT NOT NULL REFERENCES workflow_stages(id),
  status                TEXT NOT NULL DEFAULT 'unassigned',  -- unassigned | assigned | done
  assigned_to_user_id   TEXT REFERENCES users(id),
  assigned_by_user_id   TEXT REFERENCES users(id),
  assigned_at           TEXT,
  due_date              TEXT,
  completed_at          TEXT,
  completed_by_user_id  TEXT REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(site_id, stage_id)
);
CREATE INDEX idx_site_tasks_site ON site_tasks(site_id);
CREATE INDEX idx_site_tasks_assignee ON site_tasks(assigned_to_user_id, status);

INSERT INTO workflow_stages (id, label, category) VALUES
  ('order_received',              'Order Received',                                'admin_intake'),
  ('details_uploaded',            'Details Upload To System',                      'admin_intake'),
  ('site_inspection',             'Site Inspection',                               'measurement'),
  ('material_ordered',            'Material Ordered',                              'procurement'),
  ('material_received',           'Material Received',                            'procurement'),
  ('material_sent_coating',       'Material Sent For Coating',                     'production'),
  ('material_received_coating',   'Material Received From Coating',                'production'),
  ('quality_control_frames',      'Quality Control',                               'quality_control'),
  ('final_measurements_uploaded', 'Final Measurements Uploaded',                   'measurement'),
  ('production_starts',           'Production Starts',                            'production'),
  ('frames_only_qc',              'Frames Only Quality Control',                   'quality_control'),
  ('frames_billed_delivered',     'Frames Billed & Delivered',                     'billing_delivery'),
  ('frames_installed',            'Frames Installed',                             'installation'),
  ('payment_frames',              'Payment',                                       'billing_delivery'),
  ('glass_ordered',               'Glass Ordered',                                 'procurement'),
  ('glass_received',              'Glass Received',                               'procurement'),
  ('shutter_integrated',          'Shutter Integrated',                           'production'),
  ('quality_control_shutter',     'Quality Control',                               'quality_control'),
  ('billed_delivered',            'Billed & Delivered',                            'billing_delivery'),
  ('shutter_installed',           'Shutter Installed',                            'installation'),
  ('handover',                    'Handover + Silicon + Georgian Glass + Accessories', 'handover'),
  ('payment_final',               'Payment',                                       'billing_delivery'),
  ('mesh_locking_done',           'Mesh & Locking Done',                           'production');

-- Backfill: every existing site gets all 23 stages, unassigned. New sites
-- get the same seeding at creation time (see createSite in queries.ts).
INSERT INTO site_tasks (id, site_id, stage_id, status)
SELECT lower(hex(randomblob(16))), sites.id, workflow_stages.id, 'unassigned'
FROM sites CROSS JOIN workflow_stages;

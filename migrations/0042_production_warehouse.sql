-- D1 migration 0042 — production job tracker + warehouse register.
--
-- Built from the owner's voice note describing two roles: Tanseem
-- (production head / foreman for aluminium doors & windows) and Manglesh
-- (new joiner running the two warehouses). See the approved diagram
-- ("Production & Warehouse Workflow") for the full flow.
--
-- Deliberately a THIRD, separate axis from workflow_stages/site_tasks
-- (migration 0013, one row per fixed stage per site, not sequential) and
-- from installations/installation_updates (migration 0016/0017, a
-- repeatable field-visit checklist). A production job is:
--   - created once per order/survey, tied to a site
--   - has exactly 5 steps that run IN ORDER (measurement -> cutting ->
--     routing -> assembly -> glass_integration) — the one place in this
--     app where step order is actually enforced
--   - each step is individually assignable, same shape as site_tasks
--     (assigned_to/by_user_id, assigned_at, completed_at/by) so the existing
--     assign/complete UI patterns carry over almost unchanged
--   - can have site problems raised against it at any point (not gated on
--     step order), each dual-written into `escalations` for admin
--     visibility, same pattern as installation_updates' "complaints" row
--
-- Warehouse is a movement ledger, not a stock table: `warehouse_movements`
-- rows are never edited, only voided and re-entered (see CLAUDE.md-style
-- "entries are never edited" note in the approved diagram) — stock is a
-- read-time SUM(in) - SUM(out) - SUM(dispatch) per store/item/batch.
-- `tool_movements` is a separate simple out/back log per the approved
-- scope (no per-tool inventory ids in this pass).
--
-- Mirrors packages/core/src/schema.sql. Applied via:
-- wrangler d1 migrations apply sbm-dev --local|--remote

CREATE TABLE production_jobs (
  id                 TEXT PRIMARY KEY,
  site_id            TEXT NOT NULL REFERENCES sites(id),
  title              TEXT NOT NULL,
  survey_note        TEXT,   -- free text describing/linking the survey handed to the production head
  status             TEXT NOT NULL DEFAULT 'active',  -- active | ready_for_dispatch | dispatched | completed
  created_by_user_id TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at       TEXT
);
CREATE INDEX idx_production_jobs_site ON production_jobs(site_id);
CREATE INDEX idx_production_jobs_status ON production_jobs(status);

-- One row per job per fixed step (seeded at job creation — see
-- createProductionJob in queries.ts, mirrors the site_tasks seeding
-- pattern). step_key/step_order come from the fixed PRODUCTION_STEPS
-- catalog in web/src/lib/constants.js + packages/core/src/production-steps.ts
-- rather than a DB catalog table, since — unlike workflow_stages — there
-- is exactly one pipeline and it never varies per site.
CREATE TABLE production_job_steps (
  id                   TEXT PRIMARY KEY,
  job_id               TEXT NOT NULL REFERENCES production_jobs(id),
  step_key             TEXT NOT NULL,  -- measurement | cutting | routing | assembly | glass_integration
  step_order           INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending | assigned | done | blocked
  assigned_to_user_id  TEXT REFERENCES users(id),
  assigned_by_user_id  TEXT REFERENCES users(id),
  assigned_at          TEXT,
  completed_at         TEXT,
  completed_by_user_id TEXT REFERENCES users(id),
  note                 TEXT,   -- optional note left when marking a step done
  blocked_note         TEXT,
  blocked_at           TEXT,
  UNIQUE(job_id, step_key)
);
CREATE INDEX idx_production_job_steps_job ON production_job_steps(job_id, step_order);
CREATE INDEX idx_production_job_steps_assignee ON production_job_steps(assigned_to_user_id, status);

-- Site problems raised against a job at any point (not gated on step
-- order) — Tanseem's "goes to site and resolves it" role from the voice
-- note. Independently trackable here AND dual-written into `escalations`
-- (source='production') for admin home-tile visibility, same decoupled
-- pattern as installation_updates' complaints row: resolving one list does
-- not auto-resolve the other.
CREATE TABLE production_job_problems (
  id                   TEXT PRIMARY KEY,
  job_id               TEXT NOT NULL REFERENCES production_jobs(id),
  site_id              TEXT NOT NULL REFERENCES sites(id),
  description          TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'open',  -- open | resolved
  raised_by_user_id    TEXT REFERENCES users(id),
  raised_at            TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_by_user_id  TEXT REFERENCES users(id),
  resolved_at          TEXT,
  resolution_note      TEXT
);
CREATE INDEX idx_production_job_problems_job ON production_job_problems(job_id);
CREATE INDEX idx_production_job_problems_status ON production_job_problems(status);

ALTER TABLE escalations ADD COLUMN production_job_problem_id TEXT REFERENCES production_job_problems(id);

-- Two known stores from the voice note. `key` is stable and referenced by
-- app code; `label` is display-only and editable later without a migration.
CREATE TABLE warehouse_stores (
  id    TEXT PRIMARY KEY,
  key   TEXT NOT NULL UNIQUE,   -- hardware_glass | aluminium_profile
  label TEXT NOT NULL
);
INSERT INTO warehouse_stores (id, key, label) VALUES
  ('store_hardware_glass',    'hardware_glass',    'Hardware & Glass-Hardware Store'),
  ('store_aluminium_profile', 'aluminium_profile', 'Aluminium Profile Store');

-- The movement ledger. Never UPDATEd for its content fields — a mistake is
-- voided (status='voided') and re-entered, so the history stays
-- trustworthy (see the approved diagram's "mistakes are voided, never
-- edited" note). Stock, per store/item/batch, is SUM(in) - SUM(out) -
-- SUM(dispatch) over status='active' rows — see listWarehouseStock.
CREATE TABLE warehouse_movements (
  id                  TEXT PRIMARY KEY,
  store_id            TEXT NOT NULL REFERENCES warehouse_stores(id),
  kind                TEXT NOT NULL,  -- in | out | dispatch | maintenance
  item                TEXT NOT NULL,
  quantity            REAL NOT NULL,
  unit                TEXT,
  batch_no            TEXT,
  site_id             TEXT REFERENCES sites(id),            -- required for dispatch
  production_job_id   TEXT REFERENCES production_jobs(id),  -- optional link for out/dispatch
  supplier            TEXT,             -- 'in' only
  machine_or_area     TEXT,             -- 'maintenance' only
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'active',  -- active | voided
  created_by_user_id  TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  voided_by_user_id   TEXT REFERENCES users(id),
  voided_at           TEXT
);
CREATE INDEX idx_warehouse_movements_store_item ON warehouse_movements(store_id, item, status);
CREATE INDEX idx_warehouse_movements_site ON warehouse_movements(site_id);
CREATE INDEX idx_warehouse_movements_job ON warehouse_movements(production_job_id);
CREATE INDEX idx_warehouse_movements_created ON warehouse_movements(created_at DESC);

-- Simple out/back tool log — no per-tool inventory id in this pass (see
-- the approved diagram's open question 4; "Drill #2"-style numbering is a
-- follow-up, not a migration change, if it's wanted later).
CREATE TABLE tool_movements (
  id                  TEXT PRIMARY KEY,
  tool_name           TEXT NOT NULL,
  taken_by_user_id    TEXT NOT NULL REFERENCES users(id),
  location             TEXT NOT NULL DEFAULT 'site',  -- workshop | site
  site_id             TEXT REFERENCES sites(id),
  note                TEXT,
  taken_at            TEXT NOT NULL DEFAULT (datetime('now')),
  returned_at         TEXT,
  created_by_user_id  TEXT REFERENCES users(id)
);
CREATE INDEX idx_tool_movements_open ON tool_movements(returned_at);

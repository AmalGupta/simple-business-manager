-- D1 schema — see docs/SCAFFOLDING.md §4.
-- Source of truth for `migrations/0001_init.sql`; keep the two in sync.

CREATE TABLE clients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE calls (
  id              TEXT PRIMARY KEY,
  r2_key          TEXT NOT NULL UNIQUE,
  client_id       TEXT REFERENCES clients(id),
  source          TEXT NOT NULL,        -- 'android' | 'ios' | 'drive'
  recorded_at     TEXT,                 -- when this row was uploaded (not necessarily when the call happened)
  recording_date  TEXT,                 -- the recorder's own filename timestamp, if the filename matched (e.g. AUDIO-2026-08-20-22-05-33.m4a); NULL otherwise
  duration_s      INTEGER,

  -- migration 0020: Google Drive file id for Calls-folder poller idempotency
  drive_file_id   TEXT,

  stt_job_id      TEXT,
  stt_status      TEXT NOT NULL DEFAULT 'pending',
                  -- pending | transcription_in_progress | transcribed | extracted | failed
  stt_error       TEXT,

  -- the extracted fields — see docs/ADDITIONAL_FEATURES_M0.md "Revised extraction schema"
  call_type       TEXT,                 -- 'client' | 'internal' | 'low_signal' — low_signal calls get no dashboard card
  summary         TEXT,
  key_takeaways   TEXT,                 -- JSON array
  unresolved      TEXT,                 -- JSON array of { item, blocked_on } (LLM output — never edited by him)
  material_needs  TEXT,                 -- JSON array of strings — shortage events, self-expiring, not a ledger
  deadline        TEXT,                 -- ISO date or NULL

  -- which prompt version produced the fields above; never null after extraction
  prompt_version  TEXT,

  -- migration 0010: set only when this call is a voice memo uploaded
  -- explicitly from a site's page (not inferred from transcript content,
  -- and orthogonal to call_type — a memo can still classify as internal or
  -- low_signal). NULL for every ordinary phone-uploaded call.
  recorded_for_site_id  TEXT REFERENCES sites(id),
  uploaded_by_user_id   TEXT REFERENCES users(id),

  -- migration 0016: set when this call is the required voice note for one
  -- installation_updates checklist row (the staff site-visit flow), rather
  -- than an ordinary site voice memo or phone call. NULL otherwise.
  installation_update_id TEXT REFERENCES installation_updates(id),

  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The organising unit in speech is the site, not the client — a call
-- commonly touches several sites, so this is many-to-many rather than a
-- column on `calls`. See docs/ADDITIONAL_FEATURES_M0.md.
CREATE TABLE sites (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  is_confirmed  TEXT,          -- NULL = unreviewed, 'Y' = confirmed valid, 'N' = confirmed not a real site
  address       TEXT,
  poc_name      TEXT,          -- point of contact
  house_no      TEXT,
  sector        TEXT,
  city          TEXT,
  poc_contact_number TEXT,
  assigned_by   TEXT,
  referred_by   TEXT,
  site_location TEXT,          -- lat,lng or map pin captured at intake
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  -- migration 0012: admin/superadmin-editable, ISO date. Drives the missed
  -- red highlight on the Sites list and the staff-facing banner.
  target_closure_date TEXT
);

-- Always-editable roster of people assigned to a site — see
-- docs/ADDITIONAL_FEATURES_M0.md and the SiteView "Assign team" popup.
CREATE TABLE site_team_members (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL REFERENCES sites(id),
  name            TEXT NOT NULL,
  contact_number  TEXT NOT NULL,
  added_by        TEXT REFERENCES users(id),   -- migration 0010; NULL if added before login existed or with no session
  -- migration 0011: links this row to a real login account when assigned via
  -- the admin "choose from dropdown" flow. NULL for free-text rows added
  -- before this feature existed.
  user_id         TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE call_sites (
  call_id     TEXT NOT NULL REFERENCES calls(id),
  site_id     TEXT NOT NULL REFERENCES sites(id),
  PRIMARY KEY (call_id, site_id)
);

-- Datetime, not date — "साढ़े दस बजे निकलियो", "कल सुबह अर्ली" — raw_phrase is
-- kept alongside resolved_datetime so he can verify the system heard
-- correctly at a glance. See docs/ADDITIONAL_FEATURES_M0.md.
CREATE TABLE commitments (
  id                 TEXT PRIMARY KEY,
  call_id            TEXT NOT NULL REFERENCES calls(id),
  raw_phrase         TEXT NOT NULL,
  resolved_datetime  TEXT,
  promised_to        TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Manual only — the pipeline never writes here. See docs/ADDITIONAL_FEATURES_M0.md
-- "Tile 4 — Escalations" for why: a 2-of-11 client-urgency signal isn't enough
-- to trust an LLM classifier with this, and a tile he didn't put items in is a
-- tile he stops trusting.
--
-- migration 0016: field complaints (the staff site-visit flow) write here
-- too, rather than forking a second complaints system — created_by_user_id/
-- source distinguish an admin-typed entry from a staff-filed one, and
-- installation_update_id links back to the checklist row that raised it
-- (NULL for a site-level complaint with no installation).
CREATE TABLE escalations (
  id                     TEXT PRIMARY KEY,
  text                   TEXT NOT NULL,
  site_id                TEXT REFERENCES sites(id),
  status                 TEXT NOT NULL DEFAULT 'open',   -- open | done
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at              TEXT,
  created_by_user_id     TEXT REFERENCES users(id),
  source                 TEXT NOT NULL DEFAULT 'admin',  -- admin | staff_field
  installation_update_id TEXT REFERENCES installation_updates(id),
  assigned_to_user_id    TEXT REFERENCES users(id),
  assigned_by_user_id    TEXT REFERENCES users(id),
  assigned_at            TEXT
);

CREATE TABLE todos (
  id                TEXT PRIMARY KEY,
  call_id           TEXT NOT NULL REFERENCES calls(id),
  owner             TEXT NOT NULL,      -- free text: a staff name, or 'self' for the business owner's own commitments
  text              TEXT NOT NULL,
  due_date          TEXT,

  -- manual override, deliberately separate from calls.unresolved
  status            TEXT NOT NULL DEFAULT 'open',   -- open | done | snoozed
  snoozed_until     TEXT,
  completed_at      TEXT,

  customer_waiting  INTEGER NOT NULL DEFAULT 0,
  origin            TEXT NOT NULL DEFAULT 'llm',    -- 'llm' | 'manual'

  -- M1 placeholder: which later call evidenced this closing.
  -- Column exists now so M1 needs no migration against live data.
  closed_by_call_id TEXT REFERENCES calls(id),

  created_at        TEXT NOT NULL DEFAULT (datetime('now')),

  -- Assignment (migration 0015) — mirrors site_tasks' assigned_to_user_id.
  assigned_to_user_id TEXT REFERENCES users(id),
  assigned_by_user_id TEXT REFERENCES users(id),
  assigned_at         TEXT
);

-- One row per call's fetched transcript, linked by r2_key rather than a
-- column on `calls` — keeps raw STT output separate from the row `calls`
-- uses for everything else. Populated the moment the webhook fetches the
-- result (fetchResult in src/lib/sarvam.ts), so it's viewable immediately.
CREATE TABLE transcripts (
  id                  TEXT PRIMARY KEY,
  r2_key              TEXT NOT NULL UNIQUE REFERENCES calls(r2_key),
  transcript          TEXT NOT NULL,
  summary             TEXT,            -- placeholder: not written by any code path yet, distinct from calls.summary (the LLM six-field extraction)
  language_code       TEXT,
  diarized_transcript TEXT,            -- JSON: { entries: [{ speaker_id, transcript }] }
  fetched_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transcripts_r2_key ON transcripts(r2_key);

CREATE TABLE missed_deadlines (
  id          TEXT PRIMARY KEY,
  todo_id     TEXT NOT NULL REFERENCES todos(id),
  missed_on   TEXT NOT NULL,
  forgiven    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_todos_open ON todos(status, due_date);
CREATE INDEX idx_calls_client ON calls(client_id, created_at DESC);
CREATE INDEX idx_call_sites_site ON call_sites(site_id);
CREATE INDEX idx_commitments_call ON commitments(call_id);
CREATE INDEX idx_escalations_status ON escalations(status, created_at DESC);
CREATE INDEX idx_site_team_members_site ON site_team_members(site_id);
CREATE INDEX idx_site_team_members_user ON site_team_members(user_id);

-- Per-person accounts and sessions — migration 0009. Admin-seeded roster
-- only (POST /api/admin/users, gated by X-SBM-Key); login is name + short
-- PIN. See src/lib/auth.ts for the hashing scheme.
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  pin_hash        TEXT NOT NULL,
  pin_salt        TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  disabled_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),

  -- migration 0011: role-based access. 'staff' | 'admin' | 'superadmin',
  -- enforced in code (not a CHECK), same as is_confirmed above.
  role            TEXT NOT NULL DEFAULT 'staff',
  phone           TEXT,
  -- AES-256-GCM ciphertext of the current raw PIN (src/lib/auth.ts
  -- encryptPin/decryptPin) — lets admin/superadmin view a staff member's PIN
  -- from the Staff page. NULL until the PIN is next set/reset under this
  -- scheme.
  pin_encrypted   TEXT
);

CREATE TABLE sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Site media, edit log, and explicit call<->site linkage — migration 0010.
-- The unified site timeline is composed at read time from these tables plus
-- `calls` and `site_team_members` — see getSiteTimeline in queries.ts.
CREATE TABLE site_media (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES sites(id),
  media_type    TEXT NOT NULL,          -- 'photo' | 'video' (voice notes live in `calls`, not here)
  r2_key        TEXT NOT NULL UNIQUE,
  content_type  TEXT NOT NULL,
  file_size     INTEGER,
  caption       TEXT,
  uploaded_by   TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  -- migration 0016: set when this photo/video documents a specific
  -- installation_updates checklist row, in addition to always being tied
  -- to site_id above (keeps every existing site-scoped query unmodified).
  installation_update_id TEXT REFERENCES installation_updates(id)
);
CREATE INDEX idx_site_media_site ON site_media(site_id, created_at DESC);
CREATE INDEX idx_site_media_installation_update ON site_media(installation_update_id);

-- sites.address/poc_name are overwritten in place with no history; one row
-- here per PATCH that actually changed something.
CREATE TABLE site_edits (
  id            TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL REFERENCES sites(id),
  actor_user_id TEXT REFERENCES users(id),
  summary       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_site_edits_site ON site_edits(site_id, created_at DESC);
CREATE INDEX idx_calls_recorded_for_site ON calls(recorded_for_site_id);

-- Site-task workflow system — migration 0013. A fixed catalog of production
-- task types (workflow_stages, seeded in the migration) instantiated once
-- per site (site_tasks). These are independent task types, not sequential
-- pipeline steps — deliberately no ordering column between them.
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

-- Staff field workflow — migration 0016. "Installations" are physical
-- windows/openings at a site (a site can have many); each accumulates its
-- own repeatable 6-category checklist ("installation_updates") over visits.
-- Distinct from workflow_stages/site_tasks above, which is a fixed
-- one-row-per-stage-per-site production catalog with no attachments and no
-- repeat visits — different axis entirely, do not conflate the two.
CREATE TABLE installations (
  id          TEXT PRIMARY KEY,
  site_id     TEXT NOT NULL REFERENCES sites(id),
  label       TEXT NOT NULL,   -- staff-entered at creation, e.g. "Window 3 - Living Room"
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  -- migration 0017: 'installation' | 'measurement' | 'material_delivery' —
  -- one table serves all three site-visit categories, since they turned out
  -- to want the exact same pick/create-instance + checklist pattern.
  category    TEXT NOT NULL DEFAULT 'installation'
);
CREATE INDEX idx_installations_site ON installations(site_id);
CREATE INDEX idx_installations_site_category ON installations(site_id, category);

-- One row per checklist-category report on one installation. "Complete"
-- (voice note + at least one photo/video) is a read-time computation, not a
-- stored column — see listInstallationUpdates in queries.ts.
CREATE TABLE installation_updates (
  id                   TEXT PRIMARY KEY,
  installation_id      TEXT NOT NULL REFERENCES installations(id),
  category             TEXT NOT NULL,  -- location|work_done|work_pending|material_short|complaints|site_delay
  voice_note_call_id   TEXT REFERENCES calls(id),
  reported_by_user_id  TEXT NOT NULL REFERENCES users(id),
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_installation_updates_installation ON installation_updates(installation_id);

-- A real ledger (open/fulfilled) for material-short reports filed from the
-- site-visit flow — unlike the existing self-expiring calls.material_needs
-- field, admin needs to see outstanding shortages across sites and resolve
-- them explicitly.
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

-- migration 0020: feature toggles (Drive poll enabled, last-poll metadata)
CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_calls_drive_file_id
  ON calls(drive_file_id)
  WHERE drive_file_id IS NOT NULL;


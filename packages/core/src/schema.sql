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
  source          TEXT NOT NULL,        -- 'android' | 'ios'
  recorded_at     TEXT,                 -- when this row was uploaded (not necessarily when the call happened)
  recording_date  TEXT,                 -- the recorder's own filename timestamp, if the filename matched (e.g. AUDIO-2026-08-20-22-05-33.m4a); NULL otherwise
  duration_s      INTEGER,

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

  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The organising unit in speech is the site, not the client — a call
-- commonly touches several sites, so this is many-to-many rather than a
-- column on `calls`. See docs/ADDITIONAL_FEATURES_M0.md.
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
CREATE TABLE escalations (
  id          TEXT PRIMARY KEY,
  text        TEXT NOT NULL,
  site_id     TEXT REFERENCES sites(id),
  status      TEXT NOT NULL DEFAULT 'open',   -- open | done
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at   TEXT
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

  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
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

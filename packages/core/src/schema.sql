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

  -- the six extracted fields
  summary         TEXT,
  key_takeaways   TEXT,                 -- JSON array
  unresolved      TEXT,                 -- JSON array (LLM output — never edited by him)
  deadline        TEXT,                 -- ISO date or NULL

  -- which prompt version produced the fields above; never null after extraction
  prompt_version  TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE todos (
  id                TEXT PRIMARY KEY,
  call_id           TEXT NOT NULL REFERENCES calls(id),
  owner             TEXT NOT NULL,      -- 'self' | 'customer'
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

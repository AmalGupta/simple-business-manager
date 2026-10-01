-- SBM-103 — task updates. Staff "Share update" on any assigned work item
-- (call todo, site stage, complaint), the notes they leave when marking it
-- done (what was completed / what is pending), and the admin's replies.
-- One row per post; its voice notes / photos / videos hang off it in
-- task_update_media. Posts on a site-linked item also show on the site
-- timeline (getSiteTimeline). A "pending" note on done spawns a follow-up
-- task, recorded in followup_kind / followup_id.

CREATE TABLE task_updates (
  id              TEXT PRIMARY KEY,
  item_kind       TEXT NOT NULL,              -- todo | site_task | complaint
  item_id         TEXT NOT NULL,
  site_id         TEXT REFERENCES sites(id),
  author_user_id  TEXT NOT NULL REFERENCES users(id),
  section         TEXT NOT NULL DEFAULT 'update',  -- update | completed | pending
  body            TEXT,
  followup_kind   TEXT,
  followup_id     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_task_updates_item ON task_updates(item_kind, item_id, created_at);
CREATE INDEX idx_task_updates_followup ON task_updates(followup_kind, followup_id);
CREATE INDEX idx_task_updates_site ON task_updates(site_id, created_at);
CREATE INDEX idx_task_updates_created ON task_updates(created_at);

-- Voice notes live in VOICE_NOTES (Sarvam reads from there); photos/videos
-- in RECORDINGS, same split as calls vs site_media. Voice is transcribed
-- only — never sent to extraction.
CREATE TABLE task_update_media (
  id            TEXT PRIMARY KEY,
  update_id     TEXT NOT NULL REFERENCES task_updates(id),
  media_type    TEXT NOT NULL,                -- voice | photo | video
  r2_key        TEXT NOT NULL UNIQUE,
  content_type  TEXT,
  file_size     INTEGER,
  stt_job_id    TEXT,
  stt_status    TEXT,                         -- voice: pending | done | failed
  transcript    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_task_update_media_update ON task_update_media(update_id);
CREATE INDEX idx_task_update_media_job ON task_update_media(stt_job_id);

-- Green "has updates" bubble: an item has news for a viewer when the other
-- side (staff vs admin/superadmin) posted after the viewer last opened it.
CREATE TABLE task_update_seen (
  item_kind  TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id),
  seen_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_kind, item_id, user_id)
);

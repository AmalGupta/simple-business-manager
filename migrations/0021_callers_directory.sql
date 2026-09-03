-- Callers Directory: renames clients -> callers and adds caller-management
-- fields (family/staff/client/spam classification, optional staff-roster
-- link) plus soft-delete on calls for spam cleanup. category is enforced
-- in code (CallerCategory in packages/core/src/types.ts), not a SQL CHECK
-- — matches how users.role / sites.is_confirmed are already handled (see
-- migrations/0011_roles_and_access.sql).

ALTER TABLE clients RENAME TO callers;

-- 'family' | 'staff' | 'client' | 'spam'. Every pre-existing row (all
-- sourced from real Drive calls, never gated before this feature) defaults
-- to 'client' — the safe backward-compatible read.
ALTER TABLE callers ADD COLUMN category TEXT NOT NULL DEFAULT 'client';

-- Optional link into the staff roster when this caller IS a staff member's
-- own number. Nullable; populated by phone match or set from the directory
-- admin UI.
ALTER TABLE callers ADD COLUMN staff_user_id TEXT REFERENCES users(id);

CREATE INDEX idx_callers_category ON callers(category);
CREATE INDEX idx_callers_staff_user ON callers(staff_user_id);

-- Soft-delete for spam calls: the row + transcript stay for audit, but the
-- R2 audio object is actually deleted (see src/handlers/stt-webhook.ts).
ALTER TABLE calls ADD COLUMN deleted_at TEXT;
ALTER TABLE calls ADD COLUMN deleted_reason TEXT;

-- calls.stt_status also gains a new value, 'skipped', for Family and
-- known-repeat-Spam minimal rows that never get an R2 download or Sarvam
-- submission — no schema change needed since stt_status has no CHECK
-- either, called out here for the record.

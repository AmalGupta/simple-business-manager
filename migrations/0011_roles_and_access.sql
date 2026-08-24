-- D1 migration 0011 — role-based access. Three roles: 'staff' (lands on a
-- filtered Sites view, sees only sites they're assigned to), 'admin' (full
-- dashboard, manages staff + site assignment), 'superadmin' (same view as
-- admin). Enforced in code, not a SQL CHECK — matches how users.disabled_at
-- and sites.is_confirmed are already handled. Mirrors
-- packages/core/src/schema.sql. Applied via:
-- wrangler d1 migrations apply sbm-dev --local|--remote

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff';
ALTER TABLE users ADD COLUMN phone TEXT;

-- AES-256-GCM ciphertext of the user's current raw PIN (src/lib/auth.ts
-- encryptPin/decryptPin), stored alongside the existing one-way pin_hash so
-- admin/superadmin can view a staff member's PIN from the Staff page. NULL
-- until the account's PIN is next set/reset under this scheme.
ALTER TABLE users ADD COLUMN pin_encrypted TEXT;

-- Links a site's team-roster row to a real login account when assigned via
-- the admin "choose from dropdown" flow. Nullable — existing rows added as
-- free text before this feature stay NULL.
ALTER TABLE site_team_members ADD COLUMN user_id TEXT REFERENCES users(id);
CREATE INDEX idx_site_team_members_user ON site_team_members(user_id);

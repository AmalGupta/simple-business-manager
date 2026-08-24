-- D1 migration 0012 — target closure date per site, admin/superadmin
-- editable, feeds the missed-deadline red highlight on the Sites list and
-- the staff-facing "missed by N days" banner on a site's own page. No
-- CHECK, consistent with the rest of the schema. Mirrors
-- packages/core/src/schema.sql. Applied via:
-- wrangler d1 migrations apply sbm-dev --local|--remote

ALTER TABLE sites ADD COLUMN target_closure_date TEXT;

-- D1 migration 0007 — site confirmation workflow. A separate Claude Haiku
-- pass (packages/core/prompts/site-scan.ts) now scans every new call's
-- transcript for site references and upserts into `sites`, alongside the
-- existing Sonnet extraction's sites[] field. Both feed the same table.
--
-- NULL = not yet reviewed (the default for every new site, discovered or
-- seeded). 'Y' = confirmed valid. 'N' = confirmed not a real site — hidden
-- from sites-needing-attention and call site chips, but the row stays for
-- the record rather than being deleted.
-- Applied via: wrangler d1 migrations apply sbm-dev --local|--remote

ALTER TABLE sites ADD COLUMN is_confirmed TEXT;

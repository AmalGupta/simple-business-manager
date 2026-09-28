-- Drops the 0047 rollback snapshot. Run only once 0047 is confirmed good —
-- after this, rolling back needs D1 Time Travel instead.
DROP TABLE IF EXISTS _bak0047_callers;
DROP TABLE IF EXISTS _bak0047_call_links;
DROP TABLE IF EXISTS _bak0047_caller_sites;
DROP TABLE IF EXISTS _bak0047_caller_aliases;
DROP TABLE IF EXISTS _bak0047_user_phones;
DROP TABLE IF EXISTS _bak0047_rollbacks;
DROP TABLE IF EXISTS _bak0047_meta;

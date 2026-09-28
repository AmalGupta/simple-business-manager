#!/usr/bin/env bash
# Reversible apply of migrations/0047_contacts_dedupe.sql (SBM-65).
#
#   scripts/contacts-dedupe-0047.sh apply    <dev|uat> [--local]
#       1. snapshot   (scripts/sql/0047_contacts_dedupe_backup.sql)
#       2. migrate    (wrangler d1 migrations apply — runs 0047)
#       3. check      (orphaned calls / site links, staff links)
#   scripts/contacts-dedupe-0047.sh rollback <dev|uat> [--local]
#       Undo 0047 from the snapshot (scripts/sql/0047_contacts_dedupe_rollback.sql).
#       Only ever runs when you call it; nothing triggers it automatically.
#   scripts/contacts-dedupe-0047.sh check    <dev|uat> [--local]
#   scripts/contacts-dedupe-0047.sh cleanup  <dev|uat> [--local]
#       Drop the snapshot once 0047 is confirmed good.
#
# Remote is live data: every remote step asks for confirmation. --local runs
# against .wrangler/state (stop `wrangler dev` first — SQLITE_BUSY).
# Never run `wrangler d1 migrations apply` for 0047 on its own: without the
# snapshot there is nothing to roll back to except D1 Time Travel.

set -euo pipefail
cd "$(dirname "$0")/.."

ACTION="${1:-}"
ENV_NAME="${2:-}"
WHERE="--remote"
[ "${3:-}" = "--local" ] && WHERE="--local"
# Local only: SBM_PERSIST_TO=<dir> points at a copy of .wrangler/state
# instead of your working local DB (used to rehearse the full flow).
PERSIST=()
[ "$WHERE" = "--local" ] && [ -n "${SBM_PERSIST_TO:-}" ] && PERSIST=(--persist-to "$SBM_PERSIST_TO")

case "$ENV_NAME" in
  dev) DB=(sbm-dev) ;;
  uat) DB=(sbm-uat --env uat) ;;
  *) echo "usage: $0 <apply|rollback|check|cleanup> <dev|uat> [--local]" >&2; exit 2 ;;
esac

SQL_DIR=scripts/sql

d1_file() { npx wrangler d1 execute "${DB[@]}" "$WHERE" "${PERSIST[@]}" --file "$1" --yes; }
d1_cmd()  { npx wrangler d1 execute "${DB[@]}" "$WHERE" "${PERSIST[@]}" --command "$1" --json 2>/dev/null; }

confirm() {
  [ "$WHERE" = "--local" ] && return 0
  read -r -p "$1 on ${ENV_NAME} (REMOTE, live data). Type ${ENV_NAME} to continue: " answer
  [ "$answer" = "$ENV_NAME" ] || { echo "aborted"; exit 1; }
}

has_snapshot() {
  d1_cmd "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = '_bak0047_meta'" \
    | python3 -c "import sys,json; d=sys.stdin.read(); print(json.loads(d[d.index('['):])[0]['results'][0]['n'])"
}

check() {
  d1_cmd "SELECT
      (SELECT COUNT(*) FROM callers) AS contacts,
      (SELECT COUNT(*) FROM calls WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM callers)) AS orphan_calls,
      (SELECT COUNT(*) FROM caller_sites WHERE caller_id NOT IN (SELECT id FROM callers)) AS orphan_site_links,
      (SELECT COUNT(*) FROM caller_aliases WHERE caller_id NOT IN (SELECT id FROM callers)) AS orphan_aliases,
      (SELECT COUNT(*) FROM users u WHERE u.role = 'staff' AND u.disabled_at IS NULL AND u.phone IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM callers WHERE staff_user_id = u.id)) AS staff_without_contact,
      (SELECT COUNT(*) FROM callers WHERE phone IS NULL) AS contacts_without_number" \
    | python3 -c "import sys,json; d=sys.stdin.read(); [print(f'  {k:26} {v}') for k,v in json.loads(d[d.index('['):])[0]['results'][0].items()]"
}

case "$ACTION" in
  apply)
    if [ "$(has_snapshot)" != "0" ]; then
      echo "A 0047 snapshot already exists on ${ENV_NAME} — 0047 was applied (or started) before."
      echo "Roll back or clean up first; a second snapshot would capture the merged state." >&2
      exit 1
    fi
    # `migrations apply` runs every pending migration — only proceed when 0047
    # is the sole one, so nothing else rides along un-snapshotted.
    PENDING=$(npx wrangler d1 migrations list "${DB[@]}" "$WHERE" "${PERSIST[@]}" 2>/dev/null \
      | { grep -oE '[0-9]{4}[a-z0-9_]*\.sql' || true; } | sort -u | tr '\n' ' ')
    if [ "$PENDING" != "0047_contacts_dedupe.sql " ]; then
      echo "Pending migrations on ${ENV_NAME}: ${PENDING:-none}" >&2
      echo "Expected exactly 0047_contacts_dedupe.sql — apply the others first, or 0047 already ran." >&2
      exit 1
    fi
    echo "Before:"; check
    confirm "Snapshot contacts and apply migration 0047"
    echo "1/3 snapshot"; d1_file "$SQL_DIR/0047_contacts_dedupe_backup.sql"
    echo "2/3 migrate";  npx wrangler d1 migrations apply "${DB[@]}" "$WHERE" "${PERSIST[@]}"
    echo "3/3 after:";   check
    echo "Undo if needed: $0 rollback ${ENV_NAME}$([ "$WHERE" = "--local" ] && echo " --local")"
    ;;
  rollback)
    if [ "$(has_snapshot)" = "0" ]; then
      echo "No 0047 snapshot on ${ENV_NAME} — nothing to roll back to (use D1 Time Travel)." >&2
      exit 1
    fi
    echo "Before rollback:"; check
    confirm "ROLL BACK migration 0047"
    d1_file "$SQL_DIR/0047_contacts_dedupe_rollback.sql"
    echo "After rollback:"; check
    ;;
  check)
    check
    ;;
  cleanup)
    confirm "Drop the 0047 rollback snapshot (rollback no longer possible)"
    d1_file "$SQL_DIR/0047_contacts_dedupe_cleanup.sql"
    ;;
  *)
    echo "usage: $0 <apply|rollback|check|cleanup> <dev|uat> [--local]" >&2; exit 2 ;;
esac

#!/usr/bin/env bash
#
# UAT reset — wipe call/caller data on the live worker and load the new
# contacts master. Encodes docs/UAT_RESET_RUNBOOK.md as one script instead of
# copy-pasting commands by hand. Nothing here is a dry-run: every step that
# says "remote" touches the one live sbm-dev database — see
# docs/DEPLOY_RUNBOOK.md "there is no staging/dev environment separate from
# production".
#
# Usage:
#   scripts/uat_reset.sh --contacts-sql /path/to/contacts_master.sql [options]
#
# Options:
#   --contacts-sql PATH   Required. The INSERT-OR-IGNORE SQL file from
#                          scripts/import_contacts.py.
#   --wipe-all             Delete ALL calls, including the ones linked to
#                          site voice memos / installation checklist voice
#                          notes (Option A in the runbook). Default is
#                          scoped (Option B): those rows are preserved.
#   --skip-backup           Skip the `wrangler d1 export` backup. Not
#                          recommended — only for a second run where you
#                          already have a backup from the first.
#   --enable-poller         Flip app_settings.drive_poll_enabled to '1' at
#                          the end, so the */5 cron picks up ingestion
#                          immediately instead of waiting for a manual
#                          trigger.
#   --yes                  Skip the interactive confirmation prompt.
#
# Every destructive step's exit code is checked. If the contacts import
# doesn't actually land the expected number of rows in `callers`, the script
# exits non-zero rather than reporting success — see verify_contacts_import
# below.

set -euo pipefail

DB="sbm-dev"
WRANGLER=(npx wrangler)
CONTACTS_SQL=""
WIPE_ALL=false
SKIP_BACKUP=false
ENABLE_POLLER=false
ASSUME_YES=false

log() { echo "[uat-reset] $*"; }
die() { echo "[uat-reset] FATAL: $*" >&2; exit 1; }

# ---------------------------------------------------------------- args ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --contacts-sql) CONTACTS_SQL="$2"; shift 2 ;;
    --wipe-all) WIPE_ALL=true; shift ;;
    --skip-backup) SKIP_BACKUP=true; shift ;;
    --enable-poller) ENABLE_POLLER=true; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

[[ -n "$CONTACTS_SQL" ]] || die "--contacts-sql PATH is required (see --help)"
[[ -f "$CONTACTS_SQL" ]] || die "contacts SQL file not found: $CONTACTS_SQL"
command -v jq >/dev/null || die "jq is required and not on PATH"

# Expected row count = number of INSERT statements in the file. The importer
# (scripts/import_contacts.py) already dedupes within the sheet, so with an
# empty `callers` table every INSERT OR IGNORE should land — a shortfall
# means either callers wasn't actually empty (stale data survived the wipe)
# or the wrangler d1 execute call silently swallowed rows partway through.
EXPECTED_CONTACTS=$(grep -c "^INSERT OR IGNORE INTO callers" "$CONTACTS_SQL" || true)
[[ "$EXPECTED_CONTACTS" -gt 0 ]] || die "$CONTACTS_SQL has no INSERT statements — wrong file?"

# ------------------------------------------------------------ helpers ----
d1() {
  # d1 <sql> — runs one statement remotely, dies on failure.
  "${WRANGLER[@]}" d1 execute "$DB" --remote --command "$1" \
    || die "d1 command failed: $1"
}

d1_json() {
  # d1_json <sql> — same, but returns the raw JSON for jq parsing.
  "${WRANGLER[@]}" d1 execute "$DB" --remote --command "$1" 2>/dev/null \
    || die "d1 command failed: $1"
}

d1_scalar() {
  # d1_scalar <sql-selecting-one-column> — returns that column's value from row 0.
  d1_json "$1" | jq -r '.[0].results[0] | to_entries[0].value'
}

CALL_SCOPE_WHERE="WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL"
if $WIPE_ALL; then
  CALL_SCOPE_WHERE=""
fi

# --------------------------------------------------------- confirmation ----
log "Target database: $DB (remote — the only environment, see docs/DEPLOY_RUNBOOK.md)"
log "Contacts file:    $CONTACTS_SQL ($EXPECTED_CONTACTS contacts)"
log "Call wipe scope:  $([ "$WIPE_ALL" = true ] && echo 'ALL calls (--wipe-all)' || echo 'scoped — site memos / checklist voice notes preserved')"
log "Backup:           $([ "$SKIP_BACKUP" = true ] && echo 'SKIPPED (--skip-backup)' || echo 'yes, via wrangler d1 export')"
log "Enable poller:    $ENABLE_POLLER"

if ! $ASSUME_YES; then
  read -r -p "This wipes calls/callers data on the LIVE worker. Type 'yes' to continue: " confirm
  [[ "$confirm" == "yes" ]] || die "aborted by user"
fi

# ------------------------------------------------------------- backup ----
if ! $SKIP_BACKUP; then
  BACKUP_FILE="./backup-pre-uat-reset-$(date +%Y%m%d-%H%M%S).sql"
  log "Backing up to $BACKUP_FILE ..."
  "${WRANGLER[@]}" d1 export "$DB" --remote --output="$BACKUP_FILE" \
    || die "d1 export failed — aborting before touching any data"
  [[ -s "$BACKUP_FILE" ]] || die "backup file is empty — aborting, something is wrong before we've deleted anything"
  log "Backup OK ($(wc -l < "$BACKUP_FILE") lines)."
fi

# --------------------------------------------------------------- wipe ----
log "Decoupling installation_updates.voice_note_call_id from calls about to be deleted..."
d1 "UPDATE installation_updates SET voice_note_call_id = NULL WHERE voice_note_call_id IN (SELECT id FROM calls $CALL_SCOPE_WHERE)"

log "Deleting missed_deadlines..."
d1 "DELETE FROM missed_deadlines WHERE todo_id IN (SELECT id FROM todos WHERE call_id IN (SELECT id FROM calls $CALL_SCOPE_WHERE))"

log "Deleting todo_voice_notes..."
d1 "DELETE FROM todo_voice_notes WHERE todo_id IN (SELECT id FROM todos WHERE call_id IN (SELECT id FROM calls $CALL_SCOPE_WHERE))"

log "Deleting todo_assignees..."
d1 "DELETE FROM todo_assignees WHERE todo_id IN (SELECT id FROM todos WHERE call_id IN (SELECT id FROM calls $CALL_SCOPE_WHERE))"

log "Deleting todos..."
d1 "DELETE FROM todos WHERE call_id IN (SELECT id FROM calls $CALL_SCOPE_WHERE)"

log "Deleting commitments..."
d1 "DELETE FROM commitments WHERE call_id IN (SELECT id FROM calls $CALL_SCOPE_WHERE)"

log "Deleting call_sites..."
d1 "DELETE FROM call_sites WHERE call_id IN (SELECT id FROM calls $CALL_SCOPE_WHERE)"

log "Deleting transcripts..."
d1 "DELETE FROM transcripts WHERE r2_key IN (SELECT r2_key FROM calls $CALL_SCOPE_WHERE)"

R2_KEYS_FILE="./r2_keys_deleted_$(date +%Y%m%d-%H%M%S).json"
log "Saving R2 keys of calls about to be deleted to $R2_KEYS_FILE (for manual cleanup, not deleted from R2 by this script)..."
d1_json "SELECT r2_key FROM calls $CALL_SCOPE_WHERE" > "$R2_KEYS_FILE"

log "Deleting calls..."
d1 "DELETE FROM calls $CALL_SCOPE_WHERE"

log "Deleting callers..."
d1 "DELETE FROM callers"

CALLS_LEFT=$(d1_scalar "SELECT COUNT(*) AS n FROM calls")
CALLERS_LEFT=$(d1_scalar "SELECT COUNT(*) AS n FROM callers")
log "Post-wipe: calls=$CALLS_LEFT, callers=$CALLERS_LEFT"
if $WIPE_ALL; then
  [[ "$CALLS_LEFT" == "0" ]] || die "expected 0 calls after --wipe-all, found $CALLS_LEFT"
fi
[[ "$CALLERS_LEFT" == "0" ]] || die "expected 0 callers after wipe, found $CALLERS_LEFT"

# ---------------------------------------------------- contacts import ----
log "Applying contacts master ($CONTACTS_SQL)..."
"${WRANGLER[@]}" d1 execute "$DB" --remote --file="$CONTACTS_SQL" \
  || die "contacts import failed to execute"

verify_contacts_import() {
  local actual
  actual=$(d1_scalar "SELECT COUNT(*) AS n FROM callers")
  log "Post-import: callers=$actual (expected $EXPECTED_CONTACTS)"
  if [[ "$actual" != "$EXPECTED_CONTACTS" ]]; then
    die "contacts master did not land correctly — expected $EXPECTED_CONTACTS rows in callers, found $actual. NOT proceeding further. The callers table is left as-is for inspection; re-run the import manually once you've diagnosed this (wrangler d1 execute $DB --remote --file=$CONTACTS_SQL) rather than re-running this whole script, since the wipe already happened."
  fi
}
verify_contacts_import
log "Contacts master verified in the database."

# ------------------------------------------------------------- poller ----
if $ENABLE_POLLER; then
  log "Enabling drive_poll_enabled..."
  d1 "UPDATE app_settings SET value = '1', updated_at = datetime('now') WHERE key = 'drive_poll_enabled'"
else
  log "Poller left as-is (pass --enable-poller to turn it on automatically)."
fi

log "Done. Reminder: any Drive files already archived from a prior poll run need to be moved back into the Calls folder before re-polling — this script doesn't touch Drive. See docs/UAT_RESET_RUNBOOK.md Step 5."

#!/usr/bin/env bash
#
# Single entry point for provisioning + deploying any environment —
# dev (today's live worker, top-level wrangler.jsonc config, no --env flag),
# uat, prod, or a future tenant slug (see docs/MULTI_TENANCY_PLAN.md).
#
# Usage:
#   pnpm run deploy [env] [options]
#   scripts/deploy.sh [env] [options]
#
# env defaults to "dev" — matches today's existing single-environment deploy
# (docs/DEPLOY_RUNBOOK.md), so `pnpm run deploy` with no argument behaves
# exactly as it always has.
#
# Resource naming convention (see docs/UAT_ENVIRONMENT_PLAN.md /
# docs/MULTI_TENANCY_PLAN.md): for env "X" (X != dev):
#   Worker:   sbm-pipeline-X   (env.X.name in wrangler.jsonc)
#   D1:       sbm-X
#   R2:       sbm-recordings-X, sbm-voice-notes-X
# For env "dev" these are the existing top-level resources (sbm-pipeline,
# sbm-dev, sbm-recordings-dev, sbm-voice-notes-dev) — already provisioned,
# nothing new to create.
#
# Options:
#   --yes            Skip the interactive confirmation before remote
#                     migrations/deploy.
#   --skip-migrate    Don't run d1 migrations apply (schema unchanged).
#   --dry-run          Print every command instead of running the
#                     resource-mutating ones (create/migrate/deploy). Safe
#                     to run any time — read-only checks (list, secret list)
#                     still actually happen, since those can't break anything.
#   --account-subdomain NAME   Cloudflare account subdomain for the
#                     workers.dev URL used in the post-deploy verify curl.
#                     Default: gupta-amal01 (this account's).
#   --contacts-sql PATH   After a successful deploy, apply this
#                     INSERT-OR-IGNORE callers SQL file (from
#                     scripts/import_contacts.py) to the environment's D1
#                     database, then verify the row count actually landed —
#                     fails loudly (non-zero exit) if it didn't.
#   --admin-name NAME      After a successful deploy (and after the
#                     contacts import, if requested), create the first
#                     login for this environment via POST /api/admin/users
#                     — never via raw SQL (PIN hashing needs the real
#                     PIN_PEPPER/PIN_ENCRYPTION_KEY secrets, which only the
#                     deployed Worker has access to; see docs/DEPLOY_RUNBOOK.md).
#                     Prompts interactively for this env's SBM_API_KEY (the
#                     X-SBM-Key admin-bootstrap header) and the new user's
#                     PIN — neither is ever passed as a CLI argument, so
#                     neither ends up in shell history.
#   --admin-role ROLE       staff | admin | superadmin. Default: superadmin
#                     (the expected case for a fresh environment's first
#                     login). Only meaningful with --admin-name.
#   --admin-phone PHONE      Optional, passed through to the same call.
#
# What this does NOT do: write to wrangler.jsonc. If the env block for a new
# environment doesn't exist yet, this script provisions the underlying D1/R2
# resources (idempotent — safe to re-run) and prints the exact JSONC snippet
# to add by hand, then stops. wrangler.jsonc has hand-written explanatory
# comments throughout; auto-editing it risks silently destroying those, so
# that one step stays manual. Re-run this script once the block's in place.

set -eo pipefail
# Deliberately no `-u`: macOS ships bash 3.2, which errors expanding an empty
# array ("${ARR[@]}") even when properly declared — WRANGLER_ENV_ARGS=() for
# the "dev" target hits this constantly. Not worth the workaround noise.

ENV_NAME="dev"
ASSUME_YES=false
SKIP_MIGRATE=false
DRY_RUN=false
ACCOUNT_SUBDOMAIN="gupta-amal01"
CONTACTS_SQL=""
ADMIN_NAME=""
ADMIN_ROLE="superadmin"
ADMIN_PHONE=""

# First positional arg (if it doesn't start with --) is the env name.
if [[ $# -gt 0 && "$1" != --* ]]; then
  ENV_NAME="$1"
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) ASSUME_YES=true; shift ;;
    --skip-migrate) SKIP_MIGRATE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --account-subdomain) ACCOUNT_SUBDOMAIN="$2"; shift 2 ;;
    --contacts-sql) CONTACTS_SQL="$2"; shift 2 ;;
    --admin-name) ADMIN_NAME="$2"; shift 2 ;;
    --admin-role) ADMIN_ROLE="$2"; shift 2 ;;
    --admin-phone) ADMIN_PHONE="$2"; shift 2 ;;
    -h|--help) sed -n '2,60p' "$0"; exit 0 ;;
    *) echo "[deploy] FATAL: unknown argument: $1 (see --help)" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CFG="node $SCRIPT_DIR/lib/wrangler-config.mjs"

log() { echo "[deploy:$ENV_NAME] $*"; }
die() { echo "[deploy:$ENV_NAME] FATAL: $*" >&2; exit 1; }
run() {
  # run <description> -- <command...>  — respects --dry-run for anything that mutates state.
  local desc="$1"; shift
  if $DRY_RUN; then
    log "[dry-run] would run: $*"
  else
    log "$desc"
    "$@"
  fi
}

command -v jq >/dev/null || die "jq is required and not on PATH"
cd "$REPO_ROOT"

if [[ -n "$CONTACTS_SQL" && ! -f "$CONTACTS_SQL" ]]; then
  die "--contacts-sql file not found: $CONTACTS_SQL"
fi
if [[ -n "$ADMIN_NAME" && "$ADMIN_ROLE" != "staff" && "$ADMIN_ROLE" != "admin" && "$ADMIN_ROLE" != "superadmin" ]]; then
  die "--admin-role must be staff, admin, or superadmin (got: $ADMIN_ROLE)"
fi

# ------------------------------------------------------------- naming ----
if [[ "$ENV_NAME" == "dev" ]]; then
  WRANGLER_ENV_ARGS=()
  DB_NAME="sbm-dev"
  R2_RECORDINGS="sbm-recordings-dev"
  R2_VOICE_NOTES="sbm-voice-notes-dev"
else
  WRANGLER_ENV_ARGS=(--env "$ENV_NAME")
  DB_NAME="sbm-$ENV_NAME"
  R2_RECORDINGS="sbm-recordings-$ENV_NAME"
  R2_VOICE_NOTES="sbm-voice-notes-$ENV_NAME"
fi

log "D1: $DB_NAME | R2: $R2_RECORDINGS, $R2_VOICE_NOTES"

# ------------------------------------------------- env block existence ----
if [[ "$ENV_NAME" != "dev" ]] && ! $CFG env-exists "$ENV_NAME" >/dev/null 2>&1; then
  log "wrangler.jsonc has no env.$ENV_NAME block yet — provisioning underlying resources, then stopping for a manual config step."

  DB_ID=""
  if npx wrangler d1 list 2>/dev/null | grep -q "\"name\": \"$DB_NAME\"\|$DB_NAME"; then
    log "D1 database $DB_NAME already exists."
    DB_ID=$(npx wrangler d1 list --json 2>/dev/null | jq -r --arg n "$DB_NAME" '.[] | select(.name==$n) | .uuid' | head -1)
  else
    if $DRY_RUN; then
      log "[dry-run] would run: wrangler d1 create $DB_NAME"
      DB_ID="<filled-in-after-creation>"
    else
      log "Creating D1 database $DB_NAME ..."
      CREATE_OUT=$(npx wrangler d1 create "$DB_NAME")
      echo "$CREATE_OUT"
      DB_ID=$(echo "$CREATE_OUT" | grep -oE '"database_id":\s*"[a-f0-9-]+"' | grep -oE '[a-f0-9-]{36}' | head -1)
      [[ -n "$DB_ID" ]] || die "created $DB_NAME but couldn't parse its database_id from wrangler's output — check above and fill it in by hand"
    fi
  fi

  for bucket in "$R2_RECORDINGS" "$R2_VOICE_NOTES"; do
    if npx wrangler r2 bucket list 2>/dev/null | grep -q "^name:\s*$bucket$\|$bucket"; then
      log "R2 bucket $bucket already exists."
    else
      run "Creating R2 bucket $bucket ..." npx wrangler r2 bucket create "$bucket"
    fi
  done

  cat <<EOF

[deploy:$ENV_NAME] Resources provisioned. Add this block to wrangler.jsonc under "env" (see docs/MULTI_TENANCY_PLAN.md for the full template with vars filled in for a real tenant):

  "$ENV_NAME": {
    "name": "sbm-pipeline-$ENV_NAME",
    "vars": { /* copy from an existing env block or docs/UAT_ENVIRONMENT_PLAN.md, adjust per-env values */ },
    "r2_buckets": [
      { "binding": "RECORDINGS", "bucket_name": "$R2_RECORDINGS" },
      { "binding": "VOICE_NOTES", "bucket_name": "$R2_VOICE_NOTES" }
    ],
    "d1_databases": [
      { "binding": "DB", "database_name": "$DB_NAME", "database_id": "$DB_ID" }
    ]
  }

Then re-run: pnpm run deploy $ENV_NAME
EOF
  exit 0
fi

# ----------------------------------------------------- secrets check ----
REQUIRED_SECRETS=(SBM_API_KEY SARVAM_API_KEY SARVAM_WEBHOOK_TOKEN ANTHROPIC_API_KEY PIN_PEPPER PIN_ENCRYPTION_KEY GOOGLE_DRIVE_CLIENT_EMAIL GOOGLE_DRIVE_PRIVATE_KEY)
SET_SECRETS=$(npx wrangler secret list "${WRANGLER_ENV_ARGS[@]}" 2>/dev/null | jq -r '.[].name' || true)
MISSING=()
for s in "${REQUIRED_SECRETS[@]}"; do
  echo "$SET_SECRETS" | grep -qx "$s" || MISSING+=("$s")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  log "Missing secrets for this environment — not deploying with these unset:"
  for s in "${MISSING[@]}"; do
    echo "    wrangler secret put $s ${WRANGLER_ENV_ARGS[*]}"
  done
  die "set the above secrets, then re-run"
fi
log "All required secrets are set."

# --------------------------------------------------------- confirm ----
log "Target: $([ "$ENV_NAME" = dev ] && echo "top-level (no --env) — sbm-pipeline" || echo "env.$ENV_NAME — sbm-pipeline-$ENV_NAME")"
log "Migrate: $([ "$SKIP_MIGRATE" = true ] && echo skip || echo "wrangler d1 migrations apply $DB_NAME ${WRANGLER_ENV_ARGS[*]:-} --remote")"
log "Dry run: $DRY_RUN"
if ! $ASSUME_YES && ! $DRY_RUN; then
  read -r -p "Deploy to $ENV_NAME now? Type 'yes' to continue: " confirm
  [[ "$confirm" == "yes" ]] || die "aborted by user"
fi

# ------------------------------------------------------- build/deploy ----
log "Typechecking..."
pnpm typecheck

log "Building..."
pnpm build

if ! $SKIP_MIGRATE; then
  run "Applying D1 migrations..." npx wrangler d1 migrations apply "$DB_NAME" "${WRANGLER_ENV_ARGS[@]}" --remote
fi

run "Deploying..." npx wrangler deploy "${WRANGLER_ENV_ARGS[@]}"

# --------------------------------------------------------- verify ----
WORKER_NAME=$($CFG worker-name "$ENV_NAME")
ROUTES=$($CFG routes "$ENV_NAME")
HOST=$(echo "$ROUTES" | jq -r '.[0].pattern // empty')
[[ -n "$HOST" ]] || HOST="$WORKER_NAME.$ACCOUNT_SUBDOMAIN.workers.dev"

if $DRY_RUN; then
  log "[dry-run] skipping post-deploy verification (nothing was actually deployed)."
else
  log "Verifying https://$HOST ..."
  UPLOAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$HOST/upload" || echo "000")
  ROOT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://$HOST/" || echo "000")
  log "GET /upload -> $UPLOAD_CODE (expect 200)"
  log "GET /       -> $ROOT_CODE (expect 200)"
  if [[ "$UPLOAD_CODE" != "200" || "$ROOT_CODE" != "200" ]]; then
    die "post-deploy verification failed — deploy succeeded but the worker isn't answering as expected at https://$HOST"
  fi
  log "Deploy verified OK."
fi

# ------------------------------------------------- contacts import ----
if [[ -n "$CONTACTS_SQL" ]]; then
  EXPECTED_CONTACTS=$(grep -c "^INSERT OR IGNORE INTO callers" "$CONTACTS_SQL" || true)
  [[ "$EXPECTED_CONTACTS" -gt 0 ]] || die "$CONTACTS_SQL has no INSERT statements — wrong file?"

  run "Applying contacts master ($CONTACTS_SQL, $EXPECTED_CONTACTS contacts)..." \
    npx wrangler d1 execute "$DB_NAME" "${WRANGLER_ENV_ARGS[@]}" --remote --file="$CONTACTS_SQL"

  if $DRY_RUN; then
    log "[dry-run] skipping contacts-import verification."
  else
    ACTUAL_CONTACTS=$(npx wrangler d1 execute "$DB_NAME" "${WRANGLER_ENV_ARGS[@]}" --remote --command "SELECT COUNT(*) AS n FROM callers" --json 2>/dev/null | jq -r '.[0].results[0].n')
    log "Post-import: callers=$ACTUAL_CONTACTS (expected $EXPECTED_CONTACTS)"
    if [[ "$ACTUAL_CONTACTS" != "$EXPECTED_CONTACTS" ]]; then
      die "contacts master did not land correctly — expected $EXPECTED_CONTACTS rows in callers, found $ACTUAL_CONTACTS. Not proceeding to admin creation (if requested) until this is fixed."
    fi
    log "Contacts master verified in the database."
  fi
fi

# ------------------------------------------------------ admin login ----
if [[ -n "$ADMIN_NAME" ]]; then
  if $DRY_RUN; then
    log "[dry-run] would create admin login '$ADMIN_NAME' (role: $ADMIN_ROLE) via POST https://$HOST/api/admin/users"
  else
    log "Creating admin login '$ADMIN_NAME' (role: $ADMIN_ROLE) on https://$HOST ..."
    log "This env's SBM_API_KEY is needed for the X-SBM-Key admin-bootstrap header — the one you set with 'wrangler secret put SBM_API_KEY ${WRANGLER_ENV_ARGS[*]}'. Not stored, not echoed, not logged."
    read -r -s -p "SBM_API_KEY for $ENV_NAME: " SBM_KEY_INPUT
    echo
    [[ -n "$SBM_KEY_INPUT" ]] || die "no SBM_API_KEY entered"

    read -r -s -p "New PIN for '$ADMIN_NAME' (4-6 digits): " ADMIN_PIN
    echo
    if [[ ! "$ADMIN_PIN" =~ ^[0-9]{4,6}$ ]]; then
      die "PIN must be 4-6 digits"
    fi

    BODY=$(jq -nc --arg name "$ADMIN_NAME" --arg pin "$ADMIN_PIN" --arg role "$ADMIN_ROLE" --arg phone "$ADMIN_PHONE" \
      '{name: $name, pin: $pin, role: $role} + (if $phone != "" then {phone: $phone} else {} end)')
    unset ADMIN_PIN

    RESP_FILE=$(mktemp)
    HTTP_CODE=$(curl -s -o "$RESP_FILE" -w "%{http_code}" \
      -X POST "https://$HOST/api/admin/users" \
      -H "X-SBM-Key: $SBM_KEY_INPUT" \
      -H "content-type: application/json" \
      -d "$BODY")
    unset SBM_KEY_INPUT BODY

    RESPONSE=$(cat "$RESP_FILE" 2>/dev/null || echo "{}")
    rm -f "$RESP_FILE"

    if [[ "$HTTP_CODE" == "201" ]]; then
      log "Admin login created: $(echo "$RESPONSE" | jq -c '.')"
    elif [[ "$HTTP_CODE" == "409" ]]; then
      log "A user named '$ADMIN_NAME' already exists on this environment — not an error, nothing to do."
    else
      die "admin creation failed — HTTP $HTTP_CODE: $RESPONSE"
    fi
  fi
fi

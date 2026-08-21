#!/usr/bin/env bash
# Start the sbm worker for a given environment.
# Usage: ./start-sbm.sh [local]
#
# "local" is the only environment wired up today — it builds the dashboard
# and runs `wrangler dev` against Miniflare (.dev.vars, local D1/R2). See
# docs/LOCAL_PROFILE.md. staging/production are out of scope for this
# milestone (docs/BUILD_BRIEF.md "Not in this milestone").
set -euo pipefail

ENV="${1:-local}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

case "$ENV" in
  local)
    PORT=8787
    LOG_FILE=".wrangler-dev.local.log"

    if lsof -ti "tcp:$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "sbm (local) already running on :$PORT"
      exit 0
    fi

    if [ ! -f .dev.vars ]; then
      echo "Missing .dev.vars — copy .dev.vars.example to .dev.vars and fill it in first." >&2
      exit 1
    fi

    echo "Building dashboard..."
    npx pnpm --filter web build

    echo "Starting local worker (wrangler dev, local D1/R2 only)..."
    nohup npx pnpm dev > "$LOG_FILE" 2>&1 &
    disown

    for _ in $(seq 1 30); do
      if lsof -ti "tcp:$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "sbm (local) running — http://localhost:$PORT/upload"
        echo "  logs: tail -f $LOG_FILE"
        exit 0
      fi
      sleep 1
    done

    echo "Worker didn't come up on :$PORT within 30s — check $LOG_FILE" >&2
    exit 1
    ;;
  staging|production)
    echo "No '$ENV' environment is configured yet — see docs/BUILD_BRIEF.md (\"Not in this milestone\")." >&2
    exit 1
    ;;
  *)
    echo "Usage: $0 [local]" >&2
    exit 1
    ;;
esac

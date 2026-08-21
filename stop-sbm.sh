#!/usr/bin/env bash
# Stop the sbm worker for a given environment.
# Usage: ./stop-sbm.sh [local]
set -euo pipefail

ENV="${1:-local}"

case "$ENV" in
  local)
    PORT=8787
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

PIDS="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN || true)"

if [ -z "$PIDS" ]; then
  echo "sbm ($ENV) not running — nothing listening on :$PORT"
  exit 0
fi

kill $PIDS
for _ in $(seq 1 10); do
  if ! lsof -ti "tcp:$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "sbm ($ENV) stopped"
    exit 0
  fi
  sleep 1
done

echo "Process(es) on :$PORT didn't exit — sending SIGKILL: $PIDS" >&2
kill -9 $PIDS 2>/dev/null || true
echo "sbm ($ENV) stopped"

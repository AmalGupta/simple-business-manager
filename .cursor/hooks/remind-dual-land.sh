#!/usr/bin/env bash
# After a successful git commit on release/*, remind the agent to dual-land onto develop.
# postToolUse → additional_context only. Fail open.
set -euo pipefail

input=$(cat)
command=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("")
    raise SystemExit(0)
cmd = d.get("command") or ""
if not cmd:
    inp = d.get("input") or d.get("tool_input") or {}
    if isinstance(inp, dict):
        cmd = inp.get("command") or ""
    elif isinstance(inp, str):
        cmd = inp
print(cmd)
' 2>/dev/null || true)

case "$command" in
  *git[[:space:]]commit*|*git[[:space:]]commit) ;;
  *) echo '{}'; exit 0 ;;
esac

branch=$(git branch --show-current 2>/dev/null || true)
case "$branch" in
  release/*) ;;
  *) echo '{}'; exit 0 ;;
esac

tip=$(git rev-parse HEAD 2>/dev/null || true)
if [[ -n "$tip" ]] && git merge-base --is-ancestor "$tip" develop 2>/dev/null; then
  echo '{}'
  exit 0
fi

python3 -c '
import json
msg = (
  "You just committed on '"$branch"'. "
  "If this is a bugfix/hotfix, dual-land it onto develop with "
  "`scripts/dual-land.sh $(git rev-parse --short HEAD)` "
  "(add --push only if the user asked to push). "
  "See skill dual-land-bugfix."
)
print(json.dumps({"additional_context": msg}))
'

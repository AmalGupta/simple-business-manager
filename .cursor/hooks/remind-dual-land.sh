#!/usr/bin/env bash
# After a successful git commit on a Jira-scoped or release/* branch, remind
# the agent to open dual MRs (or dual-land) so release and develop both get the fix.
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
  release/*|bugfix/SBM-*|feature/SBM-*|bugfix/sbm-*|feature/sbm-*) ;;
  *) echo '{}'; exit 0 ;;
esac

python3 -c '
import json
msg = (
  "You just committed on '"$branch"'. "
  "If this change must reach UAT and dev, open dual MRs "
  "(base release/* and base develop) per docs/BRANCHING.md / skill dual-land-bugfix. "
  "Fallback: scripts/dual-land.sh <sha> (add --push only if the user asked). "
  "Do not push develop/release directly unless asked."
)
print(json.dumps({"additional_context": msg}))
'

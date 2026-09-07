#!/usr/bin/env bash
#
# Land commit(s) that are already on a release/* branch onto develop
# (or the reverse). Prefer fast-forward; fall back to cherry-pick.
#
# Usage:
#   scripts/dual-land.sh <commit>... [--from release/0.0.1] [--to develop] [--push]
#   scripts/dual-land.sh --help
#
# Defaults: --from = current branch if it matches release/*, else the
# newest local release/* branch; --to = develop. Does not push unless
# --push is passed.
#
# Requires bash 3.2+ (macOS default OK).
#
set -eo pipefail
# No -u: empty arrays + bash 3.2.

FROM_BRANCH=""
TO_BRANCH="develop"
PUSH=false
COMMITS=()

usage() {
  cat <<'EOF'
Land commit(s) from a release/* branch onto develop (FF or cherry-pick).

  scripts/dual-land.sh <commit>... [--from release/0.0.1] [--to develop] [--push]

Defaults: --from = current release/* (else newest local release/*); --to = develop.
Does not push unless --push is passed.
EOF
  exit 0
}

die() { echo "dual-land: FATAL: $*" >&2; exit 1; }
log() { echo "dual-land: $*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --from)
      [[ $# -ge 2 ]] || die "--from needs a branch name"
      FROM_BRANCH="$2"; shift 2 ;;
    --to)
      [[ $# -ge 2 ]] || die "--to needs a branch name"
      TO_BRANCH="$2"; shift 2 ;;
    --push) PUSH=true; shift ;;
    -*) die "unknown flag: $1 (see --help)" ;;
    *) COMMITS+=("$1"); shift ;;
  esac
done

[[ ${#COMMITS[@]} -gt 0 ]] || die "pass one or more commit SHAs (see --help)"

if [[ -z "$FROM_BRANCH" ]]; then
  CURRENT=$(git branch --show-current)
  case "$CURRENT" in
    release/*) FROM_BRANCH="$CURRENT" ;;
    *)
      FROM_BRANCH=$(git for-each-ref --sort=-committerdate --format='%(refname:short)' refs/heads/release 2>/dev/null | head -1)
      ;;
  esac
fi
[[ -n "$FROM_BRANCH" ]] || die "no release/* branch found — pass --from"

git rev-parse --verify "$FROM_BRANCH" >/dev/null 2>&1 || die "unknown branch: $FROM_BRANCH"
git rev-parse --verify "$TO_BRANCH" >/dev/null 2>&1 || die "unknown branch: $TO_BRANCH"

# Resolve to full SHAs; verify each is on FROM_BRANCH.
RESOLVED=()
for c in "${COMMITS[@]}"; do
  full=$(git rev-parse --verify "$c^{commit}") || die "not a commit: $c"
  if ! git merge-base --is-ancestor "$full" "$FROM_BRANCH"; then
    die "$c is not on $FROM_BRANCH"
  fi
  RESOLVED+=("$full")
done

# Oldest-first among the requested commits only.
ORDERED=()
while IFS= read -r c; do
  for want in "${RESOLVED[@]}"; do
    if [[ "$c" == "$want" ]]; then
      ORDERED+=("$c")
      break
    fi
  done
done < <(git rev-list --reverse "${RESOLVED[@]}")

[[ ${#ORDERED[@]} -gt 0 ]] || die "no commits to land"

START=$(git rev-parse --abbrev-ref HEAD)
cleanup() { git checkout -q "$START" 2>/dev/null || true; }
trap cleanup EXIT

log "from=$FROM_BRANCH  to=$TO_BRANCH  commits=${#ORDERED[@]}"

git checkout "$TO_BRANCH"
git pull --ff-only "origin" "$TO_BRANCH" 2>/dev/null || true

NEWEST="${ORDERED[$((${#ORDERED[@]} - 1))]}"

if git merge-base --is-ancestor "$TO_BRANCH" "$FROM_BRANCH" \
  && git merge-base --is-ancestor "$TO_BRANCH" "$NEWEST"; then
  log "fast-forward $TO_BRANCH → $(git log -1 --oneline "$NEWEST")"
  git merge --ff-only "$NEWEST"
else
  log "cherry-picking onto $TO_BRANCH (oldest → newest)"
  for c in "${ORDERED[@]}"; do
    if git merge-base --is-ancestor "$c" "$TO_BRANCH"; then
      log "already on $TO_BRANCH: $(git log -1 --oneline "$c") — skip"
      continue
    fi
    git cherry-pick "$c" || die "cherry-pick failed for $c — resolve, then re-run"
  done
fi

log "done: $(git log -1 --oneline)"
if $PUSH; then
  log "pushing origin/$TO_BRANCH"
  git push origin "$TO_BRANCH"
else
  log "not pushed (pass --push to publish). Local $TO_BRANCH is ready."
fi

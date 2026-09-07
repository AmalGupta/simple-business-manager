---
name: dual-land-bugfix
description: >-
  Dual-land bugfix/hotfix commits onto both the active release/* branch and
  develop (fast-forward when linear, else cherry-pick). Use when the user asks
  to land a fix on release and develop, dual-land commits, backport a hotfix,
  or after committing a bugfix on release/* that must also reach develop.
---

# Dual-land bugfix (release ↔ develop)

During M0 UAT / release maintenance, bugfixes must land on **both**:

1. the active `release/*` branch (today: `release/0.0.1`)
2. `develop`

Do not leave fixes only on one side.

## Default workflow

1. **Implement and commit on `release/<ver>`** (checkout that branch first).
2. **Dual-land onto `develop`** with the helper (preferred) or the manual steps below.
3. **Push only when the user asks** — never push `develop` / `release/*` unprompted.
4. Stay on / return to the branch the user was working on.

### Helper (preferred)

```bash
# After commits exist on release/* — does not push unless --push
scripts/dual-land.sh <sha> [<sha>...] [--from release/0.0.1] [--to develop] [--push]
```

- `--from` defaults to current branch if it is `release/*`, else newest local `release/*`.
- `--to` defaults to `develop`.
- Prefer FF; cherry-picks oldest→newest if histories diverged.
- Skips commits already on the target.

### Manual equivalent

```bash
git checkout develop
git pull --ff-only origin develop   # if tracking exists
# If develop is a direct ancestor of the newest SHA (linear):
git merge --ff-only <newest-sha>
# Else:
git cherry-pick <oldest-sha> <newer-sha> ...
# Push only if asked:
git push origin develop
```

## Which branch is "active release"?

- If `git branch --show-current` matches `release/*`, that is the source.
- Else use the newest local `release/*` (`git for-each-ref --sort=-committerdate refs/heads/release`), or ask if more than one is ambiguous.

## Rules

- Never rewrite published history (`push --force`, `commit --amend` of pushed commits) unless the user explicitly requests it.
- Never dual-land unrelated feature work — only the SHAs the user named (or the bugfix commits just created).
- If cherry-pick conflicts: stop, show the conflict, do not invent a merge resolution beyond what the user asked.
- Tag / UAT deploy anchors (`m0-uat-v*`) stay put; dual-land does not create tags.

## Cursor vs Claude Code

Same skill lives in:

- `.cursor/skills/dual-land-bugfix/SKILL.md` (Cursor)
- `.claude/skills/dual-land-bugfix/SKILL.md` (Claude Code — also `/dual-land-bugfix`)

Keep the two files identical when editing.

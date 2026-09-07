---
name: dual-land-bugfix
description: >-
  Land the same Jira-scoped change on both release/* (UAT) and develop (dev)
  via dual MRs (preferred) or scripts/dual-land.sh cherry-pick/FF (fallback).
  Use when starting a bugfix/feature, opening PRs to release and develop,
  dual-landing commits, backporting a hotfix, or after the user asks to dual-land.
---

# Dual-land (release ↔ develop) — MR-first

Canonical process: **`docs/BRANCHING.md`**.

While a `release/*` branch is active (today: `release/0.0.1`):

| Line | After merge CI deploys |
|------|-------------------------|
| `release/<ver>` | **UAT** — `pnpm run deploy uat` → `sbm-pipeline-uat` |
| `develop` | **dev** — `pnpm run deploy` → `sbm-pipeline` |

Bugfixes/hotfixes that belong on UAT **and** must keep `develop` current require **both** lines.

## Preferred workflow (dual MRs)

1. **Branch from the right base with a Jira id**
   - UAT-bound fix: `bugfix/SBM-123-slug` from `origin/release/0.0.1`
   - Dev-only / not for this UAT train: `feature/SBM-123-slug` from `origin/develop`
2. Implement and commit on that branch (never commit directly on `develop` / `release/*`).
3. **Open two PRs** when the change must hit UAT and dev:
   - PR → `release/0.0.1` (UAT)
   - PR → `develop` (dev) — usually a second head branch with the same commits cherry-picked onto `develop`
4. Return both PR URLs. Push the feature heads; do **not** push `develop` / `release/*` unless the user asks.
5. Deploy happens via CI on merge (migrations still manual / `--skip-migrate` in CI). Manual deploy only if the user asks: `pnpm run deploy uat --yes` from release tip, `pnpm run deploy --yes` from develop tip.

### Example commands

```bash
git fetch origin
git checkout -b bugfix/SBM-123-short-slug origin/release/0.0.1
# … commits …
git push -u origin HEAD
gh pr create --base release/0.0.1 --head bugfix/SBM-123-short-slug --title "SBM-123: …" --body "…"

git checkout -b bugfix/SBM-123-short-slug-develop origin/develop
git cherry-pick <oldest>^..<newest>   # adjust range to the ticket commits
git push -u origin HEAD
gh pr create --base develop --head bugfix/SBM-123-short-slug-develop --title "SBM-123: … (develop)" --body "Pairs with release PR #N"
```

## Fallback: `scripts/dual-land.sh`

Use only when the user asks to dual-land **commits** (already on one long-lived branch) without going through a second MR, or to finish a one-sided merge:

```bash
scripts/dual-land.sh <sha> [<sha>...] [--from release/0.0.1] [--to develop] [--push]
```

- Prefer FF; else cherry-pick oldest→newest. Skips commits already on the target.
- `--push` only if the user asked to push.
- Never dual-land unrelated commits.

## Rules

- Branch names: `feature/SBM-<n>-…` or `bugfix/SBM-<n>-…` (Jira id required).
- Never rewrite published history unless the user explicitly requests it.
- Do not invent merge conflict resolutions beyond what the user asked.
- Keep this file identical at:
  - `.cursor/skills/dual-land-bugfix/SKILL.md`
  - `.claude/skills/dual-land-bugfix/SKILL.md`

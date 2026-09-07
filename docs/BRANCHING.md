# Branching, dual MRs, and deploy targets

How work moves from a Jira ticket into **dev** (`sbm-pipeline`) and **UAT** (`sbm-pipeline-uat`) while `release/*` is active.

## Environments

| Git branch | Deploy command | Worker |
|---|---|---|
| `develop` | `pnpm run deploy` (CI on push) | `sbm-pipeline` — **dev** |
| `release/<ver>` (today: `release/0.0.1`) | `pnpm run deploy uat` (CI on push) | `sbm-pipeline-uat` — **UAT** |

Remote D1 migrations stay **manual** (confirm with a human). CI deploys with `--skip-migrate`.

## Branch naming (required)

Every change maps to **one** working branch that includes the Jira key:

```text
feature/SBM-123-short-slug
bugfix/SBM-123-short-slug
```

- Use the real Jira id (`SBM-123`), not lowercase `sbm-3`.
- One ticket → one branch (split tickets if the work diverges).
- Do not commit directly on `develop` or `release/*`.

## Dual MRs (required while `release/*` exists)

The same ticket must land on **both** long-lived lines via **two pull requests**:

1. **MR → `release/<ver>`** — ships to UAT after merge (CI).
2. **MR → `develop`** — ships to dev after merge (CI).

### Preferred sequence (UAT-bound bugfix / hotfix)

```bash
git fetch origin
git checkout -b bugfix/SBM-123-short-slug origin/release/0.0.1
# … implement, commit …
git push -u origin HEAD

# 1) MR into release (UAT)
gh pr create --base release/0.0.1 --head bugfix/SBM-123-short-slug \
  --title "SBM-123: …" --body "## Summary\n- …\n\n## Test plan\n- [ ] …"

# 2) Second branch for develop (same commits)
git checkout -b bugfix/SBM-123-short-slug-develop origin/develop
git cherry-pick <sha-on-feature-branch>...   # or rebase onto develop if clean
git push -u origin HEAD
gh pr create --base develop --head bugfix/SBM-123-short-slug-develop \
  --title "SBM-123: … (develop)" --body "Pair of release MR #<n>."
```

If histories allow a single tip to open against both bases without rewriting, still create **two** PRs (GitHub requires one base per PR).

### Features that must not hit UAT yet

Branch from `develop`, open **MR → develop** only. When the release train should take them, open a follow-up MR into `release/*` (cherry-pick or merge) — still ticket-scoped.

## Dual-land helper (fallback)

`scripts/dual-land.sh` cherry-picks/FF commits between `release/*` and `develop` when the user explicitly wants that instead of (or after) MRs — e.g. emergency hotfix already merged on one side. Prefer **dual MRs** for normal work. See skill `dual-land-bugfix`.

## Agent rules of thumb

- Name the branch with `SBM-<id>` before coding.
- Raise **both** MRs when the change belongs on UAT and dev; return the PR URLs.
- Do not push `develop` / `release/*` directly unless the user asks for that exception.
- Deploy mapping is fixed: **develop → dev**, **release → UAT**. Do not deploy UAT from `develop` or dev from `release/*` unless the user overrides.

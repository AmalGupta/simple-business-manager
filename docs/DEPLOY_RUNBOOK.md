# Deploy runbook

For any agent (or human) shipping a change to this repo. Follow it in order. It exists because the same mistakes got made twice in one session before this was written down — see "Known failure modes" for the receipts.

## The one fact that changes everything else

**There is no staging or dev environment separate from production.** One Worker (`sbm-pipeline`), one D1 database (`sbm-dev` — the name is historical, not descriptive), one R2 bucket. `wrangler deploy` with no `--env` flag ships straight to the live worker at `https://sbm-pipeline.gupta-amal01.workers.dev`, and `wrangler d1 migrations apply sbm-dev --remote` touches the one real database. "Deploy to dev" and "deploy to prod" are the same command against the same target. Treat every remote step below as user-facing and irreversible-ish, because it is.

Local D1 (`--local`, under `.wrangler/state/`) is a completely separate SQLite file, seeded independently. Nothing you do there touches remote data, and nothing you do remotely is visible locally.

**`pnpm run deploy [env]` (`scripts/deploy.sh`) is now the entry point** for everything below — `pnpm run deploy` with no argument does exactly what this doc describes (typecheck, build, migrate --remote with a confirmation prompt, deploy, verify), against today's one real environment. It also knows how to provision and deploy additional environments (`pnpm run deploy uat`, `pnpm run deploy prod`, or a future tenant slug — see `docs/UAT_ENVIRONMENT_PLAN.md` and `docs/MULTI_TENANCY_PLAN.md`) once those are actually set up; today only "dev" exists, so the fact above still holds. `pnpm run deploy:raw` is the old one-line `pnpm build && wrangler deploy` if you specifically want to skip the safety checks. Read `scripts/deploy.sh --help` for the full option list (`--yes`, `--skip-migrate`, `--dry-run`).

## Before touching anything

1. `git status` — confirm you know what's already uncommitted and whether it's yours.
2. If the change is nontrivial, tag the current tip first: `git tag -a pre-<short-description> -m "..."` and `git push origin <tag>` — a cheap rollback anchor. (Example from this repo: `pre-workflow-management`.)
3. Cut a branch for the work: `git checkout -b feature/<name>`. Don't build directly on `develop`.

## Local verification loop

```bash
pnpm typecheck
pnpm build          # builds web/ to dist/; wrangler serves dist/ as static assets either way
```

If the change touches schema:

- Add/extend `packages/core/src/schema.sql` (the mirror/reference copy) **and** a new numbered file in `migrations/`. Never edit a migration that's already been applied anywhere (local counts as "applied" for this rule too, once you've moved past it) — if a shipped migration got something wrong, write the next-numbered migration to correct it, the same way `0014_disambiguate_stage_labels.sql` corrected `0013`.
- Apply it locally: `wrangler d1 migrations apply sbm-dev --local`.

To actually click through the app locally: `wrangler dev --local` (or `pnpm dev`), then open `http://localhost:8787`.

### The `SQLITE_BUSY` trap

**Never run a `wrangler d1 execute` or `wrangler d1 migrations apply` command (with or without `--local`) while `wrangler dev --local` is running.** Both processes lock the same local SQLite file, and the dev server dies with `Fatal uncaught kj::Exception ... database is locked: SQLITE_BUSY`. Sequence instead:

```bash
pkill -f "wrangler dev"          # stop it
wrangler d1 migrations apply sbm-dev --local   # or execute
# ... run whatever d1 command you needed ...
wrangler dev --local &            # restart
```

If the dev server does crash this way, the local D1 file itself is fine (it's file-backed, not in-memory) — just restart `wrangler dev`. Session cookies survive the restart since they live in that same D1 file.

### Don't blindly kill "the" dev server

Before `pkill -f "wrangler dev"`, run `ps aux | grep wrangler` first. If a dev server is already up and answering on the expected port, **reuse it** rather than starting a second one — two `wrangler dev` instances against the same local D1 file is exactly the SQLITE_BUSY trap above, and a long-running dev server may be someone's actual working session, not a stray process. Only kill it if you have a specific reason (it crashed, or you need to restart it around a migration per above) and say so.

### Cache-busting while verifying UI changes in a browser

After `pnpm build`, the output JS/CSS filenames change (content-hashed). A browser tab left open from before the rebuild can serve a stale cached bundle on a plain reload (F5) even though `dist/index.html` on disk already points at the new hash — check the actual network requests if something you just fixed doesn't seem to have changed; navigate with a cache-busting query param (`?_cb=<anything>`) or a real hard reload if so.

## The deploy sequence

Once local verification passes and (if applicable) the PR is up:

```bash
pnpm typecheck
pnpm build
```

**If the schema changed**, apply the migration to the live database first, so the worker never boots against a schema it doesn't have yet — and confirm with the user before running this specifically, every time, regardless of what else has been approved in the conversation:

```bash
wrangler d1 migrations apply sbm-dev --remote
```

Then deploy:

```bash
pnpm run deploy
```

**Not `pnpm deploy`.** `pnpm` has its own built-in `deploy` subcommand (for publishing a package to a directory) that shadows the `"deploy"` script in `package.json` and fails with `ERR_PNPM_NOTHING_TO_DEPLOY`. Always `pnpm run deploy` (equivalently `npx pnpm run deploy` if `pnpm` isn't on PATH).

`pnpm run deploy` itself runs `pnpm build && wrangler deploy` — see `package.json`.

## Verify after deploying

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://sbm-pipeline.gupta-amal01.workers.dev/upload   # expect 200, no auth needed
curl -s -o /dev/null -w "%{http_code}\n" https://sbm-pipeline.gupta-amal01.workers.dev/          # expect 200
curl -s -o /dev/null -w "%{http_code}\n" https://sbm-pipeline.gupta-amal01.workers.dev/api/sites # expect 401, NOT 500 — proves routing/auth didn't break
```

Deeper checks (anything needing `X-SBM-Key`) need the **remote** `SBM_API_KEY` value. Never assume `.dev.vars`' copy matches it — a prior `PIN_PEPPER` mismatch was confirmed even though `SBM_API_KEY` happened to match that one time. If you need to make an authenticated call against the deployed worker and don't already have the real value from this session, ask the user for it rather than guessing or reusing the local one.

## If something goes wrong after deploying

- **Code regression:** redeploy the previous commit (`git checkout <previous-sha> -- .` is messy; prefer `git revert` on develop, or check out the pre-change tag and run the deploy sequence again from there).
- **Bad migration:** there is no automatic down-migration here. Fix forward with a new numbered migration, same as `0014` fixed `0013` — never edit or delete an applied one.
- **Not sure what's live:** `wrangler deployments list` shows recent versions; the deploy output also prints a `Current Version ID` — worth pasting into the PR or commit message for anything you're not 100% sure about.

## Known failure modes (why each rule above exists)

- Ran `pnpm deploy` instead of `pnpm run deploy` → `ERR_PNPM_NOTHING_TO_DEPLOY`, no worker touched, easy to mistake for "deploy did nothing."
- Ran a `wrangler d1` CLI command against local D1 while `wrangler dev --local` was already serving requests on the same file → crashed the dev server outright, twice, mid-session.
- Killed what turned out to be a `wrangler dev` process that had been running since a previous session, while cleaning up an unrelated port conflict, without checking first what was using the port.
- Verified a bug fix in the browser, saw no change, and almost concluded the fix didn't work — the browser had served a cached pre-rebuild JS bundle on a plain reload.

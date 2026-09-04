# UAT environment — plan only

Nothing in this doc has been created or run. Supersedes the wipe-based
approach in `docs/UAT_RESET_RUNBOOK.md`/`scripts/uat_reset.sh` for the
2-month historical backfill — a genuinely separate environment means UAT
starts from an empty database, so there's nothing to wipe. Those two files
stay as-is for reference (and the contacts-import half of the script is
still directly reusable — see "What changes" below), but the destructive
DELETE path in `uat_reset.sh` doesn't need to run for this plan.

## Decisions already made (confirmed with you)

1. **Reuse the existing Drive "Calls" folder** — UAT does not get its own
   Drive folder tree. Same `GOOGLE_DRIVE_CALLS_FOLDER_ID`/`ARCHIVE`/`SPAM`
   folder IDs as the current `sbm-dev` config.
2. **Same codebase, new `env.uat` block** in the existing `wrangler.jsonc` —
   not a separate project. `wrangler deploy --env uat` deploys the identical
   code to its own Worker/D1/R2 resources.
3. Separate `ANTHROPIC_API_KEY` and `SARVAM_API_KEY` — you already have UAT
   keys for both; only these two secrets differ in value from the current
   environment's (everything else — Drive service account, PIN secrets — can
   be freshly generated or reused, your call, see the secrets table below).

## ⚠️ The critical risk from decision #1: two pollers, one folder

Both environments would be capable of watching the exact same Drive Calls
folder. The poller **physically moves** a file out of Calls into Archive (or
Spam) the moment it finishes ingesting it (`moveDriveFile` in
`src/lib/drive-calls-poller.ts`) — dedup is per-database (`drive_file_id`),
but the folder listing itself is shared. If `sbm-dev`'s poller and the new
`sbm-uat` poller were ever both enabled at the same time, they'd race for the
same files: whichever poller's cron tick (or manual trigger) hits first wins
that file, archives it, and the other environment's poller will simply never
see it again. The 2-month batch would end up split unpredictably across two
databases with no record of which call landed where.

**Mitigation — process, not code:** exactly one of `app_settings.drive_poll_enabled`
(in `sbm-dev`) or its `sbm-uat` counterpart may be `'1'` at any given time.
Checked as of this plan: `sbm-dev`'s is currently `'0'` (off) — good, leave it
that way for the entire UAT ingestion window. Turn it back on only once UAT
polling is fully done and you're not planning to re-run it. There's no
technical lock enforcing this — it's a "don't do both at once" discipline
call, worth writing on a sticky note more than encoding in a script.

## Resource plan

| Resource | Current (`sbm-dev`) | New (`uat`) |
|---|---|---|
| Worker script name | `sbm-pipeline` | `sbm-pipeline-uat` |
| `*.workers.dev` URL | `sbm-pipeline.gupta-amal01.workers.dev` | `sbm-pipeline-uat.gupta-amal01.workers.dev` |
| D1 database | `sbm-dev` | `sbm-uat` (new, empty — full migration history applied fresh) |
| R2 — voice notes | `sbm-voice-notes-dev` (not yet created either, see `docs/VOICE_NOTE_BUCKET_PLAN.md`) | `sbm-voice-notes-uat` |
| R2 — site media | `sbm-recordings-dev` | `sbm-recordings-uat` |
| Drive Calls/Archive/Spam folders | shared — same IDs both environments (decision #1) | same |
| `ANTHROPIC_API_KEY` | existing key | your UAT key |
| `SARVAM_API_KEY` | existing key | your UAT key |
| Everything else (PIN secrets, `SBM_API_KEY`, `SARVAM_WEBHOOK_TOKEN`, Drive service account) | existing | new random values recommended (cheap to generate, keeps the environments crypto-independent) except the Drive service account, which must be the *same* one, since access is scoped to the shared Calls folder in decision #1 |

## `wrangler.jsonc` change (draft, not applied)

Add an `env.uat` block. Wrangler inherits unspecified top-level keys
(`main`, `compatibility_date`, `assets`, `triggers.crons`) into named
environments automatically — only the things that differ need restating:

```jsonc
"env": {
  "uat": {
    "name": "sbm-pipeline-uat",
    "vars": {
      "ENVIRONMENT": "uat",
      "SARVAM_STT_MODE": "codemix",
      "SARVAM_LANGUAGE_CODE": "unknown",
      "ANTHROPIC_MODEL": "claude-sonnet-5",
      "ANTHROPIC_HAIKU_MODEL": "claude-haiku-4-5-20251001",
      "GOOGLE_DRIVE_CALLS_FOLDER_ID": "1BVvqN0a_e8mb4S50yMb9X-XwKEfxO5RR",
      "GOOGLE_DRIVE_ARCHIVE_FOLDER_ID": "12v7xURXHMtL20fjOVLEzmMmXdmcCYhXg",
      "GOOGLE_DRIVE_SPAM_FOLDER_ID": "130Xhaxx3Z0G5FgjxFOBIQ5e5FBaoute8",
      "PUBLIC_BASE_URL": "https://sbm-pipeline-uat.gupta-amal01.workers.dev"
    },
    "r2_buckets": [
      { "binding": "RECORDINGS", "bucket_name": "sbm-recordings-uat" },
      { "binding": "VOICE_NOTES", "bucket_name": "sbm-voice-notes-uat" }
    ],
    "d1_databases": [
      { "binding": "DB", "database_name": "sbm-uat", "database_id": "<filled in after `wrangler d1 create sbm-uat`>" }
    ]
  }
}
```

Two things worth flagging about this block:
- `ENVIRONMENT: "uat"` is a new value — `src/index.ts`/handlers only branch on
  `env.ENVIRONMENT !== "production"` in one place (the digest-email guard,
  which is unbuilt/unused anyway per `docs/BUILD_BRIEF.md`), so this is safe,
  but worth knowing it's a new string nothing else currently checks for.
- `assets` (the `./dist` binding + `run_worker_first`) inherits from the top
  level, which is correct — both environments build from the same `web/`
  source and serve the same dashboard code, just against different data.

## Provisioning sequence

**`pnpm run deploy uat` (`scripts/deploy.sh`) now does steps 1–2 and 4–7 below
automatically** — it checks whether `env.uat` exists in `wrangler.jsonc`, and
if not, creates the D1 database and both R2 buckets (idempotently — safe to
re-run) and prints the exact block to paste into step 3. It won't write to
`wrangler.jsonc` itself (that file has hand-written comments throughout;
auto-editing it risked destroying them). Once the block's pasted in, secrets
are set (step 5), and you re-run `pnpm run deploy uat`, it typechecks,
builds, migrates, deploys, and verifies — refusing to deploy if any required
secret is still unset. `--dry-run` shows exactly what it would do without
touching anything. The manual command sequence below is what the script runs
under the hood, kept here for reference / for running a step by hand if you
want more control over one piece of it:

```bash
# 1. Create the D1 database, grab its UUID for the wrangler.jsonc block above
npx wrangler d1 create sbm-uat

# 2. Create the two R2 buckets
npx wrangler r2 bucket create sbm-recordings-uat
npx wrangler r2 bucket create sbm-voice-notes-uat

# 3. Add the env.uat block to wrangler.jsonc (draft above), with the real database_id from step 1

# 4. Apply the full migration history fresh
npx wrangler d1 migrations apply sbm-uat --env uat --remote

# 5. Set secrets — run these yourself, not through me (never paste key
#    values into chat). Repeat for each:
npx wrangler secret put ANTHROPIC_API_KEY --env uat     # your UAT Anthropic key
npx wrangler secret put SARVAM_API_KEY --env uat        # your UAT Sarvam key
npx wrangler secret put SARVAM_WEBHOOK_TOKEN --env uat  # openssl rand -hex 32
npx wrangler secret put SBM_API_KEY --env uat           # openssl rand -hex 32
npx wrangler secret put PIN_PEPPER --env uat             # openssl rand -hex 32
npx wrangler secret put PIN_ENCRYPTION_KEY --env uat     # python3 -c "import secrets,base64;print(base64.b64encode(secrets.token_bytes(32)).decode())"
npx wrangler secret put GOOGLE_DRIVE_CLIENT_EMAIL --env uat   # SAME service account as sbm-dev (shared folder access)
npx wrangler secret put GOOGLE_DRIVE_PRIVATE_KEY --env uat    # SAME service account

# 6. Build and deploy
pnpm build
npx wrangler deploy --env uat

# 7. Verify
curl -s -o /dev/null -w "%{http_code}\n" https://sbm-pipeline-uat.gupta-amal01.workers.dev/upload   # expect 200
curl -s -o /dev/null -w "%{http_code}\n" https://sbm-pipeline-uat.gupta-amal01.workers.dev/api/sites # expect 401 (auth wired, not 500)
```

## What changes about the earlier UAT-reset plan

- **No wipe needed.** `sbm-uat`'s `calls`/`callers`/`todos`/etc. all start
  empty from the fresh migration apply in step 4 above — there's nothing to
  delete. `scripts/uat_reset.sh`'s DELETE sequence and
  `docs/UAT_RESET_RUNBOOK.md` Steps 2/4 don't apply to this path.
- **Contacts import still applies, and gets simpler.** `callers` is already
  empty, so the `INSERT OR IGNORE` master SQL just runs once, no wipe
  prerequisite:
  ```bash
  npx wrangler d1 execute sbm-uat --env uat --remote --file=/Users/amalgupta/Downloads/contacts_master.sql
  ```
- **Backup (Step 0 of the old runbook) is no longer critical** — there's
  nothing precious in a brand-new database to lose. Still worth a
  `wrangler d1 export sbm-uat --env uat --remote` once real UAT data has
  accumulated, same as any other environment.
- **`docs/VOICE_NOTE_BUCKET_PLAN.md`'s code is already merged** (the
  `VOICE_NOTES` binding, the naming helper, all 11 call sites) — deploying to
  `env.uat` in step 6 above uses it automatically, with correctly-named keys
  from the very first ingested call. No separate step needed for that plan
  anymore; it was written for the old shared-environment reset, and this
  new-environment approach absorbs it for free.
- **Enable the poller last, deliberately, and only after confirming `sbm-dev`'s
  is off** — see the shared-folder risk above. Once ready:
  ```bash
  npx wrangler d1 execute sbm-uat --env uat --remote --command \
    "UPDATE app_settings SET value = '1', updated_at = datetime('now') WHERE key = 'drive_poll_enabled'"
  ```
  (`app_settings` is per-database, so this only affects `sbm-uat` — but
  double-check `sbm-dev`'s value is still `'0'` right before doing this,
  since time will have passed since it was last checked.)

## Open items for you to confirm before this gets built

- **Custom domain / routes**: the current `wrangler.jsonc` has a commented-out
  `routes` block for `sbm-pipeline.jainglass.dev` (disabled — zone not yet
  added to the account). Does UAT need its own subdomain at all, or is the
  `*.workers.dev` URL enough for this phase? Assumed workers.dev-only above.
- **CI/CD**: `docs/SCAFFOLDING.md` §8's GitHub Actions template only knows
  `staging`/`production` as deploy targets. Provisioning `env.uat` manually
  (as planned above) doesn't require touching that workflow — flagging only
  so it's a conscious choice to leave CI out of this, not an oversight.
- **How long UAT resources live**: once UAT is done, do these get torn down
  (`wrangler d1 delete sbm-uat`, `wrangler r2 bucket delete ...`) or kept
  around as a permanent staging environment going forward? No action needed
  now, just worth deciding before this multiplies into a third environment
  nobody remembers the purpose of.

# Multi-tenancy — plan only (environment-per-tenant)

Nothing in this doc has been built. **Revised**: onboarding a new client
gets its own full Cloudflare environment — own Worker, own D1 database, own
R2 buckets, own logs. No shared database, no `tenant_id` column, no
query-layer changes at all. This is the exact pattern already built out in
`docs/UAT_ENVIRONMENT_PLAN.md` for UAT, generalized into the standard
onboarding playbook for every future tenant. First tenant: **Relai World**.

*(This replaces the earlier row-level, shared-database version of this plan
— that approach traded a large, ongoing cross-cutting refactor of all 109
functions in `queries.ts` for the ability to run many tenants off one
deployment. You've since decided physical isolation matters more than that
efficiency, which is the right call for a small number of clients where a
data leak between them would be a business-ending mistake, not just a bug.)*

## What "single environment per tenant" actually buys you

Because every tenant is a completely separate Worker script bound to its own
D1 database and its own two R2 buckets, isolation isn't something the
application code has to get right — there is no shared resource for a bug to
leak across. Concretely, this resolves the two hardest open questions from
the row-level version of this plan for free:

- **Logs are already tenant-scoped, with zero extra work.** Cloudflare's
  observability (the Logs tab, `wrangler tail`, Logpush if that's ever
  turned on) is inherently per-Worker-script. Once Relai World is
  `sbm-pipeline-relai-world` and the current business is `sbm-pipeline`,
  there is no view, filter, or query that could accidentally show one
  tenant's logs while looking at the other's — they're different Cloudflare
  resources, not rows in a shared log stream.
- **`queries.ts` needs no changes.** Every one of its 109 functions already
  runs against `env.DB`, which is a different physical D1 database per
  tenant. The entire "rewrite every query to filter by tenant_id, and never
  let a new one forget to" problem from the row-level plan doesn't exist
  here — the isolation is structural, not a coding discipline.
- **No `users.name` collision problem.** Two tenants can both have a staff
  member named "Priya" with no conflict, since they're rows in two entirely
  separate `users` tables. No schema change needed for this.
- **No tenant-resolution-per-request problem.** Row-level tenancy needed
  something (subdomain, path, session) to resolve which tenant a request
  belonged to before touching the DB. Here, the Worker itself *is* the
  tenant boundary — a request to `sbm-pipeline-relai-world.<account>.workers.dev`
  can only ever see Relai World's data, because that's the only database
  it's bound to.

## What it costs instead

- **Every code change ships once per tenant.** A bug fix, a new feature, a
  schema migration — all of it has to be deployed to every tenant's `env`
  block, not once. At a handful of clients this is a loop over
  `wrangler deploy --env <slug>` / `wrangler d1 migrations apply <db> --env
  <slug> --remote`; past a dozen or so it starts wanting a script (see
  "Rollout tooling" below) rather than doing it by hand each time.
- **`wrangler.jsonc` grows one `env` block per tenant**, each duplicating the
  `vars`/`r2_buckets`/`d1_databases` shape already established for `env.uat`.
  Mechanical, but a large file eventually.
- **No built-in cross-tenant reporting.** "How many calls did I process
  across all my clients this month" means querying N separate databases and
  summing in application code (or by hand) — there's no single table that
  already has the answer. Not a blocker for now; worth knowing it's the
  tradeoff you're accepting.
- **A tenant is also a full teardown cost.** Offboarding a client is clean
  (delete their D1, their two buckets, their Worker) but is real
  Cloudflare-console work each time, not a single `DELETE FROM tenants`.

## The tenant registry — bookkeeping, not a data-isolation mechanism

You still want "a tenant table" to know what exists. Under this model that
table **must not be something any tenant's deployed Worker reads from at
request time** — the moment a live Worker queries a shared registry to
decide how to behave, that registry becomes a shared resource again, and the
whole point of this plan (no shared state between tenants, ever) is
undermined by the one thing meant to track them.

Recommend: a **plain registry file checked into this repo**, not a database
any Worker touches — `docs/TENANTS.md` or `tenants.json`, hand-maintained (or
maintained by a small local script you run yourself, never deployed):

```json
[
  {
    "slug": "relai-world",
    "name": "Relai World",
    "worker_name": "sbm-pipeline-relai-world",
    "d1_database": "sbm-relai-world",
    "r2_recordings": "sbm-recordings-relai-world",
    "r2_voice_notes": "sbm-voice-notes-relai-world",
    "drive_calls_folder_id": "<filled in during onboarding>",
    "status": "active",
    "onboarded_at": "2026-09-04"
  }
]
```

If you later want this queryable (a small internal dashboard listing all
your tenants) rather than a flat file, that's a separate, genuinely internal
tool with its own tiny D1 database — not bound into any tenant Worker, only
ever touched by you. Flag it as a nice-to-have, not part of this plan's
critical path.

## Per-tenant resource plan

Same shape as `docs/UAT_ENVIRONMENT_PLAN.md`'s `env.uat` block, templated per
tenant slug:

| Resource | Pattern | Relai World example |
|---|---|---|
| Worker script name | `sbm-pipeline-<slug>` | `sbm-pipeline-relai-world` |
| `*.workers.dev` URL | `<worker-name>.<account>.workers.dev` | `sbm-pipeline-relai-world.gupta-amal01.workers.dev` |
| D1 database | `sbm-<slug>` | `sbm-relai-world` |
| R2 — voice notes | `sbm-voice-notes-<slug>` | `sbm-voice-notes-relai-world` |
| R2 — site media | `sbm-recordings-<slug>` | `sbm-recordings-relai-world` |
| Drive Calls/Archive/Spam folders | **their own**, not shared | Relai World shares their own Drive folder with the existing service account |
| `ANTHROPIC_API_KEY` / `SARVAM_API_KEY` | per-tenant secret, `wrangler secret put ... --env <slug>` | their own keys, same as the UAT-key pattern you're already using |
| `SBM_API_KEY`, `SARVAM_WEBHOOK_TOKEN`, PIN secrets | fresh random values per tenant | generated at onboarding time |
| Google Drive service account | **shared** — one service account, granted access to each tenant's own folder via Drive sharing | same `GOOGLE_DRIVE_CLIENT_EMAIL`/`PRIVATE_KEY` as every other tenant |

Unlike the UAT plan, **a real tenant gets their own Drive folder from day
one** — the "reuse the existing Calls folder" decision for UAT was specific
to UAT pulling from the *same* business's historical data for testing. A
genuinely separate client has their own staff, their own phone, their own
Drive — there's no shared-folder race condition to worry about here at all,
since each tenant's poller only ever watches its own folder.

## `wrangler.jsonc` shape (template, not applied)

```jsonc
"env": {
  "uat": { /* ...as already planned... */ },
  "relai-world": {
    "name": "sbm-pipeline-relai-world",
    "vars": {
      "ENVIRONMENT": "production",   // this tenant's real production, not a test env
      "SARVAM_STT_MODE": "codemix",
      "SARVAM_LANGUAGE_CODE": "unknown",
      "ANTHROPIC_MODEL": "claude-sonnet-5",
      "ANTHROPIC_HAIKU_MODEL": "claude-haiku-4-5-20251001",
      "GOOGLE_DRIVE_CALLS_FOLDER_ID": "<Relai World's own folder>",
      "GOOGLE_DRIVE_ARCHIVE_FOLDER_ID": "<their own>",
      "GOOGLE_DRIVE_SPAM_FOLDER_ID": "<their own>",
      "PUBLIC_BASE_URL": "https://sbm-pipeline-relai-world.gupta-amal01.workers.dev"
    },
    "r2_buckets": [
      { "binding": "RECORDINGS", "bucket_name": "sbm-recordings-relai-world" },
      { "binding": "VOICE_NOTES", "bucket_name": "sbm-voice-notes-relai-world" }
    ],
    "d1_databases": [
      { "binding": "DB", "database_name": "sbm-relai-world", "database_id": "<filled in after wrangler d1 create>" }
    ]
  }
}
```

`ENVIRONMENT: "production"` here (not `"uat"`) is deliberate — this is a real
tenant's live data, and the one existing code path that branches on
`env.ENVIRONMENT` (the unbuilt digest-email guard) should treat every real
tenant as production, regardless of which `wrangler env` name hosts it.

## Onboarding sequence for a new tenant

Identical mechanics to `docs/UAT_ENVIRONMENT_PLAN.md`'s provisioning steps —
that doc is now effectively the reusable template, not a one-off. In
practice this is `pnpm run deploy relai-world` (`scripts/deploy.sh` —
see `docs/UAT_ENVIRONMENT_PLAN.md`'s "Provisioning sequence" for exactly
what it automates vs. what still needs a manual step) for the
provisioning/build/deploy mechanics; the commands below are the same thing
spelled out by hand:

```bash
SLUG=relai-world

npx wrangler d1 create sbm-$SLUG
npx wrangler r2 bucket create sbm-recordings-$SLUG
npx wrangler r2 bucket create sbm-voice-notes-$SLUG

# add env.$SLUG block to wrangler.jsonc (template above), with the real database_id

npx wrangler d1 migrations apply sbm-$SLUG --env $SLUG --remote

npx wrangler secret put ANTHROPIC_API_KEY --env $SLUG
npx wrangler secret put SARVAM_API_KEY --env $SLUG
npx wrangler secret put SARVAM_WEBHOOK_TOKEN --env $SLUG
npx wrangler secret put SBM_API_KEY --env $SLUG
npx wrangler secret put PIN_PEPPER --env $SLUG
npx wrangler secret put PIN_ENCRYPTION_KEY --env $SLUG
npx wrangler secret put GOOGLE_DRIVE_CLIENT_EMAIL --env $SLUG   # shared service account
npx wrangler secret put GOOGLE_DRIVE_PRIVATE_KEY --env $SLUG    # shared service account

pnpm build
npx wrangler deploy --env $SLUG

# seed their callers directory if they hand you a contacts sheet, same
# scripts/import_contacts.py flow already built for the current business:
npx wrangler d1 execute sbm-$SLUG --env $SLUG --remote --file=<their contacts_master.sql>

# add a row to the registry (docs/TENANTS.md / tenants.json)
```

## Rollout tooling — built

**`scripts/deploy.sh` (`pnpm run deploy <slug>`) covers this now** —
provisioning D1/R2 for a new tenant, checking required secrets are set,
migrating, building, deploying, and verifying, all from one command per
environment name. It stops short of writing `wrangler.jsonc`'s `env` block
itself (see `docs/UAT_ENVIRONMENT_PLAN.md`'s "Provisioning sequence" for why)
— that one step per new tenant stays manual, everything else is scripted.

## What doesn't change from the row-level plan

- The `docs/VOICE_NOTE_BUCKET_PLAN.md` code (the `VOICE_NOTES` binding, the
  naming helper) is per-Worker code, not per-database schema — it applies
  identically to every tenant's deployment with no changes.
- The general shape of "one Worker serves API + dashboard, same origin" from
  `CLAUDE.md`'s non-negotiables holds per-tenant exactly as it does today —
  each tenant just gets their own instance of that same one-Worker
  architecture, not a shared multi-tenant version of it.

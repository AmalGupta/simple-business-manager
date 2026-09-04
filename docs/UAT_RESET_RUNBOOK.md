# UAT reset runbook — wipe call data, import contacts, re-poll

One-time runbook for resetting the live worker (`sbm-dev`, the only environment —
see `docs/DEPLOY_RUNBOOK.md`) before bulk-ingesting ~2 months of historical calls
via the Google Drive poller. **Nothing in this file has been run.** Every command
below is for you to run yourself and review before executing, per your instruction —
this is a plan, not an executed action.

**Automated version:** `scripts/uat_reset.sh` runs Steps 2–5 below (wipe +
contacts import, optionally enabling the poller) as one script, with an
interactive confirmation, a mandatory backup first, and a hard failure if the
contacts import doesn't land the expected row count in `callers` — see the
script's own `--help`. It defaults to the **scoped** wipe (Option B below,
preserving the 11 site memos / 3 checklist voice notes) — pass `--wipe-all` if
you want the literal full wipe you confirmed earlier in this doc. Step 0/0b
(backup, R2 audio backup) and Step 1 (generating the contacts SQL) still need
to be done separately first; the script only takes over from "wipe" onward.

Current state as of 2026-09-04 (checked, not assumed):
- 305 rows in `calls`, 291 via the Drive poller (`drive_file_id` set).
- 96 rows in `callers` (90 client, 3 family, 3 spam).
- `app_settings.drive_poll_enabled = '0'` — poller is currently off.
- Google Drive secrets (`GOOGLE_DRIVE_CLIENT_EMAIL`/`PRIVATE_KEY`) are confirmed set remotely.
- Decision confirmed with you: **wipe everything — all 305 calls and all 96 callers — and rebuild from the Excel import + a fresh poll.**

## ⚠️ Read before running anything: `calls` is a shared table

`calls` isn't only customer phone calls. It also holds:
- **11 site voice memos** (`recorded_for_site_id IS NOT NULL`) — uploaded from a site's page, unrelated to the phone-call pipeline.
- **3 installation-checklist voice notes** (`installation_update_id IS NOT NULL`) — the required voice note for a staff site-visit checklist row.

Both counts are non-zero right now. A blanket `DELETE FROM calls` wipes these too, and they are **not** re-derivable from Drive — there's no backfill path for them. Decide explicitly:

- **Option A (what "wipe everything" implies literally):** delete all 305, including these 14 rows. Simplest, matches what you confirmed, but destroys that field-ops data permanently.
- **Option B (recommended):** scope every `calls` delete below with `WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL`, preserving those 14 rows and their linked `todos`/`transcripts`/`commitments`. The customer-call reset still happens cleanly; the unrelated staff-workflow data survives.

The SQL below is written for **Option B** (the safer default) with the extra `WHERE` clause called out — delete that clause from each statement if you actually want Option A.

## Step 0 — back up first

No rollback tooling exists in this repo for a remote delete gone wrong (`docs/DEPLOY_RUNBOOK.md` "Known failure modes"). Export before touching anything:

```bash
npx wrangler d1 export sbm-dev --remote --output=./backup-pre-uat-reset-$(date +%Y%m%d).sql
```

R2 audio objects are not worth backing up — they're disposable intermediates that get re-created from Drive on re-poll. The D1 export above is what actually matters (transcripts, extractions, todos).

## Step 0b — back up voice memo audio to a second R2 bucket (optional, recommended before Step 2's R2 deletes)

Only one bucket exists today (`sbm-recordings-dev` — confirmed via `wrangler r2 bucket list`). `wrangler` has no bucket-to-bucket copy command and no `object list` command, so this is a get→put loop per key rather than a single sync command. At ~300 recordings that's fine to do straight from the CLI; reach for `rclone` (R2's S3-compatible API) only if this ever needs to scale to thousands of objects.

```bash
# one-time: create the backup bucket
npx wrangler r2 bucket create sbm-recordings-backup

# get the key list the same way Step 2 does (run this BEFORE any deletes)
npx wrangler d1 execute sbm-dev --remote --command \
  "SELECT r2_key FROM calls" > r2_keys_all.json

# copy every object across, streaming (no local temp file)
jq -r '.[0].results[].r2_key' r2_keys_all.json | while read -r key; do
  echo "copying $key"
  npx wrangler r2 object get "sbm-recordings-dev/$key" --remote --pipe \
    | npx wrangler r2 object put "sbm-recordings-backup/$key" --remote --pipe
done
```

This backs up the raw audio only — not the D1 rows (transcripts, extractions, todos), which the Step 0 `d1 export` already covers. Keep both if you want a full undo path; the D1 export is what actually lets you reconstruct state, the R2 backup just saves you from re-fetching the same files from Drive.

## Step 1 — generate the contacts import SQL (safe, local, no remote calls)

Already built and dry-run against your file at `scripts/import_contacts.py`. It:
- Reads `Full Name` + `Mobile 1-4` from the Excel.
- Normalizes every number to a bare 10-digit Indian-mobile form (strips `+91`/leading `0`, matching what the Drive filename parser will see in a digit-shaped filename).
- Dedupes across the whole sheet (3,355 unique contacts from 3,306 rows, since 1,211 rows have >1 phone number).
- Skips 177 rows that aren't 10-digit Indian mobile numbers — mostly telecom shortcodes (`*321#`, `54321`), emergency numbers (`112`, `102`), and a handful of genuine foreign numbers (e.g. a Canada `+1...` contact). **Those foreign/short numbers are silently excluded from the "known contacts" allowlist** — a real overseas contact calling in will look exactly like an unknown number and get spam-scanned like any other. Worth knowing, not necessarily worth fixing for this pass.
- Resolves 105 same-number-different-name collisions by keeping whichever name it saw first in the sheet (both names are clearly the same person/entity in every case checked, e.g. "Ayush Ji LDH" vs "Ayush Taneja").

Regenerate the SQL file (re-run in case the Excel changes before you actually do this):

```bash
python3 scripts/import_contacts.py "/Users/amalgupta/Downloads/Contacts-04-Sept-02-33.xlsx" ./import_contacts.sql
```

Open `import_contacts.sql` and skim it before applying — it's plain `INSERT OR IGNORE INTO callers (...)` statements, one per contact, `category='client'` for all of them (none of this sheet's entries are your staff or family — those stay hand-curated, small in number, and already exist correctly in the current 96 `callers` rows... except you're wiping those too. **If you wipe `callers` entirely, re-add your real `family`/`staff` numbers by hand afterward** — the Excel import alone will not recreate them, since it has no notion of those categories.)

## Step 2 — wipe call-derived data (remote, destructive — review every line before running)

Delete order matters only for tidiness (D1/SQLite here has no FK enforcement — nothing will reject a wrong order), so this is child-to-parent to avoid dangling orphans:

```bash
# Site-visit voice-note calls (Option B: preserve them) — decouple installation_updates
# from the calls table entirely before deleting calls, rather than deleting these rows.
npx wrangler d1 execute sbm-dev --remote --command \
  "UPDATE installation_updates SET voice_note_call_id = NULL WHERE voice_note_call_id IN (SELECT id FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL)"

# missed_deadlines -> todos -> calls
npx wrangler d1 execute sbm-dev --remote --command \
  "DELETE FROM missed_deadlines WHERE todo_id IN (SELECT id FROM todos WHERE call_id IN (SELECT id FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL))"

npx wrangler d1 execute sbm-dev --remote --command \
  "DELETE FROM todo_voice_notes WHERE todo_id IN (SELECT id FROM todos WHERE call_id IN (SELECT id FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL))"

npx wrangler d1 execute sbm-dev --remote --command \
  "DELETE FROM todo_assignees WHERE todo_id IN (SELECT id FROM todos WHERE call_id IN (SELECT id FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL))"

npx wrangler d1 execute sbm-dev --remote --command \
  "DELETE FROM todos WHERE call_id IN (SELECT id FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL)"

npx wrangler d1 execute sbm-dev --remote --command \
  "DELETE FROM commitments WHERE call_id IN (SELECT id FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL)"

npx wrangler d1 execute sbm-dev --remote --command \
  "DELETE FROM call_sites WHERE call_id IN (SELECT id FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL)"

npx wrangler d1 execute sbm-dev --remote --command \
  "DELETE FROM transcripts WHERE r2_key IN (SELECT r2_key FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL)"

# grab R2 keys BEFORE deleting the calls rows, so you know what to clean up in R2
npx wrangler d1 execute sbm-dev --remote --command \
  "SELECT r2_key FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL" > r2_keys_to_delete.json

npx wrangler d1 execute sbm-dev --remote --command \
  "DELETE FROM calls WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL"

# callers (only once calls no longer reference them via client_id — client_id has
# no enforced FK, so this order doesn't strictly matter, but do it last anyway)
npx wrangler d1 execute sbm-dev --remote --command "DELETE FROM callers"
```

**Skip the `installation_updates` UPDATE and the `WHERE recorded_for_site_id IS NULL AND installation_update_id IS NULL` clauses everywhere** if you actually meant Option A (wipe literally everything, including the 14 site/staff rows) — then it's just plain `DELETE FROM <table>` for each, still in the same child-to-parent order.

R2 cleanup (once you have the key list from the JSON above):

```bash
# repeat per key, or script a loop over r2_keys_to_delete.json
npx wrangler r2 object delete sbm-recordings-dev/<r2_key>
```

(Bucket name from `wrangler.jsonc` — confirm it matches what's actually bound as `RECORDINGS` before running; the scaffolding doc's dev/prod bucket-name split may not reflect what this single live environment is actually using.)

## Step 3 — apply the contacts import

```bash
npx wrangler d1 execute sbm-dev --remote --file=./import_contacts.sql
```

Then re-add your real family/staff numbers by hand (small list, one-at-a-time via the existing Callers Directory UI or a couple of manual `wrangler d1 execute` inserts with the correct `category`) — the bulk import only ever writes `category='client'`.

## Step 4 — verify the reset

```bash
npx wrangler d1 execute sbm-dev --remote --command "SELECT COUNT(*) FROM calls"     # expect 0, or 14 if Option B
npx wrangler d1 execute sbm-dev --remote --command "SELECT COUNT(*) FROM callers"   # expect ~3355 + however many family/staff you re-add
```

## Step 5 — get files back into the Drive Calls folder, then re-poll

You mentioned some of these files have already been through the poller once (291 of the 305 calls came in that way) and were archived out of the Calls folder into Drive's Archive folder as a result (`docs/SCAFFOLDING.md`/prior audit — the poller moves, not copies, on ingest). **You said you'll handle moving the full batch back into the Calls folder yourself** — that has to happen before re-polling, or the poller will only see whatever's still sitting in Calls today and silently skip everything already archived.

Once the files are back in place:

```bash
# turn the poller on
npx wrangler d1 execute sbm-dev --remote --command \
  "UPDATE app_settings SET value = '1', updated_at = datetime('now') WHERE key = 'drive_poll_enabled'"
```

Then either let the `*/5 * * * *` cron pick it up on its own, or drive it manually and faster:

```bash
curl -X POST https://sbm-pipeline.gupta-amal01.workers.dev/api/admin/drive-poll \
  -H "Cookie: <your admin session cookie>"
```

**Expect this to be slow.** The poller caps at ~4 files per invocation on the Workers Free subrequest budget (`wrangler.jsonc` comment, confirmed in the prior audit) — for a couple hundred historical files that's dozens of cron ticks or manual triggers. If you're on a paid Cloudflare plan, raising `DRIVE_POLL_SUBREQUEST_BUDGET` (currently defaulted in `src/lib/drive-calls-poller.ts`) shortens this considerably — say if you want that change made before you start the re-poll.

## Known residual risk not fixed by this runbook

The earlier audit found `POST /upload` stamps `recorded_at` as upload-time, not the recording's real historical date — this breaks relative-date extraction ("kal"/"parso") on backfilled calls. **This runbook sidesteps that entirely by not using `/upload` at all** — the Drive poller already derives `recorded_at` correctly from the Cube-ACR-style filename timestamp (confirmed against your two real filenames). No code fix is needed for this specific plan; it only mattered for the `/upload`-based path you've since ruled out.

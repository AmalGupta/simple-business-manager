# Voice-note identification, backup, and dedicated bucket

**Status (2026-09-04): Part 2's code is built and typechecked/built clean, but
not deployed and not running anywhere.** `wrangler deploy --dry-run` confirms
the config is valid and both bindings resolve. Nothing remote has been
touched — the `sbm-voice-notes-dev` bucket does not exist yet (`wrangler r2
bucket create sbm-voice-notes-dev` is a prerequisite before an actual
`pnpm run deploy` will succeed, since a binding to a bucket that doesn't exist
fails at deploy time, not before).

Part 1 (backup) is still just a runbook step — nothing to "build" there, see
below.

## ⚠️ Deployment-ordering risk, now that the code exists

`handleGetCallRecording` (`src/handlers/site-media.ts`, the endpoint every call
recording — not just site memos — streams through) and the Sarvam-submit path
(`src/lib/sarvam.ts`) now both read exclusively from `VOICE_NOTES`. The 305+
calls already in `sbm-recordings-dev` under the old `inbox/` keys were written
to `RECORDINGS`, not `VOICE_NOTES`. **If this deploys before the UAT reset
runs, playback breaks for every existing call** (its audio genuinely isn't in
the bucket the code now reads from) — nothing else is affected (transcripts,
extractions, todos are all still readable; only the raw-audio stream 404s).

This resolves itself cleanly once `docs/UAT_RESET_RUNBOOK.md` runs — that wipes
the old rows and re-ingests fresh into `VOICE_NOTES` with correct keys, so
there's no gap once both steps are done. The risk is only in the window
between deploying this and running the reset. Land them together (deploy, then
immediately run the reset), not deploy-and-wait.

## Part 1 — identify "voice recordings only" and back them up

### The inventory (all writes to the `RECORDINGS` binding today)

Everything currently lives in one bucket (`sbm-recordings-dev`), across three key
prefixes that map cleanly to "is this audio":

| Prefix | Table | Content | Voice? |
|---|---|---|---|
| `inbox/<callId>.<ext>` | `calls.r2_key` | phone calls (Drive poll + `/upload`), site voice memos, installation-checklist voice notes, site-complaint voice notes — all five flows share this exact key scheme, distinguished only by `calls.source`/`recorded_for_site_id`/`installation_update_id` | **Yes** |
| `todo-voice-notes/<todoId>/<uuid>.<ext>` | `todo_voice_notes.r2_key` | quick admin voice clip attached to a todo, never transcribed, no `calls` row at all | **Yes** |
| `site-media/<siteId>/<uuid>.<ext>` | `site_media.r2_key` | photos/videos from site visits and complaint attachments | No |

So "identify the voice recordings" doesn't need R2-side listing (the CLI has no
`object list` command anyway) — it's a D1 query, union of the two voice-bearing
tables:

```sql
SELECT r2_key FROM calls
UNION
SELECT r2_key FROM todo_voice_notes;
```

`site_media` is excluded by construction — it was never in the union.

### Backup command

Same get→put `--pipe` pattern as the runbook's Step 0b, just sourced from the
query above instead of `calls` alone:

```bash
npx wrangler r2 bucket create sbm-recordings-backup   # if not already created

npx wrangler d1 execute sbm-dev --remote --command \
  "SELECT r2_key FROM calls UNION SELECT r2_key FROM todo_voice_notes" > r2_voice_keys.json

jq -r '.[0].results[].r2_key' r2_voice_keys.json | while read -r key; do
  echo "copying $key"
  npx wrangler r2 object get "sbm-recordings-dev/$key" --remote --pipe \
    | npx wrangler r2 object put "sbm-recordings-backup/$key" --remote --pipe
done
```

This backs up every genuine voice recording (phone calls, site memos, checklist
voice notes, complaint voice notes, todo voice notes) and nothing else.

## Part 2 — a dedicated voice-note bucket with human-readable keys

### What changes

A new bucket (e.g. `sbm-voice-notes-dev`), a new binding (e.g. `VOICE_NOTES`),
and a new key scheme replacing today's opaque `<uuid>.<ext>`:

```
<Speaker>_<YYYYMMDD>_<HHMMSS>_<shortId>.<ext>
```

This deliberately mirrors the Drive filename convention already in use
(`Call recording <Name>_<YYMMDD>_<HHMMSS>.m4a`) so the bucket reads the same way
the Drive folder does — browsable by a human, not just addressable by code.

`<shortId>` (first 8 chars of the call/note's own UUID) is a collision guard —
`r2_key` is `NOT NULL UNIQUE` in the `calls` schema and is the join key to
`transcripts`, so the key must stay globally unique even if two speakers record
in the same second, or a "Speaker" label collides after sanitization. Without
it, a real Sarvam job pointed at a colliding key would silently overwrite
another recording's audio in R2.

### Per-flow "Speaker" and metadata proposal

Every flow already has *some* identifying context available at write time — the
question is which to put first (that's what's readable in the R2 console/bucket
listing without opening each file) and which staff/site/call context to fetch
where it isn't already loaded.

| Flow (file) | Today's key | Proposed `<Speaker>` | Proposed `<metadata>` | New context needed? |
|---|---|---|---|---|
| Drive poller (`drive-calls-poller.ts:238`) | `inbox/<callId>.ext` | caller label already parsed from the Drive filename (`parsed.callerLabel`) | timestamp already parsed (`parsed.recordedAt`) | None — already in hand. |
| `/upload` (`upload.ts:148`) | `inbox/<callId>.ext` | `"Unknown"` — no caller resolution happens at upload time | upload timestamp | None (and this path is deprecated per the UAT plan anyway — low priority to touch). |
| Site voice memo (`site-voice-note.ts:32`) | `inbox/<callId>.ext` | uploading staff member's name | site name | Both need a lookup — handler currently only has `uploadedByUserId`/`siteId`, not the resolved names. |
| Installation checklist voice note (`installation.ts:130`) | `inbox/<callId>.ext` | staff member's name | `<site name>-<installation label>-<category>` | Same — staff name and site name aren't loaded today (installation row has `site_id` and its own `label`, but not the site's name). |
| Site complaint voice note (`installation.ts:249`) | `inbox/<callId>.ext` | staff member's name | `<site name>-Complaint` | Same. |
| Todo voice note (`todo-voice-note.ts:29`) | `todo-voice-notes/<todoId>/<uuid>.ext` | admin's name (already have `uploadedByUserId`, need the name) | a short slug of the todo's own text | Needs the todo row (currently not fetched — only `todoId` is used). |

Example resulting keys:
```
BrijeshJainGlass_20260904_142556_a1b2c3d4.m4a                       (phone call)
Piyush_SharmaGlassWorks_20260904_101200_9f3e7c21.m4a                (site voice memo)
Piyush_SharmaGlassWorks-Window3LivingRoom-workdone_...m4a           (checklist note)
Amal_ConfirmDeliveryDate21Aug_...m4a                                (todo voice note)
```

**Open decision — sanitization rules.** Names/labels need stripping of
characters R2 keys tolerate poorly in practice (spaces → nothing or `-`,
non-ASCII, slashes). I'd write one shared `sanitizeForKey()` helper used by
every flow rather than duplicating ad hoc logic five times — happy to build
that as part of this if you confirm the naming shape above.

### What does NOT need to change

- `site_media` stays in the existing `RECORDINGS` bucket under `site-media/` —
  it's not voice content, no reason to move it, and it already has a sensible
  structure (grouped by site).
- No D1 schema change. `r2_key` is just an opaque string column; nothing about
  the schema encodes which bucket it lives in. The **code** needs to know
  (calls/todo_voice_notes → new `VOICE_NOTES` bucket, site_media → stays on
  `RECORDINGS`), which is a small, mechanical change since every write/read
  site already takes an explicit binding argument (`env.RECORDINGS` today).

### Full list of code touch points (11 call sites, 8 files)

Writes (`RECORDINGS.put` → `VOICE_NOTES.put`, with the new key scheme):
- `src/handlers/upload.ts:148`
- `src/lib/drive-calls-poller.ts:238`
- `src/handlers/site-voice-note.ts:32`
- `src/handlers/installation.ts:130` (checklist voice note — **not** the two
  photo/video puts at `:203`/`:284` in the same file, those stay on `RECORDINGS`)
- `src/handlers/installation.ts:249` (site complaint voice note)
- `src/handlers/todo-voice-note.ts:29`

Reads/deletes that need the binding swapped alongside:
- `src/lib/sarvam.ts:82` (`.get`, submits the audio to Sarvam)
- `src/handlers/stt-webhook.ts:98` (`.delete`, spam cleanup)
- `src/lib/drive-calls-poller.ts:163` (`.delete`)
- `src/handlers/todo-voice-note.ts:56` (`streamR2Object`, playback)
- `src/handlers/site-media.ts:93` — **worth noting**: this streams a *call's*
  audio (`call.r2_key`) from within the site-media handler, for in-site
  playback. Easy to miss since the file is named `site-media.ts` but this one
  read is actually voice content, not media — it needs the `VOICE_NOTES`
  binding too, while `site-media.ts:63` (actual `site_media` rows) stays on
  `RECORDINGS`.

Config:
- `wrangler.jsonc` — new `r2_buckets` entry (`{ "binding": "VOICE_NOTES", "bucket_name": "sbm-voice-notes-dev" }`), mirrored into the `staging`/`production` env blocks if those are ever actually deployed.
- `src/index.ts` `Env` interface — add `VOICE_NOTES: R2Bucket`.
- `.dev.vars`/local Miniflare state — no secret needed (R2 bindings aren't secrets), but local `wrangler dev --local` will auto-provision the new bucket's local SQLite-backed storage on first use, nothing to pre-create.

### Existing objects — leave in place, don't migrate

The 305+ objects already in `sbm-recordings-dev` under `inbox/` and
`todo-voice-notes/` keep their current keys and bucket. D1 rows already point
at those exact `r2_key` values; renaming/moving them would mean rewriting every
`calls.r2_key`/`todo_voice_notes.r2_key` row too; for no functional benefit
since streaming/playback works identically regardless of key shape. The new
bucket and naming scheme apply **going forward, to new writes only** — unless
you specifically want the historical batch's audio renamed to match once it's
re-ingested anyway as part of the UAT reset (in which case this happens for
free: the reset in `docs/UAT_RESET_RUNBOOK.md` re-polls everything from Drive,
so if this bucket change lands before that re-poll, every backfilled call
already gets the new bucket and naming scheme with no separate migration step).

### Suggested order if you want to do both

1. Land the `VOICE_NOTES` bucket + binding + naming-helper change first (regular
   code work, testable locally with `wrangler dev --local`).
2. Then run the UAT reset runbook — the Drive re-poll naturally populates the
   new bucket with correctly-named objects for the whole 2-month backfill,
   instead of ingesting into the old bucket now and migrating later.

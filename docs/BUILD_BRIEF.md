# BUILD BRIEF — Simple Business Manager, dev worker milestone

For Claude Code. Read this fully before writing anything.

Companion documents in this repo:
- `SCAFFOLDING.md` — architecture, schema, verified API shapes, design tokens. **Do not re-derive anything that document already settles.**
- `Dashboard.jsx` — the dashboard component, already built and validated. Mount it; do not redesign it.

---

## Objective

One deployed Cloudflare Worker on `workers.dev` that serves both the API and the dashboard. He opens one link on his phone, uploads a recording, and sees the action plan appear. There is no app to install — the link is the product.

**Definition of done — all five must be true:**

1. Opening the worker URL on a phone shows an upload page.
2. Uploading a recording stores it in R2 and returns a call ID immediately.
3. Sarvam transcribes it and the transcript lands in D1 without any manual step.
4. Claude produces the six-field action plan from that transcript and writes it to D1.
5. The dashboard, **served from that same worker URL**, renders the action plan on his phone, and checking off a todo persists.

If a real recording of a Hindi-English call goes in one end and a correct todo list comes out the other, the milestone is met. Nothing else is in scope.

---

## Before you start

Inspect the existing repo first. Report back what you find before making structural changes:

- Existing `package.json`, package manager, and workspace layout
- Any existing `wrangler.toml` / `wrangler.jsonc`, and whether resources are already created
- Existing `CLAUDE.md` — if present, add `@docs/BUILD_BRIEF.md` to it rather than overwriting
- Whether `wrangler whoami` is authenticated and which account it resolves to

If the repo layout conflicts with `SCAFFOLDING.md` §1, follow the existing repo and tell me what diverged. Do not restructure someone else's repo to match a document.

---

## Guardrails

These are hard constraints, not preferences.

**Never commit a secret.** Not to `wrangler.jsonc`, not to a `.env` that isn't gitignored, not in an example file with a real value in it. Use `wrangler secret put`. Verify `.dev.vars` is gitignored before writing one.

**Never send email to anyone but me during this milestone.** No digest, no customer-facing anything. If you build a send path at all, hard-code the recipient to the `DIGEST_TO_EMAIL` dev value and guard it on `ENVIRONMENT === "production"` returning early.

**Ask before destructive or billable Cloudflare operations.** Creating buckets and databases is fine. `d1 execute --remote` with DDL, deleting resources, or anything touching a `production`-named resource: stop and ask.

**Do not invent external API shapes.** Sarvam's batch endpoints and Claude's tool-use request are both specified in `SCAFFOLDING.md` §5 and §6 with verified field names. If something there doesn't match reality, stop and report the mismatch — do not guess a fix.

**Do not build the cron bucket scanner.** Ingestion is the upload endpoint for this milestone. The scanner exists in `SCAFFOLDING.md` for a later milestone when auto-sync is solved.

**Stop at Task 4 and wait.** See the checkpoint below. It is the point of the whole exercise.

---

## Architecture for this milestone

One worker. It serves the dashboard SPA from static assets and handles the API on the same origin — same-origin means no CORS, and one URL to remember.

**Do not use Next.js or the OpenNext adapter.** `SCAFFOLDING.md` §1 records why that decision was reversed. The dashboard is a Vite-built React SPA in `web/`, output to `dist/`, served through the `ASSETS` binding.

**This has to look good, and the stack for that is fixed in `SCAFFOLDING.md` §7.** Tailwind v4 via `@tailwindcss/vite`, `motion` for animation, `react-router` v7 for real URLs, `lucide-react` for icons, Radix primitives only when a dialog or menu actually appears. Do not add a component library — MUI, Chakra, and shadcn defaults all carry visual opinions that fight the design. Do not add a second animation library. If you think something else is needed, ask first.

```
sbm-dev  (workers.dev)
├── GET  /                     dashboard SPA (static assets)
├── GET  /upload               upload page (plain HTML, no build step)
├── POST /upload               multipart → R2 → D1 row → Sarvam submit
├── POST /webhooks/sarvam      callback → transcript → extraction → D1
├── GET  /api/calls            JSON feed for the dashboard
├── GET  /api/calls/:id        single call with todos
└── PATCH /api/todos/:id       status changes
```

Bindings: `RECORDINGS` (R2), `DB` (D1). Secrets: `SARVAM_API_KEY`, `SARVAM_WEBHOOK_TOKEN`, `ANTHROPIC_API_KEY`.

**No Cloudflare Access on this worker.** The Sarvam webhook cannot pass a login page — see the Access gotcha in `SCAFFOLDING.md` §2. Protect `/upload` and the `/api/*` routes with a shared secret in an `X-SBM-Key` header instead, and protect the webhook with `X-SARVAM-JOB-CALLBACK-TOKEN`. Access goes in front of the real dashboard later, not here.

**The upload endpoint must return before transcription finishes.** Write the R2 object and the D1 row, respond `202` with the call ID, then do the Sarvam submit in `ctx.waitUntil()`. A phone on a patchy connection will not hold a request open for a two-minute upload plus an API round trip.

**Why the upload page matters more than it looks.** He can test from an iPhone today by sharing a Voice Memo into a browser — no app install, no Cube ACR, no resolution of the Android-vs-iPhone question. That question stays open and stops blocking anything.

**Migrate `Dashboard.jsx` off inline styles as part of Task 6.** It uses them because it was authored without a compiler; Vite removes that constraint. Port to Tailwind utilities with the `@theme` block in `SCAFFOLDING.md` §7, keeping token names identical so the change is mechanical and reviewable. Behaviour must not change — the four todo states, the seven-column streak grid, the CSV export, and the day drilldown all work today and are the acceptance criteria for the port.

**Mobile is the primary surface, not an afterthought.** He will use this on a phone far more than on a laptop. `Dashboard.jsx` is already built for it — 44px minimum touch targets, a seven-column week grid for the streak, single-column stacking. Do not regress those. Put `<meta name="viewport" content="width=device-width, initial-scale=1">` in `web/index.html`, and test at 360px width before calling any task done.

---

## The prompt layer

This was flagged undesigned. Design it as follows.

```
packages/core/prompts/
├── v1/
│   ├── system.ts     # extraction system prompt
│   ├── tool.ts       # record_call tool schema — SCAFFOLDING.md §6
│   └── render.ts     # diarized transcript → user message
├── index.ts          # exports ACTIVE = v1; swapping versions is one line
└── evals/
    ├── golden/*.json # {transcript, expected} pairs from real calls
    └── run.ts        # scores extraction against golden
```

Three rules that make this layer worth having:

**Version it from day one.** Add `prompt_version TEXT` to the `calls` table and write the active version on every extraction. Without it you cannot tell whether an accuracy change came from a prompt edit or from different audio, and you will be editing prompts constantly.

**Never edit a shipped version in place.** Prompt changes create `v2/`. Old extractions stay traceable to the prompt that produced them.

**The eval scores fields, not vibes.** Deadlines, quantities, names, and amounts are the only things worth scoring — they are what feed a missed deadline. A summary that reads nicely and a date that is a day wrong is a failure. Start the golden set at three real calls; it grows as errors surface.

The extraction prompt's own principles are in `SCAFFOLDING.md` §6 and should be carried in verbatim: extract only what was said, never infer an unstated deadline, put ambiguity in `unresolved` rather than guessing a todo, keep todo text in the language spoken.

---

## Build order

Each task is done when its verification passes. Do not start the next one until it does.

**Task 1 — Resources and schema.**
Create the R2 bucket and D1 database. Apply the schema from `SCAFFOLDING.md` §4, plus `prompt_version` on `calls`. Confirm `closed_by_call_id` is present on `todos` — it is an M1 placeholder, unused now, and exists so M1 needs no migration against live data.
*Verify:* `wrangler d1 execute sbm-dev --remote --command "SELECT name FROM sqlite_master WHERE type='table'"` lists all five tables.

**Task 2 — Worker skeleton and upload page.**
Router, bindings, `GET /` upload page, `POST /upload` writing to R2 and D1. No Sarvam yet.
*Verify:* deploy, open the URL on a phone, upload a voice memo, see the object with `wrangler r2 object get` and the row in D1.

**Task 3 — Sarvam submit.**
Wire `submitRecording` from `SCAFFOLDING.md` §5. Batch API, `saaras:v3`, `mode` from env, diarization on with `num_speakers: 2`. Presigned upload URL, R2 body streamed straight through — never buffer the file into memory.
*Verify:* uploading produces a job ID and `stt_status = 'submitted'`.

**Task 4 — Webhook and transcript. → CHECKPOINT, STOP HERE.**
Callback handler, token validation, download the result, store transcript and diarized output.
*Verify:* upload a real Hindi-English call and print the transcript.

> **Stop and show me the transcript before continuing.** This is the go/no-go for the entire project. If Sarvam mangles names, numbers, and dates on his actual audio, every task after this is wasted work, and the answer is to try `mode: "translate"` or evaluate Bhashini — not to press on. Do not start Task 5 without me.

**Task 5 — Prompt layer and extraction.**
Build the prompt layer above. Forced tool use, never free-text JSON. Feed the diarized transcript with speaker labels, not the flat one.
*Verify:* ten calls extracted, eyeballed by me. Confirm the speaker-0-is-him assumption holds — if it flips between calls, detect by matching his own number rather than trusting index order.

**Task 6 — Read API and dashboard, deployed together.**
`GET /api/calls` shaped exactly like the mock block at the bottom of `Dashboard.jsx`, so wiring is a straight swap. Scaffold `web/` with Vite, mount `Dashboard.jsx`, delete the mock block and fetch `/api/calls` instead. Build to `dist/`, wire the `ASSETS` binding per `SCAFFOLDING.md` §2, deploy.
*Verify:* **open the worker URL on his phone.** The dashboard loads, renders a real call, and the streak wall, day drilldown, and CSV export all work. Separately confirm `/api/calls` returns JSON and not the SPA shell — that is what `run_worker_first` is for, and it is the single most likely thing to be misconfigured.

**Task 7 — Write API.**
`PATCH /api/todos/:id` for `status`, `completed_at`, `snoozed_until`. The dashboard's optimistic update and rollback already expect this contract.
*Verify:* check a todo off, hard-refresh, it stays checked. Kill the worker, check one off, confirm the row rolls back rather than lying.

---

## Not in this milestone

Cron bucket scanner. Digest email. Cloudflare Access. Staging and production environments. Next.js, OpenNext, or any SSR. A native app. Auto-closing todos from a later call. Customer-facing anything. Bhashini — only if Task 4 fails.

---

## Ask, don't assume

Stop and ask if any of these come up rather than picking for me:

- Sarvam returns a shape that doesn't match `SCAFFOLDING.md` §5
- The existing repo's structure or tooling conflicts with this brief
- A schema change looks necessary beyond `prompt_version`
- Speaker diarization doesn't reliably separate the two sides
- Anything would cost money beyond R2, D1, Workers free tiers, and Sarvam and Anthropic usage

Report progress as each task's verification passes, not at the end.

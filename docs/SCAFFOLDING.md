# Simple Business Manager — M0 Scaffolding

Internal build reference. Repo layout, deploy pipeline, environment config, external service wiring, and the design system.

**Name:** Simple Business Manager (internal only — never on invoices, quotes, letterhead, or anything customer-facing).
**Dashboard:** served by the worker itself. Dev is a `workers.dev` link he opens on his phone; production moves to `touchpoint.<businessname>.com`. There is no app — the link is the product.
**Scope:** single user, one bucket, one database, one daily digest. No customer-facing email in M0.

---

## 1. Repo structure

**One Worker.** It serves the dashboard as static assets and handles the API, upload, webhook, and cron on the same origin.

This supersedes the earlier Next.js-on-OpenNext decision, and the reason is worth recording. That decision assumed a dashboard needing SSR. It doesn't: the dashboard is a single-user client-side app that fetches its own data, and every interaction — checking off a todo, opening a day, exporting a report — already runs in the browser. Serving it as static assets from the same Worker that owns the API removes Next.js, the OpenNext adapter, a second deployment, and a class of cross-origin problems, in exchange for losing SSR nobody needed. It also means one URL, which is the whole requirement: he opens a link on his phone.

Revisit only if the dashboard ever needs server-rendered pages or public multi-user routes. For a single user behind Access, it won't.

```
simple-business-manager/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # typecheck + test on every PR
│       └── deploy.yml                # staging on main, prod on tag
├── src/                              # the Worker
│   ├── index.ts                      # router: fetch() + scheduled()
│   ├── handlers/
│   │   ├── upload.ts                 # POST /upload → R2 → D1 → Sarvam
│   │   ├── stt-webhook.ts            # Sarvam callback → download → extract
│   │   ├── api.ts                    # GET /api/calls, PATCH /api/todos/:id
│   │   └── send-digest.ts            # cron: daily digest
│   └── lib/
│       ├── sarvam.ts                 # §5
│       └── extract.ts                # §6
├── web/                              # the dashboard SPA (Vite + React)
│   ├── index.html                    # viewport meta lives here
│   ├── src/
│   │   ├── main.jsx
│   │   └── Dashboard.jsx             # the built component
│   └── vite.config.js                # outDir: ../dist
├── dist/                             # build output, served by ASSETS
├── wrangler.jsonc
└── .dev.vars.example
├── packages/
│   └── core/
│       ├── src/
│       │   ├── schema.sql            # D1 schema (§4)
│       │   ├── queries.ts            # all D1 access lives here
│       │   ├── types.ts             # CallExtraction, Todo, Client
│       │   └── prompt.ts             # extraction prompt + tool schema
│       └── package.json
├── migrations/
│   └── 0001_init.sql
├── package.json                      # pnpm workspaces
└── pnpm-workspace.yaml
```

**Rule:** no SQL outside `packages/core/queries.ts`. Every handler imports from there. The dashboard never talks to D1 directly — it goes through `/api`, so there is exactly one place where a query can be wrong.

---

## 2. Cloudflare resources

Three environments. `dev` is local-only (Miniflare via `wrangler dev`) — it does not deploy. `staging` and `prod` are real.

| Resource | dev (local) | staging | prod |
|---|---|---|---|
| R2 bucket | `sbm-recordings-dev` | `sbm-recordings-staging` | `sbm-recordings` |
| D1 database | local SQLite | `sbm-staging` | `sbm` |
| Worker (API + dashboard) | `localhost:8787` | `sbm-staging` | `sbm` |
| Domain | — | `touchpoint-staging.<businessname>.com` | `touchpoint.<businessname>.com` |
| Cloudflare Access | off | on (your email) | on (his email + yours) |

Create them once:

```bash
wrangler r2 bucket create sbm-recordings
wrangler r2 bucket create sbm-recordings-staging
wrangler d1 create sbm
wrangler d1 create sbm-staging
wrangler d1 migrations apply sbm --remote
```

### `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "sbm-pipeline",
  "main": "src/index.ts",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],

  "vars": {
    "ENVIRONMENT": "development",
    "SARVAM_STT_MODE": "codemix",
    "SARVAM_LANGUAGE_CODE": "unknown",
    "ANTHROPIC_MODEL": "claude-sonnet-5",
    "INGEST_PREFIX": "inbox/",
    "DIGEST_SEND_HOUR_IST": "7"
  },

  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/upload", "/webhooks/*"]
  },

  "r2_buckets": [
    { "binding": "RECORDINGS", "bucket_name": "sbm-recordings-dev" }
  ],
  "d1_databases": [
    { "binding": "DB", "database_name": "sbm", "database_id": "<uuid>" }
  ],

  "triggers": {
    "crons": ["*/15 * * * *", "30 1 * * *"]
  },

  "env": {
    "staging": {
      "name": "sbm-pipeline-staging",
      "vars": {
        "ENVIRONMENT": "staging",
        "SARVAM_STT_MODE": "codemix",
        "SARVAM_LANGUAGE_CODE": "unknown",
        "ANTHROPIC_MODEL": "claude-sonnet-5",
        "INGEST_PREFIX": "inbox/",
        "DIGEST_SEND_HOUR_IST": "7"
      },
      "r2_buckets": [
        { "binding": "RECORDINGS", "bucket_name": "sbm-recordings-staging" }
      ],
      "d1_databases": [
        { "binding": "DB", "database_name": "sbm-staging", "database_id": "<uuid>" }
      ],
      "triggers": { "crons": ["*/15 * * * *"] }
    },
    "production": {
      "name": "sbm-pipeline",
      "vars": {
        "ENVIRONMENT": "production",
        "SARVAM_STT_MODE": "codemix",
        "SARVAM_LANGUAGE_CODE": "unknown",
        "ANTHROPIC_MODEL": "claude-sonnet-5",
        "INGEST_PREFIX": "inbox/",
        "DIGEST_SEND_HOUR_IST": "7"
      },
      "r2_buckets": [
        { "binding": "RECORDINGS", "bucket_name": "sbm-recordings" }
      ],
      "d1_databases": [
        { "binding": "DB", "database_name": "sbm", "database_id": "<uuid>" }
      ],
      "triggers": { "crons": ["*/15 * * * *", "30 1 * * *"] }
    }
  }
}
```

Cron notes: `*/15` is the bucket scan. `30 1 * * *` is UTC = 07:00 IST, the digest. Workers cron is UTC only, so IST times are always offset by 5:30.

> **Access gotcha, worth catching now.** Sarvam's webhook POSTs to the pipeline Worker. If that hostname sits behind Cloudflare Access, the callback gets a login page and the transcript never arrives. Keep the pipeline Worker on its `workers.dev` hostname (or a subdomain excluded from the Access policy) and authenticate it with the `X-SARVAM-JOB-CALLBACK-TOKEN` header instead. Access protects only `touchpoint.<businessname>.com`.

---

## 3. Environment variables

**Secrets** — set with `wrangler secret put <NAME> --env <staging|production>`, and mirrored into GitHub repo secrets for CI. Never in `wrangler.jsonc`.

| Secret | Used by | What it is |
|---|---|---|
| `SARVAM_API_KEY` | pipeline | Sarvam subscription key (`api-subscription-key` header) |
| `SARVAM_WEBHOOK_TOKEN` | pipeline | Token you generate; validated on every callback |
| `ANTHROPIC_API_KEY` | pipeline | Claude API key |
| `RESEND_API_KEY` | pipeline | Digest email delivery |
| `CLOUDFLARE_API_TOKEN` | GitHub only | Workers Scripts:Edit, D1:Edit, R2:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub only | Account identifier |

**Vars** — plaintext config, checked into `wrangler.jsonc`, differing per environment.

| Var | dev | staging | prod | Notes |
|---|---|---|---|---|
| `ENVIRONMENT` | `development` | `staging` | `production` | Gates logging + digest sending |
| `SARVAM_STT_MODE` | `codemix` | `codemix` | `codemix` | See §5 — this is the knob you'll A/B |
| `SARVAM_LANGUAGE_CODE` | `unknown` | `unknown` | `unknown` | `unknown` = auto-detect |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | `claude-sonnet-5` | `claude-sonnet-5` | |
| `INGEST_PREFIX` | `inbox/` | `inbox/` | `inbox/` | R2 key prefix the scanner watches |
| `DIGEST_SEND_HOUR_IST` | `7` | `7` | `7` | Informational; cron is the real schedule |
| `DIGEST_TO_EMAIL` | your email | your email | **his email** | The one var that must not be wrong |
| `DIGEST_FROM_EMAIL` | — | `sbm@<businessname>.com` | `sbm@<businessname>.com` | Needs Resend domain verification |
| `DASHBOARD_URL` | `http://localhost:3000` | staging URL | prod URL | Used in digest links |

Local development uses `.dev.vars` (Wrangler's own file — Next.js `.env.local` is not read inside the Workers runtime). Commit `.dev.vars.example`, gitignore `.dev.vars`:

```bash
# .dev.vars
SARVAM_API_KEY="sk_..."
SARVAM_WEBHOOK_TOKEN="local-dev-token"
ANTHROPIC_API_KEY="sk-ant-..."
RESEND_API_KEY="re_..."
DIGEST_TO_EMAIL="you@example.com"
```

**Staging must never email him.** Guard it in code, not just config — a misrouted digest is exactly the class of mistake that costs trust:

```ts
if (env.ENVIRONMENT !== "production") {
  console.log("[digest] suppressed in", env.ENVIRONMENT);
  return;
}
```

---

## 4. D1 schema

```sql
CREATE TABLE clients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE calls (
  id              TEXT PRIMARY KEY,
  r2_key          TEXT NOT NULL UNIQUE,
  client_id       TEXT REFERENCES clients(id),
  source          TEXT NOT NULL,        -- 'android' | 'ios'
  recorded_at     TEXT,
  duration_s      INTEGER,

  stt_job_id      TEXT,
  stt_status      TEXT NOT NULL DEFAULT 'pending',
                  -- pending | submitted | transcribed | extracted | failed
  stt_error       TEXT,
  transcript      TEXT,
  language_code   TEXT,

  -- the six extracted fields
  summary         TEXT,
  key_takeaways   TEXT,                 -- JSON array
  unresolved      TEXT,                 -- JSON array (LLM output — never edited by him)
  deadline        TEXT,                 -- ISO date or NULL

  -- which prompt version produced the fields above; never null after extraction
  prompt_version  TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE todos (
  id                TEXT PRIMARY KEY,
  call_id           TEXT NOT NULL REFERENCES calls(id),
  owner             TEXT NOT NULL,      -- 'self' | 'customer'
  text              TEXT NOT NULL,
  due_date          TEXT,

  -- manual override, deliberately separate from calls.unresolved
  status            TEXT NOT NULL DEFAULT 'open',   -- open | done | snoozed
  snoozed_until     TEXT,
  completed_at      TEXT,

  customer_waiting  INTEGER NOT NULL DEFAULT 0,
  origin            TEXT NOT NULL DEFAULT 'llm',    -- 'llm' | 'manual'

  -- M1 placeholder: which later call evidenced this closing.
  -- Column exists now so M1 needs no migration against live data.
  closed_by_call_id TEXT REFERENCES calls(id),

  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE missed_deadlines (
  id          TEXT PRIMARY KEY,
  todo_id     TEXT NOT NULL REFERENCES todos(id),
  missed_on   TEXT NOT NULL,
  forgiven    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_todos_open ON todos(status, due_date);
CREATE INDEX idx_calls_client ON calls(client_id, created_at DESC);
```

Two schema points that encode earlier decisions:

`calls.unresolved` is LLM output and read-only. `todos.status` is his manual override. They never touch — that separation was decided deliberately and the schema enforces it.

`missed_deadlines.forgiven` exists so the streak reset rule stays a config choice rather than a migration. Start forgiving, tighten later.

**Sort order** (still unconfirmed with him, implemented as proposed):

```sql
ORDER BY customer_waiting DESC,
         (due_date IS NULL) ASC,
         due_date ASC,
         created_at DESC
```

---

## 5. Sarvam connectivity

The architecture note said Saaras STT. Two things have moved since that was written and both matter:

**Saaras v2.5 is deprecated.** Use `saaras:v4` on `/speech-to-text` (bumped from the originally-planned `v3` after a live test on 2026-08-21 — see the job flow note below). The old `/speech-to-text-translate` endpoint is legacy and doesn't support the `mode` parameter.

**The REST endpoint caps at 30 seconds.** Client calls are minutes long, so the pipeline must use the **Batch API** — up to 2 hours per file, up to 20 files per job, and it's the only transport offering **speaker diarization**. Diarization is not a nice-to-have here: it's what lets the extractor reliably tell "todos for customer" from "todos for self." Without it the model is guessing who committed to what.

### Job flow

Presigned URLs make this work cleanly inside a Worker — no filesystem needed, so ignore the SDK's file-path helpers and call the REST endpoints directly, streaming bytes straight from R2.

```
cron (*/15)
  └─ list R2 under INGEST_PREFIX, skip keys already in `calls`
     ├─ POST /speech-to-text/job/v1                      → job_id
     ├─ POST /speech-to-text/job/v1/upload-files         → presigned upload_urls
     ├─ PUT  <presigned url>  ← R2 object body streamed through
     └─ POST /speech-to-text/job/v1/<job_id>/start       → stt_status = 'submitted'
        (job_id is a path segment; job_parameters is echoed again in the body)

Sarvam → POST /webhooks/sarvam  (job_state: Completed)
  ├─ validate X-SARVAM-JOB-CALLBACK-TOKEN
  ├─ GET  /speech-to-text/job/v1/<job_id>/status
  │       → download_urls.<file>.json.file_url  (no separate download-files call)
  ├─ GET  <file_url> → { transcript, language_code, diarized_transcript }
  ├─ stt_status = 'transcribed'
  └─ ctx.waitUntil(extract(...))                         → §6
```

Verified live against the real API on 2026-08-21 — this supersedes an earlier draft of this flow that used a two-step `/status` → `POST /download-files` fetch and `model: "saaras:v3"`. Both were wrong: `/status` alone returns `download_urls`, and the working model id is `saaras:v4`. `job_parameters` also needs `with_timestamps: true`.

See [`src/lib/sarvam.ts`](../src/lib/sarvam.ts) for the actual implementation — `submitRecording` (job create → upload-files → presigned PUT with the `x-ms-blob-type: BlockBlob` header Azure's SAS PUT requires → start) and `fetchResult` (status → `download_urls.<file>.json.file_url` → fetch). That file is the source of truth; this doc no longer inlines a copy to avoid the two drifting apart.

### Mode selection — the thing to actually test

`SARVAM_STT_MODE` is a var precisely so you can flip it against one real recording without redeploying logic:

| Mode | Output | Trade-off |
|---|---|---|
| `codemix` | Hindi-English as spoken | Highest fidelity to what was said. Default. |
| `translate` | English only | Easier for him to skim; normalization can bend names and amounts |
| `transcribe` | Source language, native script | Devanagari in the dashboard — check font coverage (§7) |
| `verbatim` | Includes fillers | Noisier for extraction; useful for debugging a bad result |

Numbers, names, and dates carry the most risk because they feed deadline extraction directly. Test `codemix` against `translate` on one real call and compare those three field types specifically — not overall "does it read well."

**Bhashini fallback:** keep `sarvam.ts` behind a `Transcriber` interface with `submit()` and `fetchResult()`. Swapping providers then touches one file. Don't build the Bhashini path until Sarvam actually fails on his audio.

---

## 6. Claude connectivity

One call per transcript, six fields out. Forced tool use rather than "reply in JSON" — the schema is validated by the API, so a malformed response is impossible rather than merely unlikely.

```ts
// packages/core/prompt.ts
export const EXTRACTION_TOOL = {
  name: "record_call",
  description: "Record the structured outcome of a business call.",
  input_schema: {
    type: "object",
    properties: {
      summary:        { type: "string", description: "2-3 sentences, plain language." },
      key_takeaways:  { type: "array", items: { type: "string" } },
      todos_customer: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text:     { type: "string" },
            due_date: { type: "string", description: "ISO date, or empty if none stated." },
          },
          required: ["text"],
        },
      },
      todos_self:     { /* same shape */ },
      unresolved:     { type: "array", items: { type: "string" } },
      deadline:       { type: "string", description: "Single hardest deadline. Empty if none." },
    },
    required: ["summary", "key_takeaways", "todos_customer", "todos_self", "unresolved"],
  },
} as const;
```

```ts
// src/lib/extract.ts
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_call" },
    messages: [{ role: "user", content: buildUserMessage(call) }],
  }),
});

const data = await res.json();
const block = data.content.find((b) => b.type === "tool_use");
if (!block) throw new Error("no tool_use block returned");
const extraction = block.input;
```

Note: Sonnet 5 manages sampling internally and **rejects `temperature` and `top_p`**. Don't set them — the request will fail.

Feed the model the diarized transcript, not the flat one. Speaker labels are what make owner assignment reliable:

```ts
function buildUserMessage(call: Call) {
  const lines = call.diarized.entries
    .map((e) => `[${e.speaker_id === "0" ? "BUSINESS_OWNER" : "CLIENT"}] ${e.transcript}`)
    .join("\n");
  return `Call with ${call.clientName ?? "an unidentified client"} on ${call.recordedAt}.\n\n${lines}`;
}
```

Speaker 0 is not reliably him. Confirm the mapping against the first few real calls before trusting it; if it flips, detect by which speaker's number matches his own line rather than assuming index order.

System prompt principles worth holding: extract only what was actually said, never infer a deadline that wasn't stated, put ambiguity in `unresolved` rather than guessing a todo, and keep todo text in the language it was spoken. An invented todo is worse than a missing one — he'll stop trusting the list after two or three phantom entries, and the whole tool dies there.

---

## 7. Design

Grounded in his trade rather than in dashboard convention. The reference material is float glass: seen face-on it's near-colorless and cool; seen edge-on it's a deep green from the iron in the melt. That edge-green is the ink, the face is the page, and etched/frosted glass is how completion reads.

### Frontend stack

Vite + React 19, built to `dist/`, served by the Worker's `ASSETS` binding.

| Library | Why it's here |
|---|---|
| `tailwindcss` v4 + `@tailwindcss/vite` | CSS-first config. The float-glass tokens live in one `@theme` block and become utility classes automatically — no `tailwind.config.js`. |
| `motion` (`motion/react`) | The one animation library worth its weight. Layout animations and shared-element transitions are what make reordering a todo list feel considered rather than jumpy. |
| `react-router` v7 | Real URLs for `/calls/:id` and `/day/:date`, so he can bookmark a client and the back button behaves on a phone. |
| `lucide-react` | Icons. Consistent stroke weight, tree-shaken. |
| `@radix-ui/react-*` | Only when a dialog, menu, or tooltip actually appears. Accessible primitives, unstyled. Do not pull in a component kit. |

**No Next.js, no component library, no CSS-in-JS runtime.** Next.js was evaluated and reversed in §1 — it solves SSR, routing, and image optimization, and this dashboard needs none of them. A component kit (MUI, Chakra, shadcn defaults) would actively work against the design: those libraries carry their own visual opinions, and the whole point here is that the interface looks like his trade rather than like every other dashboard.

Once Tailwind is in, migrate `Dashboard.jsx` off inline styles. Inline styles were a workaround for having no compiler; Vite removes that constraint. Keep the token names identical so the migration is mechanical.

```css
/* web/src/tokens.css */
@import "tailwindcss";

@theme {
  --color-pane:   #F4F7F6;  /* page — glass seen face-on, cool not cream */
  --color-edge:   #17443C;  /* primary text, structure — float-glass edge green */
  --color-edge-2: #5F8A82;  /* secondary text, metadata */
  --color-frost:  #DBE6E2;  /* rules, borders, the completed/etched state */
  --color-putty:  #A89880;  /* glazing putty — the parked/snoozed state only */
  --color-signal: #B3261E;  /* urgency ONLY — see rule */

  --font-display: "Bricolage Grotesque", system-ui, sans-serif;
  --font-body:    "Mukta", system-ui, sans-serif;

  --radius-cut: 2px;        /* glass is cut, not moulded */
}
```

### Tokens

```css
/* web/src/tokens.css */
:root {
  /* Colour — four neutrals and one signal */
  --pane:    #F4F7F6;  /* page — glass seen face-on, cool not cream */
  --edge:    #17443C;  /* primary text, structure — float-glass edge green */
  --edge-2:  #5F8A82;  /* secondary text, metadata */
  --frost:   #DBE6E2;  /* rules, borders, the completed/etched state */
  --putty:   #A89880;  /* glazing putty — the parked/snoozed state only */
  --signal:  #B3261E;  /* urgency ONLY — see rule */

  /* Type */
  --display: "Bricolage Grotesque", system-ui, sans-serif;
  --body:    "Mukta", system-ui, sans-serif;

  --step--1: 0.833rem;
  --step-0:  1rem;
  --step-1:  1.383rem;
  --step-2:  1.917rem;
  --step-5:  5.61rem;   /* the streak number, and nothing else */

  --gap:     1.5rem;
  --radius:  2px;       /* glass is cut, not moulded */
}
```

`--putty` is a warm neutral against four cool ones, and it does exactly one job: the parked/snoozed state. Parked then reads as neither done nor urgent — its own category, which matters because parking something is a decision he makes, not a failure.

**The colour rule, which is the whole point:** `--signal` appears only when a deadline is inside 24 hours or already missed. Everywhere else the interface is neutral. If red starts showing up on a normal Tuesday the rule has been broken and the tool has become another source of anxiety — which is the specific failure mode to avoid.

### Typography

**Bricolage Grotesque** for display — variable width, slightly odd, gives the streak number real presence without reaching for a serif.

**Mukta** for body and transcripts. This is a functional requirement, not taste: transcripts are code-mixed Hindi-English and `transcribe` mode returns Devanagari. Mukta covers Devanagari and Latin in one family and was designed for exactly this pairing. A Latin-only body face will produce tofu boxes the first time a transcript comes back in Hindi.

### Layout

```
┌──────────────────────────────────────────────────┐
│  Simple Business Manager                        Thu 20 Aug     │
│                                                  │
│   ▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢▢       │  ← the wall
│   ▢▢▢▢▢▢▢▢▢▢▢▢▢▢▨▢▢▢▢▢▢▢▢▢▢▢       │
│                                                  │
│   41                        7 open · 128 closed  │
│   days nothing slipped                           │
├──────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────┐  │
│  │ Sharma Glass Works      ● customer waiting │  │
│  │ Tue 18 Aug · 6 min                         │  │
│  │ ─────────────────────────────────────────  │  │
│  │ ○ Send revised quote for toughened 12mm    │  │
│  │ ○ Confirm delivery date          21 Aug ▲  │  │
│  │ ⊘ Site measurement            parked       │  │
│  │ ▨ Share IS 2553 certificate                │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

The streak leads, above everything. Counts sit beside it, quiet. Call cards follow, grouped by client — the current working assumption, and the thing to watch him use, because if his instinct each morning turns out to be "what do I need to do today" rather than "who do I owe," this becomes a flat queue instead.

### Signature element — the wall

The streak renders as a wall of glass panes, one per day, filling left to right. A held day is a clear pane. A missed day is etched. The wall accumulates and never resets visually even when the number does — his progress stays on screen.

This is also where completion lives. A finished todo **frosts over** — background shifts to `--frost`, text to `--edge-2` — rather than striking through. It's the same principle as strikethrough (progress stays visible, nothing vanishes) expressed in the material his business actually works in. Flagging it as a change from the literal strikethrough decision: if he prefers the plainer version, it's a one-line change, but frosting is what makes the interface feel like his trade rather than a generic task app.

### Motion

Restraint is the design. Every animation below earns its place by carrying information; anything that only decorates is a bug, because this tool exists to lower his stress, not to perform at him.

| Moment | Behaviour | What it communicates |
|---|---|---|
| Todo checked | Row frosts over, 400ms ease | The satisfying beat. This is the payoff moment — give it the most weight. |
| List reorders | `motion` layout animation, 250ms | Where the item went. Without it, closing a todo makes the list jump and he loses his place. |
| Card enters | Fade + 8px rise, 40ms stagger | Order of urgency, read top to bottom. |
| Streak increments | Pane draws in, 300ms | Progress accumulating — the emotional core. |
| Route change | View Transitions API, 200ms cross-fade | Depth. Free in modern browsers, no library. |

Nothing loops, nothing pulses, nothing bounces. Spring physics are wrong here — glass doesn't bounce, and a task tracker that springs at you reads as urgent when the whole point is calm.

Wrap the lot in `prefers-reduced-motion`, and make it a real branch rather than a global `transition: none`: the frost still needs to change state instantly so completion is unambiguous.

---

## 8. GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        default: staging
        type: choice
        options: [staging, production]

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: ${{ startsWith(github.ref, 'refs/tags/') && 'production' || inputs.environment || 'staging' }}
    env:
      TARGET: ${{ startsWith(github.ref, 'refs/tags/') && 'production' || inputs.environment || 'staging' }}
    steps:
      - uses: actions/checkout@v6

      - uses: pnpm/action-setup@v4
        with: { version: 9 }

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

      - name: Apply D1 migrations
        uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          wranglerVersion: "4"
          command: d1 migrations apply sbm --env ${{ env.TARGET }} --remote

      - name: Build dashboard
        run: pnpm --filter web build          # vite → ./dist

      - name: Deploy worker
        uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          wranglerVersion: "4"
          command: deploy --env ${{ env.TARGET }}
          secrets: |
            SARVAM_API_KEY
            SARVAM_WEBHOOK_TOKEN
            ANTHROPIC_API_KEY
            RESEND_API_KEY
        env:
          SARVAM_API_KEY: ${{ secrets.SARVAM_API_KEY }}
          SARVAM_WEBHOOK_TOKEN: ${{ secrets.SARVAM_WEBHOOK_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
```

Order matters. Migrations run first, so the Worker never boots against a schema it expects but doesn't have. The Vite build runs second, because `wrangler deploy` uploads `./dist` as static assets and will cheerfully ship a stale bundle if Vite hasn't run.

One deploy step now, not two — the dashboard ships as assets inside the same Worker. Use a **GitHub Environment** named `production` with a required reviewer (you). Tag-triggered deploys then pause for approval. On a single-user tool that touches his live work, one deliberate click before prod is worth the friction.

`run_worker_first` is the part that matters: without it, static assets are matched before the Worker and `/api/calls` returns the SPA's HTML instead of JSON. `not_found_handling: "single-page-application"` makes deep links like `/calls/call_01` serve `index.html` rather than 404.

---

## 9. Build order

1. `packages/core` — schema, types, queries. Everything else depends on it.
2. Migrations applied to staging.
3. Pipeline Worker: cron scan + Sarvam submit. Drop one real recording into R2 by hand and watch a job get created.
4. Webhook handler → transcript in D1. **Stop here and read the transcript.** This is the go/no-go: if `codemix` mangles names, numbers, and dates on his actual audio, the rest of the build is premature.
5. Extraction → todos. Eyeball ten calls before trusting any of it.
6. Dashboard read-only.
7. Mark-done and snooze.
8. Digest email — to you first for a week, then to him.

---

## 10. Open items

Carried forward, plus two the scaffolding surfaced.

**Still open from before:** which phone he uses day to day (blocks the ingestion path); card sort order confirmation; grouped-by-client vs flat queue; streak reset rule.

**New — Cube ACR cannot write to R2.** This is a real gap in the locked ingestion plan. Cube ACR syncs to Google Drive and Dropbox, not to S3-compatible storage. The workable fix is **FolderSync Pro** watching Cube ACR's local recording folder and pushing to R2 over the S3 API — one paid app, configured once, then genuinely automatic. The alternative is Cube ACR → Google Drive plus a Worker that pulls Drive into R2, which adds a moving part and a second set of credentials. FolderSync is the better answer. Worth resolving alongside the phone question, since it only applies to the Android path.

**Parked for M1 — auto-detecting closures from a later call.** Match an incoming call to a client by `clients.phone`, then have the extractor check open todos for that client against the new transcript and propose closures. Deliberately not in M0: it depends on extraction accuracy nobody has measured yet, and a wrong auto-close marks work done that isn't — the exact failure the tool exists to prevent. When it does land, it should propose rather than close, and write `todos.closed_by_call_id` so every automatic closing is traceable back to the call that justified it. The column and the phone display ship now; the logic does not.

**New — outbound email has no decision yet.** Cloudflare Email Routing is inbound only, so the digest needs an external sender. **Resend** is the pick: simple API, generous free tier, DNS verification on `<businessname>.com`. Flagging it because it's a fifth vendor and it wasn't in the original architecture.

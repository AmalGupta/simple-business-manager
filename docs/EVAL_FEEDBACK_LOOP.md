# Extraction feedback loop — plan only

Nothing in this doc has been built. It designs how call-extraction quality
(`packages/core/prompts/`) is kept from drifting, and how the golden eval set
itself gets rewritten without rotting.

## Why this is needed now

State as of 2026-09-23:

- **The CI eval gate is decorative.** `evals/run.ts` prints scores but never
  exits non-zero on a regression — only a missing key or a crashed request
  fails the `eval` job in `.github/workflows/ci.yml`. A prompt edit that
  halves todo recall deploys green.
- **5 golden cases, last touched 2026-09-04 (v3/v4 era).** ACTIVE is now v6.
  Nothing records whether the goldens were re-validated against v5/v6.
- **The model isn't recorded.** `calls.prompt_version` is written on every
  extraction, but `ANTHROPIC_MODEL` is the alias `claude-sonnet-5`. If what
  the alias resolves to changes, extractions shift with no code change and no
  trace in D1.
- **No production signal.** The only todo mutations are `status` /
  `completed_at` / `snoozed_until` (`TODO_PATCH_FIELDS`). There is no way for
  him to say "this isn't a real task" or "you missed one", so a phantom todo
  and a real one look identical in the data — he just ignores the phantom.
- **Goldens get rewritten by hand, with the reason buried in prose.** See
  `golden/harphull-metaglaz-dispatch.json` `notes`: `expected.deadline` was
  changed because "the golden's error, not the model's". That was the right
  call, but nothing structural stops the wrong version of it: editing a golden
  to match whatever the model now says. That is how eval suites drift along
  with the model and stop measuring anything.

## What "drift" means here — four sources

| Source | Example | Caught by |
|---|---|---|
| Model | Alias `claude-sonnet-5` resolves to a new snapshot | Scheduled offline eval + model-id change detection |
| Prompt/code | v6 → v7, `normalizeExtraction` change, `render.ts` change | PR-time offline eval gate |
| Input | New staff/sites, more flat (non-diarized) transcripts, Sarvam output changes, new call kinds | Online monitor + harvest of corrected calls |
| Eval set | Goldens encode an outdated spec, or were edited to match the model | Golden history + lint rule |

Owner attribution is deliberately **not** a drift alarm — he corrects it
himself and it's tier 3 in `run.ts` (see the 2026-09-04 decision recorded
there). Todo existence and todo text are what the loop protects.

## The loop

```
  production extraction ──► capture (model id, prompt_version, warnings)
          │
          ▼
  his corrections in the UI ──► extraction_feedback events
          │                              │
          ▼                              ▼
  online monitor (weekly cron)     harvest → candidate goldens
  cohort metrics vs baseline              │  (Claude drafts, you correct)
          │ trips                         ▼
          └──────────────►  offline eval gate  ◄── golden set (versioned,
                           (PR + weekly schedule)    history-tracked)
                                   │ fails
                                   ▼
                           new prompt vN+1, never edit vN
```

### 1. Capture — in the Worker

- **Record the resolved model.** The Messages API response carries `model`.
  `extractCall` returns it alongside the extraction; `saveExtraction` /
  `replaceExtraction` write it to a new `calls.extraction_model`. Paired with
  `prompt_version`, every extraction becomes a traceable (prompt, model) cohort.
- **Count coercions.** `normalizeExtraction` silently repairs malformed tool
  output and drops metadata-leaked sites. Count each repair into
  `calls.extraction_warnings` (int). A rising coercion rate is the earliest
  sign that the model's instruction-following changed.
- **`extraction_feedback` table** — one row per human correction to
  LLM output, written in `queries.ts` in the same batch as the mutation it
  describes:

  ```sql
  CREATE TABLE extraction_feedback (
    id              TEXT PRIMARY KEY,
    call_id         TEXT NOT NULL REFERENCES calls(id),
    todo_id         TEXT REFERENCES todos(id),
    prompt_version  TEXT,      -- copied from calls at write time
    extraction_model TEXT,     -- ditto; cohorts survive a re-extract
    kind            TEXT NOT NULL,
      -- todo_rejected | todo_missed | todo_text_edited | todo_due_changed
      -- | site_rejected | call_type_changed | owner_changed
    before_json     TEXT,
    after_json      TEXT,
    actor_user_id   TEXT REFERENCES users(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```

- **Two new UI actions carry nearly all the signal**, both on LLM-origin
  todos in `CallDetail`:
  - **"Not a task"** → `todo_rejected` (precision). Needs a decision, see
    below — it must not become a fifth todo state by accident.
  - **"Add missed task"** on a call → inserts a todo with `origin='manual'`
    **and** a `todo_missed` event (recall). The existing voice-note
    `origin='manual'` todos (`queries.ts` ~2596) are *not* misses and must not
    be counted as one — that's why the event is explicit rather than derived
    from `origin`.
  - `site_rejected` is derived from the existing `is_confirmed = 'N'` review
    flow — write the event there, no new UI.

### 2. Online monitor — label-free, cheap

Once a day inside the existing `scheduled()` handler (gate on hour; no new
cron trigger), compute per (prompt_version, extraction_model) cohort over the
last 7 days vs the trailing 28:

| Metric | Why |
|---|---|
| todos per client call | Collapse or explosion is the main drift symptom |
| % client calls with 0 todos | Catches the flat-transcript / empty-entries class of bug |
| `call_type = 'low_signal'` share | Model reclassifying real calls as noise |
| coercion rate | Instruction-following drift (see Capture) |
| reject rate = `todo_rejected` / llm todos | Precision, from his hands |
| miss rate = `todo_missed` / calls | Recall, from his hands |
| site reject rate | Hallucinated/leaked sites |
| **new `extraction_model` value seen** | Alias moved — trigger the offline eval immediately |

Floors, not just percentages: don't alarm below ~20 calls in the window. The
volume is small, and a percentage alarm on 6 calls is noise he'll learn to
ignore, the same reason the streak metric was removed.

Result goes into an `extraction_health` row per day. It surfaces as an
admin-only home tile, neutral by default. It gets a warn color only when a
metric trips; never danger-red, which is reserved for deadlines.

### 3. Harvest — production becomes eval cases

`pnpm eval:harvest` (Node script, same pattern as `reextract-remote.ts`;
**read-only** on remote D1):

1. Pulls calls with `extraction_feedback` rows since the last harvest.
2. Builds a **candidate golden**: stored transcript entries + stored
   extraction with his corrections applied (rejected todos removed, missed
   todos added, edited text substituted).
3. Also samples **1–2 uncorrected calls per week at random.** No correction
   doesn't mean the extraction was correct; he may just have scrolled past a
   bad todo. Without this sample the golden set only ever learns from calls
   he bothered to fix.
4. Writes to `evals/candidates/*.json` with `status: "needs_review"`.

Review is the existing workflow: Claude drafts, you correct. After that,
`pnpm eval:golden promote <name>` moves it into `golden/`. Nothing enters
`golden/` without that human step. His correction proves one todo was wrong,
not that everything else in the extraction was right.

### 4. Offline gate — `run.ts` becomes a real gate

- **Exit code.** Fail when the aggregate todo F1 drops more than a tolerance
  below `evals/baseline.json`, or when any case that was perfect in the
  baseline drops.
- **Repeat to handle nondeterminism.** Sonnet 5 rejects `temperature`, so
  single runs are noisy. Run each case k=3 times and score the median. Only
  tier-1 (todo existence + text) gates; tiers 2–3 are reported only, as today.
- **Baseline is committed**, keyed by (prompt_version, model). `pnpm eval
  --update-baseline` rewrites it after an *intentional* change; that diff
  shows up in the PR.
- **Triggers:**
  - Every PR — already wired in `ci.yml`, it just starts failing properly.
  - A weekly `schedule:` workflow on `develop`. This is the only thing that
    catches model-side drift when no code changed.
  - Manually, whenever the monitor sees a new `extraction_model`.
- **Pin the judge, and test it.** The Haiku judge in `matchByJudge` can drift
  too. Add ~10 fixed (expected, actual, should-match) pairs as a judge
  self-test that runs before scoring. If the judge fails its own test, the run
  is void, not a model regression.
- **Coverage report.** Goldens carry `tags` (`diarized` / `flat`, `client` /
  `internal` / `low_signal`, `voice_memo`, `hinglish-numerals`, …). Print
  count per tag so gaps are visible: today it's 5 cases, and several
  categories have none.

## Rewriting evals

Golden files move to a versioned format (`schema: 2`). `input` and `expected`
are split, and every change is recorded:

```jsonc
{
  "schema": 2,
  "name": "harphull-metaglaz-dispatch",
  "tags": ["flat", "client", "dispatch"],
  "source": { "call_id": "…", "harvested_at": "2026-09-03" },
  "input": { "clientName": "…", "recordedAt": "…", "entries": [ … ] },
  "expected_for_tool": "v6",          // which record_call shape `expected` matches
  "expected": { "todos": [ … ], "unresolved": [ … ], "deadline": "" },
  "history": [
    { "date": "2026-09-03", "by": "amal", "kind": "created", "reason": "…" },
    { "date": "2026-09-04", "by": "amal", "kind": "golden_error",
      "reason": "deadline duplicates todo due_date; spec is to leave it empty",
      "diff": { "expected.deadline": ["2026-09-04", ""] } }
  ]
}
```

There are four ways to rewrite, each one command, and each one leaves a trace:

| Situation | Command | `history.kind` |
|---|---|---|
| The golden was wrong (mis-heard, mis-labelled) | `pnpm eval:golden amend <name> --reason …` | `golden_error` |
| You decided the product should behave differently | `amend … --kind spec_change` (usually alongside a prompt bump) | `spec_change` |
| The `record_call` tool shape changed (v6 → v7 renames/adds fields) | `pnpm eval:golden migrate --to v7` uses `v7/migrate.ts#migrateExpected` to rewrite every golden mechanically | `migrated` |
| An intentional prompt change moves scores | `pnpm eval --update-baseline` rewrites `baseline.json`, not the goldens | — |

**The guardrail is `pnpm eval:lint`, run in CI.** Any golden file changed in a
PR must add exactly one new `history` entry with a non-empty reason.
`model_disagreed` is deliberately not a valid kind. Making a failing case
pass by editing the golden then has to be justified in writing, in the diff.
That is what keeps the eval set measuring the spec instead of following the
model.

Migrating the 5 existing goldens to `schema: 2` is itself one `migrated`
entry per file. Their current `notes` prose moves into `history`.

## Phasing

| Phase | Scope | Size |
|---|---|---|
| 0 | `run.ts` exit code + `baseline.json` + k=3 median; record `extraction_model`; weekly scheduled eval workflow; judge self-test | Small, no UI, highest value — the gate starts working |
| 1 | Golden `schema: 2`, `eval:golden amend/migrate/promote`, `eval:lint` in CI, tags + coverage report | Small–medium, Node-only |
| 2 | `extraction_feedback` migration, "Not a task" + "Add missed task" UI, event writes in `queries.ts` | Medium, needs the decisions below |
| 3 | Harvest script + random sample; daily monitor + admin health tile | Medium |

Phases 0–1 need no schema change or UI change, apart from one additive
column (`calls.extraction_model`), and can ship first.

## Open decisions (yours)

1. **How "Not a task" is represented.** Options: (a) hard-delete the todo
   row, keeping only the feedback event, which leaves the four todo states
   untouched; (b) a `todos.dismissed_at` flag filtered out of every todo
   query. That is touch-heavy, but it's reversible for him. Recommendation:
   (a). It keeps the "four todo states" acceptance criterion literally
   intact, and `before_json` on the event keeps the data.
2. **Where a tripped monitor goes.** A dashboard tile only, or also a Jira
   ticket via the existing app-requests Jira path. Email is ruled out by the
   no-email-to-him guardrail anyway.
3. **Model pinning.** Pin a dated `claude-sonnet-5` snapshot, if one is
   published, so model changes only happen by deliberate bump. Or stay on the
   alias and rely on detection. Recommendation: pin, and treat a model bump
   exactly like a prompt bump: eval, then `--update-baseline`.

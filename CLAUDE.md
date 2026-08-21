@docs/BUILD_BRIEF.md
@docs/SCAFFOLDING.md

# Simple Business Manager — project context for AI coding tools

## What this app is

One deployed Cloudflare Worker on `workers.dev` that serves both the API and the dashboard for a single-user business call tracker. A recording goes in via `/upload`; Sarvam transcribes it; Claude extracts a six-field action plan; the dashboard (same origin, same URL) renders it. No app to install — the link is the product.

## Non-negotiables

- **One Worker, one origin.** No Next.js, no OpenNext, no SSR, no separate deployment for the dashboard. Static assets via the `ASSETS` binding, API on the same origin. See `docs/SCAFFOLDING.md` §1.
- **No SQL outside `packages/core/src/queries.ts`.** Every handler imports from there.
- **Secrets never in `wrangler.jsonc`.** Use `wrangler secret put`; local dev uses `.dev.vars` (gitignored, copy from `.dev.vars.example`).
- **No Cloudflare Access on this worker.** `/upload` (POST) and `/api/*` are gated by a shared `X-SBM-Key` header (`SBM_API_KEY` secret); the webhook is gated by `X-SARVAM-JOB-CALLBACK-TOKEN`. Access would break the Sarvam callback.
- **Forced tool use for extraction**, never free-text JSON. Schema in `docs/SCAFFOLDING.md` §6.
- **Prompt versioning from day one.** `calls.prompt_version` is written on every extraction; a shipped prompt version is never edited in place.
- **Dashboard fidelity.** `web/src/Dashboard.jsx` is already built and validated — mount it, don't redesign it. The four todo states, the streak grid, CSV export, and day drilldown are the acceptance criteria for any refactor (e.g. the inline-styles → Tailwind migration in Task 6).
- **Design system is fixed:** Tailwind v4, `motion`, `react-router` v7, `lucide-react`, Radix only when a dialog/menu appears. No component library (MUI/Chakra/shadcn), no second animation library. See `docs/SCAFFOLDING.md` §7 for the float-glass token palette and the rule that `--signal` (red) appears only for deadlines inside 24h or missed — never decoratively.

## Build order

Follow `docs/BUILD_BRIEF.md` "Build order" task-by-task; each task's verification must pass before starting the next. **Task 4 (webhook + transcript) is a hard checkpoint** — stop and show a real transcript before starting extraction (Task 5). The cron bucket scanner and digest email are explicitly out of scope for this milestone.

## Stack

Cloudflare Workers (TypeScript, `nodejs_compat`), D1, R2. Dashboard: Vite + React 19 in `web/`, built to `dist/`. pnpm workspaces (`packages/core` is the shared schema/types/queries package).

## Repo layout

See `docs/SCAFFOLDING.md` §1 for the full target tree. Currently scaffolded: `src/` (worker, Tasks 1-2 only), `packages/core/` (schema + types + queries), `web/` (Vite dashboard mounting the unmodified `Dashboard.jsx`), `migrations/0001_init.sql`.

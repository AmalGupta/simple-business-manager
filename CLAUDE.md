@docs/BUILD_BRIEF.md
@docs/SCAFFOLDING.md
@docs/LOCAL_PROFILE.md
@docs/DEPLOY_RUNBOOK.md

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
- **Dashboard behavioral fidelity.** The four todo states, the calendar/day drilldown, and CSV export are the acceptance criteria for any visual refactor — behavior does not change, only appearance. As of 2026-08-22 the visual theme itself is no longer frozen: it was deliberately replaced (see below), and `Dashboard.jsx` was reskinned in place, not rebuilt. The streak metric itself was removed on 2026-08-22 — see `docs/ADDITIONAL_FEATURES_M0.md` "Deferred from Phase 1": it counts missed deadlines off a signal only 2 of 11 real calls carried, so it was reading as a number he'd learn to distrust. The calendar it was paired with stays; it now lives in the dark header.
- **Design system: "control room"** (replaces the earlier float-glass green system as of 2026-08-22 — see `docs/SCAFFOLDING.md` §7 for the full rationale and token table). Tailwind v4, `motion`, `react-router` v7, `lucide-react`, Radix only when a dialog/menu appears. No component library (MUI/Chakra/shadcn), no second animation library. Colors and fonts live in `web/src/theme.css` as CSS custom properties, not hardcoded in components — that's what makes the theme swappable; the retired float-glass palette is kept there as a second, inactive theme block rather than deleted. `--color-danger` (red) still appears only for deadlines inside 24h or missed — never decoratively; that rule survived the theme change unchanged.

## Build order

Follow `docs/BUILD_BRIEF.md` "Build order" task-by-task; each task's verification must pass before starting the next. **Task 4 (webhook + transcript) is a hard checkpoint** — stop and show a real transcript before starting extraction (Task 5). The cron bucket scanner and digest email are explicitly out of scope for this milestone.

## Deploying

Follow `docs/DEPLOY_RUNBOOK.md` exactly, every time, regardless of which agent or session is doing the shipping. The single fact that governs everything in it: there is no separate staging/dev environment — `wrangler deploy` and `wrangler d1 migrations apply --remote` both hit the one live worker and database.

## Stack

Cloudflare Workers (TypeScript, `nodejs_compat`), D1, R2. Dashboard: Vite + React 19 in `web/`, built to `dist/`. pnpm workspaces (`packages/core` is the shared schema/types/queries package).

## Repo layout

See `docs/SCAFFOLDING.md` §1 for the full target tree. Currently scaffolded: `src/` (worker, Tasks 1-2 only), `packages/core/` (schema + types + queries), `web/` (Vite dashboard mounting the unmodified `Dashboard.jsx`), `migrations/0001_init.sql`.

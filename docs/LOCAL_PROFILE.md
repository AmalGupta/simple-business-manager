# LOCAL PROFILE — Claude Code prompt

Copy everything below the line into Claude Code, or `@docs/LOCAL_PROFILE.md` and say “set up and run the local profile.”

---

You are working in the Simple Business Manager repo. Set up and run a **local profile** so the worker, secrets, data, and logs all stay on this machine. Do not deploy. Do not touch remote D1/R2 or Cloudflare dashboard secrets unless I explicitly ask.

## Goal

I can open `http://localhost:8787/upload`, upload a local audio file, see the request succeed, and read worker logs in the terminal — using only local keys and local storage.

## Local profile (non-negotiable)

| Piece | Source | Rule |
|-------|--------|------|
| Secrets | `.dev.vars` (gitignored) | Never `wrangler secret put` for this work |
| Dashboard key | `web/.env` → `VITE_SBM_API_KEY` | Must match `SBM_API_KEY` in `.dev.vars` |
| D1 / R2 | Miniflare under `.wrangler/state/` | Always `--local` on D1 commands |
| Logs | stdout of `wrangler dev` | Prefer `console.log` / existing error paths; do not add a logging SaaS |
| Worker | `pnpm dev` → `wrangler dev` | Never pass `--remote` |

Remote counterparts (`d1:migrate:remote`, `wrangler deploy`, `wrangler secret put`, `wrangler dev --remote`) are a different profile. Do not mix them into these steps.

## Setup steps (do these)

1. Confirm `pnpm` is available; run `pnpm install` if needed.
2. Ensure `.dev.vars` exists (copy from `.dev.vars.example` if missing). It must include at least:
   - `SBM_API_KEY` — generate with `openssl rand -hex 32` if placeholder
   - `SARVAM_WEBHOOK_TOKEN` — same; required for Sarvam submit even locally
   - `SARVAM_API_KEY` / `ANTHROPIC_API_KEY` — real keys only if I want STT/extract; placeholders are fine for upload→R2→D1 only
3. Ensure `web/.env` exists with `VITE_SBM_API_KEY` equal to `SBM_API_KEY`. Do not print secret values in chat.
4. One-shot migrate + build: `pnpm setup:local`  
   (or separately: `pnpm d1:migrate:local` then `pnpm build`)
5. Start the worker locally: `pnpm dev` / `pnpm dev:local` (both force `--local`; leave it running — logs stay in that terminal)
6. Optional status check: `pnpm d1:calls:local`

## How I will test

- Browser: `http://localhost:8787/upload` → choose a local audio file → Upload
- Expect HTTP 202 and `Uploaded — call <uuid>`
- Optional D1 check (you run this when verifying):

```bash
npx wrangler d1 execute sbm-dev --local --command \
  "SELECT id, stt_status, stt_job_id, stt_error FROM calls ORDER BY created_at DESC LIMIT 5"
```

Statuses: `pending` → `submitted` if Sarvam accepted; `failed` + `stt_error` if submit failed. Without a public tunnel, the row will not advance to `transcribed` (Sarvam cannot callback to localhost) — that is expected; do not “fix” it by deploying.

## Optional: full STT callback on local

Only if I ask for the full pipeline: keep `pnpm dev` running and expose it with a tunnel (`cloudflared tunnel --url http://localhost:8787` or equivalent). Upload via the tunnel URL so the webhook callback origin is reachable. Still use `.dev.vars` keys and local D1/R2 — tunnel is only for inbound HTTP.

## Do not

- Deploy, create remote resources, or run remote migrations
- Commit `.dev.vars`, `web/.env`, or real secrets
- Redesign the upload page or dashboard
- Add Cloudflare Access
- Invent a second env system (no `.env.local` for the Worker — Wrangler only reads `.dev.vars`)

## When done

Report: (1) that `pnpm dev` is listening on 8787, (2) that local migrate + build succeeded, (3) which secret *names* are set in `.dev.vars` (not values), (4) how to upload and where to watch logs.

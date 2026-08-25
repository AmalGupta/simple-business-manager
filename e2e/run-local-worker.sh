#!/usr/bin/env bash
# Boots the worker for Playwright's webServer, local profile only — see
# docs/LOCAL_PROFILE.md. Never touches remote D1/R2 or deploys anything.
#
# If .dev.vars / web/.env don't exist yet, generates them exactly the way
# docs/LOCAL_PROFILE.md's setup step 2-3 describes (openssl rand secrets),
# so a fresh checkout can run `pnpm test:e2e` without a manual setup pass.
# An existing .dev.vars/web/.env (real local dev setup) is never touched.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .dev.vars ]; then
  echo "[e2e] No .dev.vars found — generating local-only secrets (see docs/LOCAL_PROFILE.md)." >&2
  cp .dev.vars.example .dev.vars
  SBM_KEY="$(openssl rand -hex 32)"
  WEBHOOK_TOKEN="$(openssl rand -hex 32)"
  PEPPER="$(openssl rand -hex 32)"
  ENC_KEY="$(openssl rand -base64 32)"
  sed -i.bak "s#^SBM_API_KEY=.*#SBM_API_KEY=${SBM_KEY}#" .dev.vars
  sed -i.bak "s#^SARVAM_WEBHOOK_TOKEN=.*#SARVAM_WEBHOOK_TOKEN=${WEBHOOK_TOKEN}#" .dev.vars
  sed -i.bak "s#^PIN_PEPPER=.*#PIN_PEPPER=${PEPPER}#" .dev.vars
  sed -i.bak "s#^PIN_ENCRYPTION_KEY=.*#PIN_ENCRYPTION_KEY=${ENC_KEY}#" .dev.vars
  rm -f .dev.vars.bak
fi

if [ ! -f web/.env ]; then
  SBM_KEY_VALUE="$(grep '^SBM_API_KEY=' .dev.vars | cut -d= -f2-)"
  echo "VITE_SBM_API_KEY=${SBM_KEY_VALUE}" > web/.env
fi

pnpm d1:migrate:local
pnpm build

exec pnpm dev:local

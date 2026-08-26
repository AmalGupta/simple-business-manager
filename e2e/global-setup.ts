// Runs once after Playwright's webServer is up, before any test. Seeds the
// one admin account the login/dashboard specs need via the same
// POST /api/admin/users bootstrap path docs/SCAFFOLDING.md §6 describes
// (X-SBM-Key gated, no session required) — nothing here talks to remote
// Cloudflare resources.
import { sbmApiKey } from "./fixtures/dev-vars";
import { TEST_ADMIN } from "./fixtures/test-data";

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.SBM_E2E_BASE_URL ?? "http://localhost:8787";

  const res = await fetch(`${baseURL}/api/admin/users`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": sbmApiKey() },
    body: JSON.stringify(TEST_ADMIN),
  });

  // 201 = freshly created, 409 = already exists from a previous run — both
  // leave us with a usable account. Anything else is a real setup failure.
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`[e2e] failed to seed admin user: ${res.status} ${await res.text()}`);
  }
}

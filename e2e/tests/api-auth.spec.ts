import { test, expect } from "@playwright/test";
import { sbmApiKey } from "../fixtures/dev-vars";
import { TEST_ADMIN } from "../fixtures/test-data";

// docs/BUILD_BRIEF.md: "No Cloudflare Access on this worker" — /upload (POST)
// and /api/* are gated by the shared X-SBM-Key header instead. These tests
// pin that gate at the HTTP level, independent of the dashboard UI.
test.describe("X-SBM-Key gate", () => {
  test("GET /api/calls without the header is rejected", async ({ request }) => {
    const res = await request.get("/api/calls");
    expect(res.status()).toBe(401);
  });

  test("GET /api/calls with the wrong key is rejected", async ({ request }) => {
    const res = await request.get("/api/calls", { headers: { "X-SBM-Key": "not-the-real-key" } });
    expect(res.status()).toBe(401);
  });

  test("GET /api/calls with the correct key succeeds for a logged-in session", async ({ request }) => {
    // handleGetCalls (src/handlers/api.ts) additionally requires an
    // admin/superadmin session cookie on top of the X-SBM-Key header — log
    // in first so the request context picks up that cookie.
    const login = await request.post("/api/login", { data: TEST_ADMIN });
    expect(login.status()).toBe(200);

    const res = await request.get("/api/calls", { headers: { "X-SBM-Key": sbmApiKey() } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ items: expect.any(Array), total: expect.any(Number) });
  });

  test("GET /api/calls with the correct key but no session is still rejected", async ({ request }) => {
    const res = await request.get("/api/calls", { headers: { "X-SBM-Key": sbmApiKey() } });
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/todos/:id without the header is rejected before touching the row", async ({ request }) => {
    const res = await request.patch("/api/todos/does-not-exist", {
      headers: { "content-type": "application/json" },
      data: { status: "done" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /upload without the header is rejected", async ({ request }) => {
    const res = await request.post("/upload", { multipart: {} });
    expect(res.status()).toBe(401);
  });
});

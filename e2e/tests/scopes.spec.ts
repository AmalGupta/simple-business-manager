import { test, expect } from "@playwright/test";
import { sbmApiKey } from "../fixtures/dev-vars";
import { TEST_ADMIN } from "../fixtures/test-data";

// SBM-81 — an admin viewing a staff member's dashboard (X-SBM-View-As) is
// read-only unless Manage scopes says otherwise; their own dashboard is not.
test.describe.configure({ mode: "serial" });

const KEY = "staff.assigned_work.act";
const WORK_PATH = "/api/work/todo/does-not-exist";

test("view-as scopes: default read-only, grant, override, reset", async ({ request }) => {
  const headers = { "content-type": "application/json", "X-SBM-Key": sbmApiKey() };
  const login = await request.post("/api/login", { data: TEST_ADMIN });
  expect(login.status()).toBe(200);

  const me = await (await request.get("/api/me", { headers })).json();
  expect(me.scopes[KEY]).toBe("read");

  // A staff member to "view as".
  const staffName = `Scope Staff ${Date.now()}`;
  const created = await request.post("/api/staff", { headers, data: { name: staffName } });
  expect(created.status()).toBeLessThan(300);
  const staffId = (await created.json()).id as string;

  const patch = (viewAs: string | null) =>
    request.patch(WORK_PATH, {
      headers: viewAs ? { ...headers, "X-SBM-View-As": viewAs } : headers,
      data: { status: "done" },
    });

  // 1. Default: blocked in view-as, not blocked on the admin's own dashboard.
  const blocked = await patch(staffId);
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error).toBe("read_only");
  expect((await patch(null)).status()).not.toBe(403);
  // Viewing yourself is not view-as.
  expect((await patch(me.id)).status()).not.toBe(403);

  // 2. Role grant → write unblocks it.
  const grant = await request.put(`/api/maintenance/scopes/roles/admin/${KEY}`, { headers, data: { level: "write" } });
  expect(grant.status()).toBe(200);
  expect((await patch(staffId)).status()).not.toBe(403);
  expect((await (await request.get("/api/me", { headers })).json()).scopes[KEY]).toBe("write");

  // 3. Per-user override beats the role grant.
  const ov = await request.put(`/api/maintenance/scopes/users/${me.id}/${KEY}`, { headers, data: { level: "read" } });
  expect(ov.status()).toBe(200);
  expect((await patch(staffId)).status()).toBe(403);

  // 4. Hiding the page hides its actions and the page's own reads.
  await request.put(`/api/maintenance/scopes/users/${me.id}/staff.assigned_work`, { headers, data: { level: "none" } });
  await request.put(`/api/maintenance/scopes/users/${me.id}/${KEY}`, { headers, data: { level: "write" } });
  expect((await patch(staffId)).status()).toBe(403);
  expect((await request.get("/api/work/assigned", { headers: { ...headers, "X-SBM-View-As": staffId } })).status()).toBe(403);

  // 5. Validation.
  expect((await request.put(`/api/maintenance/scopes/roles/admin/nope`, { headers, data: { level: "write" } })).status()).toBe(400);
  expect((await request.put(`/api/maintenance/scopes/roles/admin/${KEY}`, { headers, data: { level: "root" } })).status()).toBe(400);

  // Cleanup back to defaults.
  await request.delete(`/api/maintenance/scopes/users/${me.id}/${KEY}`, { headers });
  await request.delete(`/api/maintenance/scopes/users/${me.id}/staff.assigned_work`, { headers });
  await request.delete(`/api/maintenance/scopes/roles/admin/${KEY}`, { headers });
  expect((await patch(staffId)).status()).toBe(403);
});

test("scopes management requires an admin session", async ({ request }) => {
  const res = await request.get("/api/maintenance/scopes");
  expect(res.status()).toBe(401);
});

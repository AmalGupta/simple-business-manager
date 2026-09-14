import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";
import { sbmApiKey } from "../fixtures/dev-vars";
import { TEST_ADMIN } from "../fixtures/test-data";

test.describe("Contacts directory", () => {
  test("bookmark tabs, unsaved/saved buckets, type edit, bucket API", async ({ page }) => {
    await loginAsAdmin(page);

    const unique = `E2E Contact ${Date.now()}`;
    const phone = `9${String(Date.now()).slice(-9)}`;

    const create = await page.request.post("/api/callers", {
      data: { name: unique, phone, category: "client" },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();

    const unsavedList = await page.request.get("/api/callers?bucket=unsaved&q=" + encodeURIComponent(unique));
    expect(unsavedList.status()).toBe(200);
    const unsavedBody = await unsavedList.json();
    expect(unsavedBody.items.some((c: { id: string }) => c.id === created.id)).toBe(true);
    expect(unsavedBody.bucket_counts).toBeTruthy();

    const siteRes = await page.request.post("/api/sites", {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { name: `E2E Contacts Site ${Date.now()}` },
    });
    expect(siteRes.status()).toBe(201);
    const site = await siteRes.json();

    const link = await page.request.post(`/api/sites/${site.id}/contacts`, {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { caller_ids: [created.id] },
    });
    expect(link.status()).toBe(201);

    const savedList = await page.request.get("/api/callers?bucket=saved&q=" + encodeURIComponent(unique));
    expect(savedList.status()).toBe(200);
    const savedBody = await savedList.json();
    expect(savedBody.items.some((c: { id: string }) => c.id === created.id)).toBe(true);

    await page.getByRole("button", { name: /Contacts —/i }).click();
    await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();

    const tabs = page.getByRole("tablist", { name: "Contact lists" });
    await expect(tabs.getByRole("tab", { name: /Saved contacts/i })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /Unsaved contacts/i })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /^Spam/i })).toBeVisible();

    await tabs.getByRole("tab", { name: /Saved contacts/i }).click();
    await expect(page.getByText(unique)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(phone)).toBeVisible();

    await page.getByLabel(`Type for ${unique}`).selectOption("staff");

    const listed = await page.request.get("/api/callers?category=staff&q=" + encodeURIComponent(unique));
    expect(listed.status()).toBe(200);
    const body = await listed.json();
    expect(body.items.some((c: { id: string; category: string }) => c.id === created.id && c.category === "staff")).toBe(
      true
    );

    await page.request.patch(`/api/callers/${created.id}`, { data: { category: "spam" } });
  });

  test("account menu remains reachable from contacts view", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: /Contacts —/i }).click();
    await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Back/i }).click();
    await page.getByRole("button", { name: new RegExp(TEST_ADMIN.name) }).click();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  });
});

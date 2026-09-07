import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";
import { TEST_ADMIN } from "../fixtures/test-data";

test.describe("Callers directory", () => {
  test("table with type filters, phone column; client/staff not skipped by API contract", async ({ page }) => {
    await loginAsAdmin(page);

    const unique = `E2E Caller ${Date.now()}`;
    const phone = `9${String(Date.now()).slice(-9)}`;

    const create = await page.request.post("/api/callers", {
      data: { name: unique, phone, category: "client" },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();

    await page.getByRole("button", { name: /Callers —/i }).click();
    await expect(page.getByRole("heading", { name: "Callers", exact: true })).toBeVisible();

    const tabs = page.getByRole("tablist", { name: "Caller type" });
    await expect(tabs.getByRole("tab", { name: /Spam/i })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /Client/i })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /Family/i })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /Staff/i })).toBeVisible();

    await tabs.getByRole("tab", { name: /Client/i }).click();
    const table = page.getByRole("region", { name: "Callers table" });
    await expect(table.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Phone" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Type" })).toBeVisible();
    await expect(table.getByText(unique)).toBeVisible();
    await expect(table.getByText(phone)).toBeVisible();

    // Reclassify to staff — still a processable category (not family/spam).
    await table.getByLabel(`Type for ${unique}`).selectOption("staff");
    await tabs.getByRole("tab", { name: /Staff/i }).click();
    await expect(page.getByText(unique)).toBeVisible();

    const listed = await page.request.get("/api/callers?category=staff");
    expect(listed.status()).toBe(200);
    const body = await listed.json();
    expect(body.items.some((c) => c.id === created.id && c.category === "staff")).toBe(true);

    // Cleanup: mark spam so it leaves the staff/client filters for later runs
    await page.request.patch(`/api/callers/${created.id}`, { data: { category: "spam" } });
  });

  test("account menu remains reachable from callers view", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: /Callers —/i }).click();
    await expect(page.getByRole("heading", { name: "Callers", exact: true })).toBeVisible();
    // Callers view has no AppHeader — back to home for account menu
    await page.getByRole("button", { name: /Back/i }).click();
    await page.getByRole("button", { name: new RegExp(TEST_ADMIN.name) }).click();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
  });
});

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";
import { openCallsWithMockedRows } from "../fixtures/calls-grid";
import { TEST_ADMIN } from "../fixtures/test-data";
import { sbmApiKey } from "../fixtures/dev-vars";

async function openSiteCustomization(page) {
  await page.getByRole("button", { name: new RegExp(TEST_ADMIN.name) }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Site customization" }).click();
}

test.describe("Customization smoke", () => {
  test("admin Site customization defaults off; toggle persists via API", async ({ page }) => {
    await loginAsAdmin(page);
    await page.request.patch("/api/me/customization", {
      data: { inner_scrolls: false, horizontal_scrolls: false },
    });
    await page.reload();
    await expect(page.getByText("Simple Business Manager")).toBeVisible();

    await expect(page.getByRole("button", { name: "Customization" })).toHaveCount(0);

    await openSiteCustomization(page);
    const inner = page.getByLabel("Vertical scroll");
    const horiz = page.getByLabel("Horizontal scroll");
    await expect(inner).not.toBeChecked();
    await expect(horiz).not.toBeChecked();

    await expect(page.locator("[data-inner-scrolls='0']").first()).toBeVisible();
    await expect(page.locator("[data-horizontal-scrolls='0']").first()).toBeVisible();

    await inner.check();
    await expect(inner).toBeChecked();
    await expect(page.locator("[data-inner-scrolls='1']").first()).toBeVisible();

    const meAfter = await page.request.get("/api/me");
    expect(meAfter.status()).toBe(200);
    expect(await meAfter.json()).toMatchObject({
      customization: { inner_scrolls: true, horizontal_scrolls: false },
    });

    // Persist across full reload
    await page.reload();
    await expect(page.getByText("Simple Business Manager")).toBeVisible();
    await openSiteCustomization(page);
    await expect(page.getByLabel("Vertical scroll")).toBeChecked();
    await expect(page.getByLabel("Horizontal scroll")).not.toBeChecked();

    // Reset for later tests
    await page.getByLabel("Vertical scroll").uncheck();
    await expect(page.getByLabel("Vertical scroll")).not.toBeChecked();
  });

  test("Sites directory grid keeps its height when inner_scrolls is on", async ({ page }) => {
    await loginAsAdmin(page);
    // POST /api/sites creates the site already confirmed, so the "N confirmed
    // sites" rollup is there however the shared local D1 happens to be seeded.
    // The route is key-gated (isAuthorized), not session-gated.
    const seeded = await page.request.post("/api/sites", {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { name: `E2E Directory Site ${Date.now()}` },
    });
    expect(seeded.ok()).toBeTruthy();
    await page.request.patch("/api/me/customization", {
      data: { inner_scrolls: true, horizontal_scrolls: false },
    });
    await page.reload();
    await expect(page.getByText("Simple Business Manager")).toBeVisible();

    // Anchored on the count so it can't match "Show unconfirmed sites".
    const rollup = page.getByRole("button", { name: /^\d+ confirmed sites?/ });
    await expect(rollup).toBeVisible();
    await rollup.click();
    await expect(page.getByRole("heading", { name: "Sites", exact: true })).toBeVisible();

    /* The regression: with inner_scrolls on the grid resolved its height:100%
       against a parent sitting at content height, collapsed to 2px, and the
       screen showed the filter bar with nothing under it. */
    await expect(page.locator(".ag-row").first()).toBeVisible();
    const height = await page.locator(".sbm-sites-grid").evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThan(200);

    await page.request.patch("/api/me/customization", {
      data: { inner_scrolls: false, horizontal_scrolls: false },
    });
  });

  test("Calls grid page-scrolls when inner_scrolls is off", async ({ page }) => {
    const grid = await openCallsWithMockedRows(page, 40);
    await page.request.patch("/api/me/customization", {
      data: { inner_scrolls: false, horizontal_scrolls: false },
    });
    await page.reload();
    await page.getByRole("button", { name: /Calls logged/i }).click();
    await expect(page.getByRole("heading", { name: "Calls", exact: true })).toBeVisible();
    await expect(grid).toBeVisible();
    await expect(page.locator(".sbm-fill-viewport")).toHaveCount(0);
    await expect(page.locator("[data-inner-scrolls='0']").first()).toBeVisible();
  });
});

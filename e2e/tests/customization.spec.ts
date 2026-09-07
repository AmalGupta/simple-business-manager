import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";
import { openCallsWithMockedRows } from "../fixtures/calls-grid";
import { TEST_ADMIN } from "../fixtures/test-data";

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

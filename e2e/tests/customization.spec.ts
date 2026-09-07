import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";
import { openCallsWithMockedRows } from "../fixtures/calls-grid";

test.describe("Customization smoke", () => {
  test("admin Customization defaults off; toggle persists via API", async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByRole("button", { name: "Customization" })).toBeVisible();
    await page.getByRole("button", { name: "Customization" }).click();
    await expect(page.getByRole("heading", { name: "Customization" })).toBeVisible();

    const inner = page.getByLabel("Scroll inside cards & table");
    const horiz = page.getByLabel("Scroll sideways for wide content");
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

    // Persist across full reload (view resets to home)
    await page.reload();
    await expect(page.getByText("Simple Business Manager")).toBeVisible();
    await page.getByRole("button", { name: "Customization" }).click();
    await expect(page.getByLabel("Scroll inside cards & table")).toBeChecked();
    await expect(page.getByLabel("Scroll sideways for wide content")).not.toBeChecked();

    // Reset for later tests
    await page.getByLabel("Scroll inside cards & table").uncheck();
    await expect(page.getByLabel("Scroll inside cards & table")).not.toBeChecked();
  });

  test("Calls grid page-scrolls when inner_scrolls is off", async ({ page }) => {
    // openCallsWithMockedRows logs in; set prefs after login via API on its page
    const grid = await openCallsWithMockedRows(page, 40);
    await page.request.patch("/api/me/customization", {
      data: { inner_scrolls: false, horizontal_scrolls: false },
    });
    await page.reload();
    // Re-open Calls after reload (mock routes still active)
    await page.getByRole("button", { name: /Calls logged/i }).click();
    await expect(page.getByRole("heading", { name: "Calls", exact: true })).toBeVisible();
    await expect(grid).toBeVisible();
    await expect(page.locator(".sbm-fill-viewport")).toHaveCount(0);
    await expect(page.locator("[data-inner-scrolls='0']").first()).toBeVisible();
  });
});

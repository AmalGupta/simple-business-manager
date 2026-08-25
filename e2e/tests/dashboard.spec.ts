import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";
import { TEST_ADMIN } from "../fixtures/test-data";

// Post-login dashboard shell (web/src/Dashboard.jsx SimpleBusinessManager).
// A fresh local D1 has no calls, so these tests exercise the shell, the
// account menu, and the EmptyState rather than call-card content.
test.describe("Dashboard shell", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("renders the header, stat tiles, and empty state", async ({ page }) => {
    await expect(page.getByText("open today")).toBeVisible();
    await expect(page.getByText("closed today")).toBeVisible();

    // No calls seeded for this admin yet — EmptyState (web/src/Dashboard.jsx).
    await expect(page.getByText("Nothing recorded yet")).toBeVisible();
  });

  test("account menu opens and shows the logged-in user's actions", async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(TEST_ADMIN.name) }).click();

    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Update phone" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Reset PIN" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Log out" })).toBeVisible();
  });

  test("Reset PIN opens a dialog that can be cancelled without changes", async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(TEST_ADMIN.name) }).click();
    await page.getByRole("menuitem", { name: "Reset PIN" }).click();

    const dialog = page.getByRole("dialog", { name: "Reset PIN" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholder("Current PIN")).toBeVisible();
    await expect(dialog.getByPlaceholder("New PIN (4-6 digits)")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("logging out returns to the login screen", async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(TEST_ADMIN.name) }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();

    await expect(page.getByPlaceholder("Name")).toBeVisible();
    await expect(page.getByPlaceholder("PIN")).toBeVisible();

    // The session cookie is really gone, not just a client-side view flip.
    const me = await page.request.get("/api/me");
    expect(me.status()).toBe(401);
  });
});

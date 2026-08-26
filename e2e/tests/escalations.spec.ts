import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";

// EscalationsTile (web/src/Dashboard.jsx) — the one home-tile write path
// that doesn't need a call/todo to already exist, so it's a clean end-to-end
// check of POST/PATCH /api/escalations round-tripping through local D1.
test.describe("Escalations tile", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("adding and closing an escalation persists across reload", async ({ page }) => {
    const text = `E2E escalation ${Date.now()}`;

    await page.getByRole("button", { name: "Add escalation" }).click();
    await page.getByPlaceholder("What needs attention?").fill(text);
    await page.getByRole("button", { name: "Add" }).click();

    const row = page.getByText(text);
    await expect(row).toBeVisible();

    await page.reload();
    await expect(page.getByText(text)).toBeVisible();

    await page.getByRole("button", { name: `Close: ${text}` }).click();
    await expect(page.getByText(text)).not.toBeVisible();

    await page.reload();
    await expect(page.getByText(text)).not.toBeVisible();
  });

  test("the Add button is disabled for blank text", async ({ page }) => {
    await page.getByRole("button", { name: "Add escalation" }).click();
    await expect(page.getByRole("button", { name: "Add" })).toBeDisabled();
  });
});

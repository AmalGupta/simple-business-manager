import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";

/* SBM-106 — admin left nav, full-width dark header, and My pages.
   Runs against the local profile (docs/LOCAL_PROFILE.md). */

test.describe("admin nav and My pages (SBM-106)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("dark header spans the full width and the nav runs full height", async ({ page }) => {
    await loginAsAdmin(page);
    // The dark bar is the element carrying the ink background; it should span the viewport width.
    const bar = await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll("body div"))) {
        const cs = getComputedStyle(el);
        if (cs.backgroundColor === "rgb(20, 24, 31)" && el.querySelector("header")) {
          const r = el.getBoundingClientRect();
          return { width: r.width, left: r.left };
        }
      }
      return null;
    });
    expect(bar).not.toBeNull();
    expect(bar!.width).toBeGreaterThanOrEqual(1400);
    expect(bar!.left).toBeLessThan(5);

    const nav = page.getByRole("navigation", { name: "Admin navigation" });
    await expect(nav).toBeVisible();
    const navBox = await nav.boundingBox();
    expect(navBox?.x ?? 99).toBeLessThan(5);
    expect(navBox?.height ?? 0).toBeGreaterThanOrEqual(600);
  });

  test("create a page from the nav and open it", async ({ page }) => {
    await loginAsAdmin(page);
    const nav = page.getByRole("navigation", { name: "Admin navigation" });
    await nav.getByRole("button", { name: "New page" }).click();

    const name = `Monday ${Date.now().toString(36)}`;
    await page.getByRole("textbox").first().fill(name);
    await page.getByRole("checkbox", { name: "Roster" }).check();
    await page.getByRole("checkbox", { name: "Task audit" }).check();
    await page.getByRole("button", { name: "Save page" }).click();

    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(nav.getByRole("button", { name })).toBeVisible();
    await expect(page.locator("button", { hasText: "Roster" }).last()).toBeVisible();
    const card = page.locator("button", { hasText: "Task audit" }).last();
    await expect(card).toBeVisible();

    // Opening a view from the page returns to the page on Back.
    await card.click();
    await page.getByRole("button", { name: "Back", exact: true }).first().click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  });
});

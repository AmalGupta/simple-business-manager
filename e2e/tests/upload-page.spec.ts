import { test, expect } from "@playwright/test";

// GET /upload — plain server-rendered HTML, no build step, no auth (a phone
// browser can't set custom headers on a plain navigation). See
// src/handlers/upload.ts and docs/BUILD_BRIEF.md Task 2.
test.describe("GET /upload", () => {
  test("loads without authentication and is mobile-ready", async ({ page }) => {
    const response = await page.goto("/upload");
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(/Simple Business Manager — Upload/);

    // docs/BUILD_BRIEF.md: "test at 360px width before calling any task
    // done" — the viewport meta tag is what makes that meaningful on a phone.
    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toHaveAttribute("content", /width=device-width/);
  });

  test("has a file input and submit button", async ({ page }) => {
    await page.goto("/upload");

    const fileInput = page.locator('input[type="file"][name="recording"]');
    await expect(fileInput).toBeAttached();
    await expect(fileInput).toHaveAttribute("accept", /audio/);

    await expect(page.getByRole("button", { name: "Upload" })).toBeVisible();
  });

  test("shows the total-insights stat tiles", async ({ page }) => {
    await page.goto("/upload");
    // statTile() in src/handlers/upload.ts always renders exactly 4 tiles.
    await expect(page.locator(".stat")).toHaveCount(4);
  });

  test("links to the dashboard", async ({ page }) => {
    await page.goto("/upload");
    const link = page.getByRole("link", { name: /View the full dashboard/ });
    await expect(link).toHaveAttribute("href", "/");
  });

  test("submitting without a file is blocked client-side", async ({ page }) => {
    await page.goto("/upload");
    // The file input is `required`; clicking Upload with nothing chosen
    // must not fire the fetch() (no "Uploading…" status text).
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.locator("#status")).toHaveText("");
  });
});

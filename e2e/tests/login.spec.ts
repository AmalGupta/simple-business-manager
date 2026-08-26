import { test, expect } from "@playwright/test";
import { TEST_ADMIN } from "../fixtures/test-data";

// LoginScreen — web/src/Dashboard.jsx. Shown in place of the whole
// dashboard until GET /api/me succeeds (src/handlers/auth.ts). Each test
// starts with a fresh, cookie-less context (Playwright default).
test.describe("Login", () => {
  test("logged-out visitors see the login form, not the dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByPlaceholder("Name")).toBeVisible();
    await expect(page.getByPlaceholder("PIN")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("submitting with empty fields shows a validation error and does not call the API", async ({ page }) => {
    await page.goto("/");
    let loginCalled = false;
    await page.route("**/api/login", (route) => {
      loginCalled = true;
      return route.continue();
    });

    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Enter your name and PIN.")).toBeVisible();
    expect(loginCalled).toBe(false);
  });

  test("wrong PIN is rejected with an error, and the form stays up", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Name").fill(TEST_ADMIN.name);
    await page.getByPlaceholder("PIN").fill("000000");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("invalid name or pin")).toBeVisible();
    await expect(page.getByPlaceholder("Name")).toBeVisible();
  });

  test("unknown user is rejected the same way (no user enumeration)", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Name").fill("Someone Who Does Not Exist");
    await page.getByPlaceholder("PIN").fill("123456");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("invalid name or pin")).toBeVisible();
  });

  test("correct name and PIN reach the dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Name").fill(TEST_ADMIN.name);
    await page.getByPlaceholder("PIN").fill(TEST_ADMIN.pin);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("Simple Business Manager")).toBeVisible();
    // AccountMenu renders the logged-in user's name — see web/src/Dashboard.jsx.
    await expect(page.getByRole("button", { name: new RegExp(TEST_ADMIN.name) })).toBeVisible();
  });
});

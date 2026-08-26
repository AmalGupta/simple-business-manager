import { expect, type Page } from "@playwright/test";
import { TEST_ADMIN } from "./test-data";

/** Drives the real LoginScreen UI (web/src/Dashboard.jsx) rather than
 *  injecting a session cookie, so the login flow itself stays covered on
 *  every test that needs an authenticated dashboard. */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByPlaceholder("Name").fill(TEST_ADMIN.name);
  await page.getByPlaceholder("PIN").fill(TEST_ADMIN.pin);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Simple Business Manager")).toBeVisible();
}

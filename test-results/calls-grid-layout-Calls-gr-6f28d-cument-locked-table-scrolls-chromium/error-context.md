# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: calls-grid-layout.spec.ts >> Calls grid desktop vs mobile layout >> mobile: no summary column, document locked, table scrolls
- Location: e2e/tests/calls-grid-layout.spec.ts:48:3

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByPlaceholder('Name')

```

# Test source

```ts
  1  | import { expect, type Page } from "@playwright/test";
  2  | import { TEST_ADMIN } from "./test-data";
  3  | 
  4  | /** Drives the real LoginScreen UI (web/src/Dashboard.jsx) rather than
  5  |  *  injecting a session cookie, so the login flow itself stays covered on
  6  |  *  every test that needs an authenticated dashboard. */
  7  | export async function loginAsAdmin(page: Page): Promise<void> {
  8  |   await page.goto("/");
> 9  |   await page.getByPlaceholder("Name").fill(TEST_ADMIN.name);
     |                                       ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  10 |   await page.getByPlaceholder("PIN").fill(TEST_ADMIN.pin);
  11 |   await page.getByRole("button", { name: "Log in" }).click();
  12 |   await expect(page.getByText("Simple Business Manager")).toBeVisible();
  13 | }
  14 | 
```
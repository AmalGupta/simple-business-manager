# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: calls-mobile-scroll.spec.ts >> Calls page mobile scroll (Android Chrome) >> table scrolls; document stays locked after hitting the last row
- Location: e2e/tests/calls-mobile-scroll.spec.ts:116:3

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
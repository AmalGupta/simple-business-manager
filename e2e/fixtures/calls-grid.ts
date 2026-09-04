import { expect, type Locator, type Page } from "@playwright/test";
import { loginAsAdmin } from "./login";

/** Enough lean call rows for the Calls grid to page + scroll. */
export function fakeCalls(count = 40) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const iso = new Date(now - i * 3600_000).toISOString();
    return {
      id: `e2e-call-${i}`,
      client_name: i % 3 === 0 ? "Site crew" : `Caller ${i + 1}`,
      client_phone: null,
      recorded_at: iso,
      recording_date: iso,
      duration_s: 120,
      source: i % 4 === 0 ? "ios" : "drive",
      customer_waiting: 0,
      call_type: i % 5 === 0 ? "low_signal" : "client",
      recorded_for_site_id: i % 4 === 0 ? `site-${i}` : null,
      sites: [],
      deadline: null,
      summary: `Summary for call ${i + 1}`,
      key_takeaways: [],
      commitments: [],
      unresolved: [],
      material_needs: [],
      transcript: null,
      has_transcript: false,
      todos: [],
    };
  });
}

export async function openCallsWithMockedRows(page: Page, count = 40): Promise<Locator> {
  const calls = fakeCalls(count);
  await page.route(/\/api\/calls(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const url = route.request().url();
    if (!url.includes("include_low_signal=1") && !url.endsWith("/api/calls") && !url.includes("/api/calls?")) {
      return route.continue();
    }
    if (url.includes("include_low_signal=1")) {
      const limit = Number(new URL(url).searchParams.get("limit") ?? "50");
      const cursor = new URL(url).searchParams.get("cursor");
      const cursorMatch = cursor?.match(/e2e-cursor-(\d+)/);
      const start = cursorMatch ? Number(cursorMatch[1]) : 0;
      const slice = calls.slice(start, start + limit);
      const nextStart = start + limit;
      const hasMore = nextStart < calls.length;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: slice,
          total: calls.length,
          next_cursor: hasMore ? `e2e-cursor-${nextStart}` : null,
          has_more: hasMore,
        }),
      });
      return;
    }
    return route.continue();
  });
  await page.route("**/api/calls/callers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(["Caller 1", "Site crew"]),
    });
  });
  await page.route("**/api/calls/count", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: calls.length }),
    });
  });

  await loginAsAdmin(page);
  await page.getByRole("button", { name: /Calls logged/i }).click();
  await expect(page.getByRole("heading", { name: "Calls", exact: true })).toBeVisible();
  await expect(page.getByText("Call / Voice Note Logs")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".ag-grid-viewport")).toBeVisible();
  return page.locator(".ag-grid-viewport");
}

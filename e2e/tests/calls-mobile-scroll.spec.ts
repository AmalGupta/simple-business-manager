import { test, expect, devices } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";

test.use({
  ...devices["Pixel 7"],
  hasTouch: true,
  isMobile: true,
});

/** Enough lean call rows for the Calls grid to page + scroll on mobile. */
function fakeCalls(count = 40) {
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

async function openCallsWithMockedRows(page) {
  const calls = fakeCalls(40);
  await page.route(/\/api\/calls(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const url = route.request().url();
    // Lean archive list used by home — leave alone.
    if (!url.includes("include_low_signal=1") && !url.endsWith("/api/calls") && !url.includes("/api/calls?")) {
      return route.continue();
    }
    // Dashboard grid fetch.
    if (url.includes("include_low_signal=1")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(calls),
      });
      return;
    }
    return route.continue();
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

/** Drag vertically inside an element (Chrome Android touch path). */
async function touchDrag(page, locator, { fromY, toY, steps = 12 }) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box for scroller");
  const x = box.x + box.width / 2;
  const startY = box.y + fromY;
  const endY = box.y + toY;
  await page.evaluate(
    ({ sel, clientX, y0, y1, stepCount }) => {
      const target = document.querySelector(sel);
      if (!target) throw new Error("scroller missing");
      const fire = (type, clientY) => {
        const touch = new Touch({ identifier: 1, target, clientX, clientY });
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === "touchend" ? [] : [touch],
            changedTouches: [touch],
          })
        );
      };
      fire("touchstart", y0);
      for (let i = 1; i <= stepCount; i++) {
        const y = y0 + ((y1 - y0) * i) / stepCount;
        fire("touchmove", y);
      }
      fire("touchend", y1);
    },
    {
      sel: ".ag-grid-viewport",
      clientX: x,
      y0: startY,
      y1: endY,
      stepCount: steps,
    }
  );
}

test.describe("Calls page mobile scroll (Android Chrome)", () => {
  test("table scrolls; document stays locked after hitting the last row", async ({ page }) => {
    const viewport = await openCallsWithMockedRows(page);

    const docScrollBefore = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
      bodyTop: document.body.style.top,
      bodyPos: document.body.style.position,
    }));
    expect(docScrollBefore.y).toBe(0);
    expect(docScrollBefore.bodyPos).toBe("fixed");

    const maxScroll = await viewport.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(maxScroll).toBeGreaterThan(20);

    await viewport.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const atBottom = await viewport.evaluate((el) => ({
      scrollTop: el.scrollTop,
      max: el.scrollHeight - el.clientHeight,
    }));
    expect(atBottom.scrollTop).toBeGreaterThanOrEqual(atBottom.max - 2);

    // Overscroll attempt at bottom (finger up again) must not unlock the page.
    await touchDrag(page, viewport, { fromY: 200, toY: 40 });

    const docAfterOverscroll = await page.evaluate(() => ({
      y: window.scrollY,
      bodyPos: getComputedStyle(document.body).position,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
    }));
    expect(docAfterOverscroll.y).toBe(0);
    expect(docAfterOverscroll.bodyPos).toBe("fixed");
    expect(docAfterOverscroll.htmlOverflow).toMatch(/hidden/);

    // Scroll back up — table moves, document still does not.
    const beforeUp = await viewport.evaluate((el) => el.scrollTop);
    await viewport.evaluate((el) => {
      el.scrollTop = Math.max(0, el.scrollTop - 180);
    });
    const afterUp = await viewport.evaluate((el) => el.scrollTop);
    expect(afterUp).toBeLessThan(beforeUp);

    const docAfterUp = await page.evaluate(() => window.scrollY);
    expect(docAfterUp).toBe(0);

    // Only the AG Grid 36 viewport owns vertical scroll.
    const nested = await page.evaluate(() => {
      const vp = document.querySelector(".sbm-calls-grid .ag-grid-viewport");
      if (!vp) return { ok: false, reason: "missing viewport" };
      const oy = getComputedStyle(vp).overflowY;
      const overscroll = getComputedStyle(vp).overscrollBehaviorY;
      return {
        ok: (oy === "scroll" || oy === "auto") && (overscroll === "contain" || overscroll === "none"),
        overflowY: oy,
        overscroll,
      };
    });
    expect(nested.ok).toBe(true);
  });
});

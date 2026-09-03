import { test, expect } from "@playwright/test";
import { openCallsWithMockedRows } from "../fixtures/calls-grid";

test.describe("Calls grid desktop vs mobile layout", () => {
  test("desktop: summary column, full-height grid, no fixed-body lock", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const viewport = await openCallsWithMockedRows(page);

    await expect(page.locator(".ag-header-cell").filter({ hasText: "Summary" })).toBeVisible();
    await expect(page.locator(".ag-header-cell").filter({ hasText: "Type" })).toBeVisible();

    const metrics = await page.evaluate(() => {
      const grid = document.querySelector(".sbm-calls-grid") as HTMLElement | null;
      const wrap = document.querySelector(".sbm-calls-grid-wrap") as HTMLElement | null;
      const vp = document.querySelector(".sbm-calls-grid .ag-grid-viewport") as HTMLElement | null;
      const summary = document.querySelector(".sbm-calls-grid .sbm-col-summary") as HTMLElement | null;
      const shell = document.querySelector(".sbm-fill-viewport") as HTMLElement | null;
      if (!grid || !wrap || !vp) return { ok: false, reason: "missing grid" };
      const vpStyle = getComputedStyle(vp);
      return {
        ok: true,
        gridH: grid.getBoundingClientRect().height,
        wrapH: wrap.getBoundingClientRect().height,
        summaryW: summary?.getBoundingClientRect().width ?? 0,
        bodyPos: getComputedStyle(document.body).position,
        shellPos: shell ? getComputedStyle(shell).position : "missing",
        overflowY: vpStyle.overflowY,
        scrollbarGutter: vpStyle.scrollbarGutter,
        windowH: window.innerHeight,
      };
    });

    expect(metrics.ok).toBe(true);
    expect(metrics.bodyPos).not.toBe("fixed");
    expect(metrics.shellPos).not.toBe("fixed");
    expect(metrics.overflowY).toMatch(/auto|scroll/);
    expect(metrics.scrollbarGutter).not.toBe("stable");
    // Grid must fill leftover viewport, not collapse to a short strip.
    expect(metrics.gridH).toBeGreaterThan(metrics.windowH * 0.4);
    expect(metrics.wrapH).toBeGreaterThan(metrics.windowH * 0.4);
    expect(metrics.summaryW).toBeGreaterThan(280);

    const maxScroll = await viewport.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(maxScroll).toBeGreaterThan(20);
    await page.screenshot({ path: "test-results/calls-desktop.png", fullPage: true });
  });

  test("mobile: no summary column, document locked, table scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const viewport = await openCallsWithMockedRows(page);

    await expect(page.locator(".ag-header-cell").filter({ hasText: "Summary" })).toHaveCount(0);
    await expect(page.locator(".ag-header-cell").filter({ hasText: "Type" })).toBeVisible();

    const metrics = await page.evaluate(() => {
      const vp = document.querySelector(".sbm-calls-grid .ag-grid-viewport") as HTMLElement | null;
      const shell = document.querySelector(".sbm-fill-viewport") as HTMLElement | null;
      if (!vp) return { ok: false };
      const vpStyle = getComputedStyle(vp);
      return {
        ok: true,
        bodyPos: getComputedStyle(document.body).position,
        shellPos: shell ? getComputedStyle(shell).position : "missing",
        overflowY: vpStyle.overflowY,
        overscroll: vpStyle.overscrollBehaviorY,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
      };
    });

    expect(metrics.ok).toBe(true);
    expect(metrics.bodyPos).toBe("fixed");
    expect(metrics.shellPos).toBe("fixed");
    expect(metrics.overflowY).toMatch(/scroll|auto/);
    expect(metrics.overscroll).toMatch(/contain|none/);
    expect(metrics.htmlOverflow).toMatch(/hidden/);

    const maxScroll = await viewport.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(maxScroll).toBeGreaterThan(20);
    await page.screenshot({ path: "test-results/calls-mobile.png", fullPage: true });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDaysIso, daysUntil, hasJoined, isIsoDate, isOffboardingDue } from "./staff-transition.ts";

describe("staff transitions", () => {
  it("opens login on the joining day, not before", () => {
    assert.equal(hasJoined("2026-10-05", "2026-10-04"), false);
    assert.equal(hasJoined("2026-10-05", "2026-10-05"), true);
    assert.equal(hasJoined(null, "2026-10-05"), true);
  });

  it("finalizes the day after the last working day", () => {
    assert.equal(isOffboardingDue("2026-09-30", "2026-09-30"), false);
    assert.equal(isOffboardingDue("2026-09-30", "2026-10-01"), true);
    assert.equal(isOffboardingDue(null, "2026-10-01"), false);
  });

  it("counts days to go across a month end", () => {
    assert.equal(daysUntil("2026-10-02", "2026-09-29"), 3);
    assert.equal(daysUntil("2026-09-29", "2026-09-29"), 0);
    assert.equal(addDaysIso("2026-09-30", 1), "2026-10-01");
  });

  it("accepts only real yyyy-mm-dd dates", () => {
    assert.equal(isIsoDate("2026-02-29"), false);
    assert.equal(isIsoDate("2026-09-29"), true);
    assert.equal(isIsoDate("29-09-2026"), false);
  });
});

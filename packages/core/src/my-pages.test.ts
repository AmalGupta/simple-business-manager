import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMyPages, validateMyPages, MAX_MY_PAGES } from "./my-pages.ts";

test("parseMyPages drops malformed entries and unknown views", () => {
  const raw = JSON.stringify([
    { id: "a", name: "Monday", views: ["staff-roster", "nope"] },
    { id: 7, name: "bad", views: [] },
    "junk",
  ]);
  assert.deepEqual(parseMyPages(raw), [{ id: "a", name: "Monday", views: ["staff-roster"] }]);
});

test("parseMyPages tolerates null and invalid JSON", () => {
  assert.deepEqual(parseMyPages(null), []);
  assert.deepEqual(parseMyPages("{not json"), []);
});

test("validateMyPages accepts a well-formed list and trims names", () => {
  const r = validateMyPages({ pages: [{ id: "p1", name: "  Monday review ", views: ["staff-roster", "task-audit"] }] });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.pages, [{ id: "p1", name: "Monday review", views: ["staff-roster", "task-audit"] }]);
});

test("validateMyPages rejects unknown views, duplicates and empty pages", () => {
  assert.equal(validateMyPages({ pages: [{ id: "p", name: "x", views: ["add-complaint"] }] }).ok, false);
  assert.equal(validateMyPages({ pages: [{ id: "p", name: "x", views: ["staff-roster", "staff-roster"] }] }).ok, false);
  assert.equal(validateMyPages({ pages: [{ id: "p", name: "x", views: [] }] }).ok, false);
  assert.equal(validateMyPages({ pages: [{ id: "p", name: "  ", views: ["task-audit"] }] }).ok, false);
  assert.equal(validateMyPages({ pages: [{ id: "p", name: "x", views: ["task-audit"] }, { id: "p", name: "y", views: ["task-audit"] }] }).ok, false);
});

test("validateMyPages enforces the page cap", () => {
  const pages = Array.from({ length: MAX_MY_PAGES + 1 }, (_, i) => ({ id: `p${i}`, name: `n${i}`, views: ["task-audit"] }));
  assert.equal(validateMyPages({ pages }).ok, false);
});

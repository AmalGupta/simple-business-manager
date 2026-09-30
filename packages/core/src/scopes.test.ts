import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { meetsLevel, resolveAllScopes, resolveScope, scopeForRoute } from "./scopes.ts";

describe("resolveScope", () => {
  it("defaults to read", () => {
    assert.equal(resolveScope("staff.assigned_work.act", "admin", [], []), "read");
  });
  it("role grant beats default", () => {
    const g = [{ role: "admin", scope_key: "staff.assigned_work.act", level: "write" }];
    assert.equal(resolveScope("staff.assigned_work.act", "admin", g, []), "write");
    assert.equal(resolveScope("staff.assigned_work.act", "superadmin", g, []), "read");
  });
  it("user override beats role grant", () => {
    const g = [{ role: "admin", scope_key: "staff.language", level: "write" }];
    const o = [{ scope_key: "staff.language", level: "none" }];
    assert.equal(resolveScope("staff.language", "admin", g, o), "none");
  });
  it("parent page none caps its actions", () => {
    const g = [
      { role: "admin", scope_key: "staff.complaints", level: "none" },
      { role: "admin", scope_key: "staff.complaints.act", level: "write" },
    ];
    assert.equal(resolveScope("staff.complaints.act", "admin", g, []), "none");
  });
  it("page read + action write is allowed", () => {
    const g = [{ role: "admin", scope_key: "staff.site_visit.submit", level: "write" }];
    assert.equal(resolveScope("staff.site_visit.submit", "admin", g, []), "write");
  });
  it("unknown key is none; ignores junk levels", () => {
    assert.equal(resolveScope("nope", "admin", [], []), "none");
    assert.equal(resolveScope("staff.language", "admin", [{ role: "admin", scope_key: "staff.language", level: "x" }], []), "read");
  });
  it("resolveAllScopes covers the registry", () => {
    assert.equal(resolveAllScopes("admin", [], [])["staff.complaints"], "read");
  });
});

describe("meetsLevel / scopeForRoute", () => {
  it("orders levels", () => {
    assert.ok(meetsLevel("write", "read"));
    assert.ok(!meetsLevel("read", "write"));
    assert.ok(!meetsLevel("none", "read"));
  });
  it("maps writes to write and page reads to read", () => {
    assert.deepEqual(scopeForRoute("PATCH", "/api/work/todo/abc"), { key: "staff.assigned_work.act", need: "write" });
    assert.deepEqual(scopeForRoute("GET", "/api/complaints"), { key: "staff.complaints", need: "read" });
    assert.equal(scopeForRoute("POST", "/api/me/pin"), null);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveWorkLocation, isWorkLocation } from "./work-location.ts";

describe("effectiveWorkLocation", () => {
  it("defaults factory-floor workflow stages to factory", () => {
    assert.equal(effectiveWorkLocation(null, "production"), "factory");
    assert.equal(effectiveWorkLocation(null, "procurement"), "factory");
    assert.equal(effectiveWorkLocation(null, "quality_control"), "factory");
  });

  it("defaults every other stage, and call todos, to office", () => {
    assert.equal(effectiveWorkLocation(null, "installation"), "office");
    assert.equal(effectiveWorkLocation(null, "measurement"), "office");
    assert.equal(effectiveWorkLocation(null, null), "office");
    assert.equal(effectiveWorkLocation(undefined, undefined), "office");
  });

  it("lets a stored override win over the default", () => {
    assert.equal(effectiveWorkLocation("office", "production"), "office");
    assert.equal(effectiveWorkLocation("factory", null), "factory");
  });

  it("ignores an unrecognised stored value", () => {
    assert.equal(effectiveWorkLocation("site", "production"), "factory");
    assert.equal(isWorkLocation("site"), false);
  });
});

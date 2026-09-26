import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractHouseNo,
  extractSectorNo,
  normalizeSiteTokens,
  pickExistingSiteId,
  type SiteMatchCandidate,
} from "./site-match.ts";

const CATALOG: SiteMatchCandidate[] = [
  {
    id: "s-1818",
    name: "H.NO 1818 Sector 80",
    site_name_being_used: "#1818, SECTOR 80-MHL | CL. Harsimrat",
    house_no: "H.NO 1818",
    sector: "SECTOR 80",
    is_confirmed: "Y",
  },
  {
    id: "s-35",
    name: "Sector 35",
    house_no: null,
    sector: "SECTOR 35",
    is_confirmed: "Y",
  },
  {
    id: "s-106",
    name: "Sector 106",
    house_no: null,
    sector: "SECTOR 106",
    is_confirmed: "Y",
  },
  {
    id: "s-1",
    name: "Sector 1",
    house_no: null,
    sector: "SECTOR 1",
    is_confirmed: "Y",
  },
  {
    id: "s-rej",
    name: "Rejected Sector 80",
    house_no: "99",
    sector: "SECTOR 80",
    is_confirmed: "N",
  },
];

describe("normalizeSiteTokens", () => {
  it("extracts house and sector from spoken desk phrasing", () => {
    const t = normalizeSiteTokens("House 1818, Sector 80, Harsimrat Singh ji ke yahan");
    assert.equal(t.house, "1818");
    assert.equal(t.sector, "80");
  });

  it("extracts from H.NO style", () => {
    assert.equal(extractHouseNo("H.NO 1818"), "1818");
    assert.equal(extractSectorNo("SECTOR 80"), "80");
  });
});

describe("pickExistingSiteId", () => {
  it("matches House 1818 Sector 80 to H.NO 1818 Sector 80", () => {
    const id = pickExistingSiteId("House 1818, Sector 80", CATALOG);
    assert.equal(id, "s-1818");
  });

  it("matches from longer todo text", () => {
    const id = pickExistingSiteId(
      "Glass remove karna hai — House 1818, Sector 80, Harsimrat Singh ji ke yahan",
      CATALOG
    );
    assert.equal(id, "s-1818");
  });

  it("matches unique roster sector Sector 35", () => {
    assert.equal(pickExistingSiteId("Sector 35", CATALOG), "s-35");
  });

  it("does not map Sector 1 to Sector 106", () => {
    assert.equal(pickExistingSiteId("Sector 1", CATALOG), "s-1");
    assert.notEqual(pickExistingSiteId("Sector 1", CATALOG), "s-106");
  });

  it("ignores rejected sites for sector-only collision", () => {
    /* Only s-1818 is confirmed for sector 80 with house; sector-only would be ambiguous
       if rejected counted — rejected must be excluded. */
    const sectorOnly = CATALOG.filter((c) => c.id !== "s-1818");
    assert.equal(pickExistingSiteId("Sector 80", sectorOnly), null);
  });

  it("returns null when nothing matches", () => {
    assert.equal(pickExistingSiteId("Mullanpur mystery plot", CATALOG), null);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeSiteNameBeingUsed } from "./queries.ts";

describe("composeSiteNameBeingUsed", () => {
  it("full house + locality replaces the name", () => {
    assert.equal(
      composeSiteNameBeingUsed({ name: "X", house_no: "244", sector: "IAS", city: "PCS", poc_name: "Raj Kamal Ji" }),
      "#244, IAS-PCS | CL. Raj Kamal Ji"
    );
  });

  it("a lone house number never shows, even with the derived intake address", () => {
    // createSite stores address = "H.No H.NO 244" for this input.
    assert.equal(
      composeSiteNameBeingUsed({ name: "H.NO 244 IAS Society", house_no: "H.NO 244", address: "H.No H.NO 244" }),
      null
    );
    assert.equal(
      composeSiteNameBeingUsed({ name: "Soc", house_no: "H.NO 244", address: "H.No H.NO 244", poc_name: "RAJ" }),
      "Soc | CL. RAJ"
    );
  });

  it("a locality alone is appended after the name, not the derived address", () => {
    assert.equal(
      composeSiteNameBeingUsed({ name: "Nobel", sector: "IAS", address: "Sector IAS" }),
      "Nobel | IAS"
    );
    assert.equal(composeSiteNameBeingUsed({ name: "City Only", city: "AIRPORT ROAD", address: "AIRPORT ROAD" }), "City Only | AIRPORT ROAD");
  });

  it("a legacy row with only free-text address still uses it", () => {
    assert.equal(composeSiteNameBeingUsed({ name: "Twin Tower", address: "NEW CHANDIGARH" }), "Twin Tower | NEW CHANDIGARH");
  });

  it("nothing beyond the name is null; phone is appended", () => {
    assert.equal(composeSiteNameBeingUsed({ name: "Bare" }), null);
    assert.equal(
      composeSiteNameBeingUsed({ name: "X", house_no: "244", sector: "IAS", city: "PCS", poc_contact_number: "98721" }),
      "#244, IAS-PCS | 98721"
    );
  });
});

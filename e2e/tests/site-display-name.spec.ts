import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/login";
import { sbmApiKey } from "../fixtures/dev-vars";

/* The composed site name — migration 0031 / composeSiteNameBeingUsed. The
   worked example from the spec is the fixture: H.No 244, Sector IAS, City
   PCS, contact person Raj Kamal Ji reads as "#244, IAS-PCS | CL. Raj Kamal
   Ji" in both site tables, with CL. as its own bold token. */
const DETAILS = { house_no: "244", sector: "IAS", city: "PCS", poc_name: "Raj Kamal Ji" };
const COMPOSED = "#244, IAS-PCS | CL. Raj Kamal Ji";

test.describe("Site display name", () => {
  test("composed on create, rendered in both grids, rebuilt on edit", async ({ page }) => {
    await loginAsAdmin(page);
    const storedName = `E2E Display ${Date.now()}`;

    const created = await page.request.post("/api/sites", {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { name: storedName, ...DETAILS },
    });
    expect(created.ok()).toBeTruthy();
    const site = await created.json();
    expect(site.site_name_being_used).toBe(COMPOSED);
    // The stored name is untouched — the two are meant to coexist.
    expect(site.name).toBe(storedName);

    await page.reload();
    await expect(page.getByText("Simple Business Manager")).toBeVisible();

    // --- Sites directory ---------------------------------------------
    await page.getByRole("button", { name: /^\d+ confirmed sites?/ }).click();
    await expect(page.getByRole("heading", { name: "Sites", exact: true })).toBeVisible();

    /* Filter by the stored name first: it isolates this run's row whatever
       else the shared local D1 holds, and it doubles as the proof that
       searching either name finds the site. */
    await page.getByPlaceholder("Search name…").fill(storedName);
    await expect(page.locator(".ag-row")).toHaveCount(1);
    const row = page.locator(".ag-row").first();
    await expect(row).toContainText(COMPOSED);
    await expect(row.getByText("CL.", { exact: true })).toHaveCSS("font-weight", "700");

    // --- Review grid --------------------------------------------------
    await page.getByRole("button", { name: /Back|Home/ }).first().click();
    await page.getByRole("button", { name: /Show unconfirmed sites/ }).click();
    await page.getByPlaceholder("Search name…").fill(storedName);
    await expect(page.locator(".ag-row")).toHaveCount(1);
    await expect(page.locator(".ag-row").first()).toContainText(COMPOSED);

    // --- An edit rebuilds it ------------------------------------------
    const patched = await page.request.patch(`/api/sites/${site.id}`, {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { city: "Kharar" },
    });
    expect(patched.ok()).toBeTruthy();
    expect((await patched.json()).site_name_being_used).toBe("#244, IAS-Kharar | CL. Raj Kamal Ji");
  });

  /* Half an address is not worth the name it replaces. UAT had six sites
     carrying only a city or sector, which turned two different sites into
     "AIRPORT ROAD"; and "H.NO 244 IAS Society" carried only a house number,
     where "#244" drops the society nobody typed into a field. */
  test("a house number with no locality does not replace the name", async ({ page }) => {
    await loginAsAdmin(page);
    const houseOnly = await page.request.post("/api/sites", {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { name: `E2E H.NO 244 IAS Society ${Date.now()}`, house_no: "H.NO 244" },
    });
    expect((await houseOnly.json()).site_name_being_used).toBeNull();

    const withClient = await page.request.post("/api/sites", {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { name: `E2E H.NO 244 Society ${Date.now()}`, house_no: "H.NO 244", poc_name: "RAJ KAMAL JI" },
    });
    const row = await withClient.json();
    expect(row.site_name_being_used).toBe(`${row.name} | CL. RAJ KAMAL JI`);
  });

  test("a sector or city alone does not replace the name", async ({ page }) => {
    await loginAsAdmin(page);
    const cityOnly = await page.request.post("/api/sites", {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { name: `E2E City Only ${Date.now()}`, city: "AIRPORT ROAD" },
    });
    expect((await cityOnly.json()).site_name_being_used).toBeNull();

    const withClient = await page.request.post("/api/sites", {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { name: `E2E City Client ${Date.now()}`, city: "AIRPORT ROAD", poc_name: "Tushar" },
    });
    const row = await withClient.json();
    expect(row.site_name_being_used).toBe(`${row.name} | CL. Tushar`);
  });

  // Operators type the label into the field — real UAT rows hold "H.NO 244".
  test("a house number keeps its own prefix out of the composed name", async ({ page }) => {
    await loginAsAdmin(page);
    const created = await page.request.post("/api/sites", {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { name: `E2E Prefixed ${Date.now()}`, house_no: "H.NO 8", sector: "MANOHAR CITY", city: "NEW VHD" },
    });
    expect((await created.json()).site_name_being_used).toBe("#8, MANOHAR CITY-NEW VHD");
  });

  test("a site with no details keeps its own name", async ({ page }) => {
    await loginAsAdmin(page);
    const storedName = `E2E Bare ${Date.now()}`;

    const created = await page.request.post("/api/sites", {
      headers: { "X-SBM-Key": sbmApiKey() },
      data: { name: storedName },
    });
    expect(created.ok()).toBeTruthy();
    const site = await created.json();
    expect(site.site_name_being_used).toBeNull();

    await page.reload();
    await page.getByRole("button", { name: /^\d+ confirmed sites?/ }).click();
    await page.getByPlaceholder("Search name…").fill(storedName);
    await expect(page.locator(".ag-row").first()).toContainText(storedName);
    await expect(page.locator(".ag-row").first()).not.toContainText("CL.");
  });
});

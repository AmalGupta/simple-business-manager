/* ------------------------------------------------------------------
   The 8 workflow categories a site task can fall under — see migration
   0013. Display order only, not a pipeline: stages within and across
   categories carry no sequence, so this is just a stable, readable order
   for the home-page tiles and the "View work timeline" popup.
   ------------------------------------------------------------------ */
export const WORKFLOW_CATEGORIES = [
  { key: "admin_intake", label: "Admin & Intake" },
  { key: "measurement", label: "Measurement" },
  { key: "procurement", label: "Procurement" },
  { key: "production", label: "Production" },
  { key: "quality_control", label: "Quality Control" },
  { key: "installation", label: "Installation" },
  { key: "handover", label: "Handover" },
  { key: "billing_delivery", label: "Billing & Delivery" },
];
export const WORKFLOW_CATEGORY_LABEL = Object.fromEntries(WORKFLOW_CATEGORIES.map((c) => [c.key, c.label]));

/* ------------------------------------------------------------------
   The staff site-visit installation checklist — migration 0016. One row
   per category; `allowVideo: false` on "location" is the one row that
   only ever offers a photo alongside the required voice note (matches
   Piyush's brainstorm sketch). Order here is display order.
   ------------------------------------------------------------------ */
export const INSTALLATION_UPDATE_CATEGORIES = [
  { key: "location", label: "Location of Work / Window", allowVideo: false },
  { key: "work_done", label: "Work Done", allowVideo: true },
  { key: "work_pending", label: "Work Pending", allowVideo: true },
  { key: "material_short", label: "Material Short", allowVideo: true },
  { key: "complaints", label: "Complaints", allowVideo: true },
  { key: "site_delay", label: "Site Delay", allowVideo: true },
];

/* ------------------------------------------------------------------
   Site-visit category grid (SiteVisitCategoryGrid) — the "what are you
   here to report?" screen for a selected site. All four are always
   active: a staff member can initiate any of these from the field even
   without a prior admin-assigned site_task in that category — reporting
   proactively is the point of this flow, not something to gate on
   pre-existing assignment.
   ------------------------------------------------------------------ */
export const SITE_VISIT_CATEGORIES = [
  { key: "measurement", label: "New Measurement" },
  { key: "material_delivery", label: "Material Delivery" },
  { key: "installation", label: "Installation" },
  { key: "complaints", label: "Complaints" },
];

/* Sort rule — §4. Customer-waiting beats deadline proximity, beats recency. */
export const sortCalls = (calls) =>
  [...calls].sort((a, b) => {
    if (a.customer_waiting !== b.customer_waiting) return b.customer_waiting - a.customer_waiting;
    const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return new Date(b.recorded_at) - new Date(a.recorded_at);
  });

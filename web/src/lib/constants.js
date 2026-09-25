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

/** Mirrors packages/core/src/types.ts — categories hidden from staff UI/API. */
export const STAFF_HIDDEN_WORKFLOW_CATEGORIES = ["admin_intake"];

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

/* ------------------------------------------------------------------
   The fixed 5-step aluminium doors & windows production pipeline —
   migration 0041, mirrors packages/core/src/production-steps.ts. Unlike
   WORKFLOW_CATEGORIES above, this one genuinely runs in order: a step
   can't be assigned until the step before it is done. See
   migrations/0041_production_warehouse.sql.
   ------------------------------------------------------------------ */
export const PRODUCTION_STEPS = [
  { key: "measurement", order: 1, label: "Measurement", description: "Calculated from the survey" },
  { key: "cutting", order: 2, label: "Cutting", description: "" },
  { key: "routing", order: 3, label: "Routing", description: "Assigned to a junior" },
  { key: "assembly", order: 4, label: "Assembly", description: "" },
  { key: "glass_integration", order: 5, label: "Glass integration", description: "" },
];
export const PRODUCTION_STEP_LABEL = Object.fromEntries(PRODUCTION_STEPS.map((s) => [s.key, s.label]));

export const PRODUCTION_JOB_STATUS_LABEL = {
  active: "In progress",
  ready_for_dispatch: "Ready for dispatch",
  dispatched: "Dispatched",
  completed: "Completed",
};

/* ------------------------------------------------------------------
   Warehouse register — migration 0041. Movement kinds and tool
   locations; store list itself comes from the API (warehouse_stores),
   not hardcoded here, so a store can be renamed without a redeploy.
   ------------------------------------------------------------------ */
export const WAREHOUSE_MOVEMENT_KINDS = [
  { key: "in", label: "Material in" },
  { key: "out", label: "Material out" },
  { key: "dispatch", label: "Dispatch" },
  { key: "maintenance", label: "Maintenance" },
];
export const WAREHOUSE_MOVEMENT_KIND_LABEL = Object.fromEntries(WAREHOUSE_MOVEMENT_KINDS.map((k) => [k.key, k.label]));

export const TOOL_LOCATIONS = [
  { key: "workshop", label: "Workshop" },
  { key: "site", label: "Site" },
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

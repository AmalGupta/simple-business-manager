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

/* Sort rule — §4. Customer-waiting beats deadline proximity, beats recency. */
export const sortCalls = (calls) =>
  [...calls].sort((a, b) => {
    if (a.customer_waiting !== b.customer_waiting) return b.customer_waiting - a.customer_waiting;
    const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return new Date(b.recorded_at) - new Date(a.recorded_at);
  });

// The fixed 5-step aluminium doors & windows production pipeline — from the
// owner's voice note (Tanseem: measurement + cutting himself, then routing/
// assembly/glass integration handed to juniors). Unlike workflow_stages
// (migration 0013), there is exactly one pipeline and it runs IN ORDER, so
// this is a code constant rather than a DB catalog table — see migration
// 0041. Shared between the worker (sequencing/validation) and the web
// dashboard (display order/labels) via this one package.

export type ProductionStepKey = "measurement" | "cutting" | "routing" | "assembly" | "glass_integration";

export interface ProductionStepDef {
  key: ProductionStepKey;
  order: number;
  label: string;
  description: string;
}

export const PRODUCTION_STEPS: readonly ProductionStepDef[] = [
  { key: "measurement", order: 1, label: "Measurement", description: "Calculated from the survey" },
  { key: "cutting", order: 2, label: "Cutting", description: "" },
  { key: "routing", order: 3, label: "Routing", description: "Assigned to a junior" },
  { key: "assembly", order: 4, label: "Assembly", description: "" },
  { key: "glass_integration", order: 5, label: "Glass integration", description: "" },
] as const;

export const PRODUCTION_STEP_KEYS: readonly ProductionStepKey[] = PRODUCTION_STEPS.map((s) => s.key);

export function isProductionStepKey(value: string): value is ProductionStepKey {
  return (PRODUCTION_STEP_KEYS as readonly string[]).includes(value);
}

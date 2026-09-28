/**
 * SBM-67 — where a piece of assigned work gets done: at the office or in the
 * factory. Staff see each site's work split into those two tabs.
 *
 * `todos.work_location` / `site_tasks.work_location` (migration 0049) hold an
 * admin override only; NULL means "use the default", so the default rule
 * lives here rather than being copied into every row.
 */
export const WORK_LOCATIONS = ["office", "factory"] as const;
export type WorkLocation = (typeof WORK_LOCATIONS)[number];

/** Workflow categories (migration 0013) whose stages happen on the factory floor. */
export const FACTORY_WORKFLOW_CATEGORIES: readonly string[] = ["procurement", "production", "quality_control"];

export function isWorkLocation(v: unknown): v is WorkLocation {
  return v === "office" || v === "factory";
}

/** Stored override if set; otherwise factory for factory-floor site stages, office for everything else. */
export function effectiveWorkLocation(stored: string | null | undefined, category: string | null | undefined): WorkLocation {
  if (isWorkLocation(stored)) return stored;
  return category && FACTORY_WORKFLOW_CATEGORIES.includes(category) ? "factory" : "office";
}

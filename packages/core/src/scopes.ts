// SBM-81 — component/page-level scopes for an admin viewing a staff member's
// dashboard ("view-as"). Keys live here; grants/overrides live in D1
// (scope_role_grants / scope_user_overrides). Missing row ⇒ DEFAULT (read).
// Staff acting on their own dashboard, and an admin on their own dashboard, are
// never gated — scopes only apply in view-as context.

export type ScopeLevel = "none" | "read" | "write";
export const SCOPE_LEVELS: ScopeLevel[] = ["none", "read", "write"];
export const SCOPE_ROLES = ["admin", "superadmin"] as const;
export type ScopeRole = (typeof SCOPE_ROLES)[number];
export const SCOPE_DEFAULT_LEVEL: ScopeLevel = "read";

export interface ScopeDef {
  key: string;
  label: string;
  group: string;
  kind: "page" | "component" | "action";
  /** Parent page `none` hides this too; otherwise independent. */
  parent?: string;
}

export const SCOPE_REGISTRY: ScopeDef[] = [
  { key: "staff.assigned_work", label: "Assigned work", group: "Assigned work", kind: "page" },
  { key: "staff.assigned_work.act", label: "Mark done, schedule, edit", group: "Assigned work", kind: "action", parent: "staff.assigned_work" },
  { key: "staff.assigned_work.handoff", label: "Pass work on", group: "Assigned work", kind: "action", parent: "staff.assigned_work" },
  { key: "staff.todos.act", label: "Call tasks: done, snooze, voice note", group: "Assigned work", kind: "action", parent: "staff.assigned_work" },
  { key: "staff.site_tasks.act", label: "Workflow stage tasks", group: "Assigned work", kind: "action", parent: "staff.assigned_work" },
  { key: "staff.site_visit", label: "Site visit", group: "Site visit", kind: "page" },
  { key: "staff.site_visit.submit", label: "Log installation, media, voice notes", group: "Site visit", kind: "action", parent: "staff.site_visit" },
  { key: "staff.complaints", label: "Complaints", group: "Complaints", kind: "page" },
  { key: "staff.complaints.act", label: "Update or resolve complaints", group: "Complaints", kind: "action", parent: "staff.complaints" },
  { key: "staff.language", label: "Display language", group: "Profile", kind: "component" },
];

const REGISTRY_BY_KEY = new Map(SCOPE_REGISTRY.map((d) => [d.key, d]));

export function isScopeKey(v: unknown): v is string {
  return typeof v === "string" && REGISTRY_BY_KEY.has(v);
}
export function isScopeLevel(v: unknown): v is ScopeLevel {
  return v === "none" || v === "read" || v === "write";
}
export function isScopeRole(v: unknown): v is ScopeRole {
  return v === "admin" || v === "superadmin";
}

const RANK: Record<ScopeLevel, number> = { none: 0, read: 1, write: 2 };
export function meetsLevel(have: ScopeLevel, need: ScopeLevel): boolean {
  return RANK[have] >= RANK[need];
}

export interface ScopeGrantRow {
  role: string;
  scope_key: string;
  level: string;
}
export interface ScopeOverrideRow {
  scope_key: string;
  level: string;
}

/** user override → role grant → registry default, then capped by the parent page. */
export function resolveScope(
  key: string,
  role: string,
  roleGrants: ScopeGrantRow[],
  overrides: ScopeOverrideRow[]
): ScopeLevel {
  const def = REGISTRY_BY_KEY.get(key);
  if (!def) return "none";
  const own =
    overrides.find((o) => o.scope_key === key && isScopeLevel(o.level))?.level ??
    roleGrants.find((g) => g.role === role && g.scope_key === key && isScopeLevel(g.level))?.level ??
    SCOPE_DEFAULT_LEVEL;
  const level = own as ScopeLevel;
  if (!def.parent) return level;
  // Only a hidden page (`none`) cascades; page `read` + action `write` is a valid "can view, can act".
  return resolveScope(def.parent, role, roleGrants, overrides) === "none" ? "none" : level;
}

export function resolveAllScopes(
  role: string,
  roleGrants: ScopeGrantRow[],
  overrides: ScopeOverrideRow[]
): Record<string, ScopeLevel> {
  const out: Record<string, ScopeLevel> = {};
  for (const d of SCOPE_REGISTRY) out[d.key] = resolveScope(d.key, role, roleGrants, overrides);
  return out;
}

/** Method + path → scope key for requests made from a staff tab. Unlisted routes are not gated. */
const ROUTE_RULES: { method: string; re: RegExp; key: string }[] = [
  { method: "PATCH", re: /^\/api\/work\/[^/]+\/[^/]+$/, key: "staff.assigned_work.act" },
  { method: "POST", re: /^\/api\/work\/[^/]+\/[^/]+\/handoff$/, key: "staff.assigned_work.handoff" },
  { method: "GET", re: /^\/api\/work\/assigned$/, key: "staff.assigned_work" },
  { method: "PATCH", re: /^\/api\/todos\/[^/]+$/, key: "staff.todos.act" },
  { method: "POST", re: /^\/api\/todos\/[^/]+\/voice-note$/, key: "staff.todos.act" },
  { method: "PATCH", re: /^\/api\/site-tasks\/[^/]+$/, key: "staff.site_tasks.act" },
  { method: "POST", re: /^\/api\/sites\/[^/]+\/(installations|voice-note|media|complaints)$/, key: "staff.site_visit.submit" },
  { method: "POST", re: /^\/api\/installations\/[^/]+\/updates$/, key: "staff.site_visit.submit" },
  { method: "POST", re: /^\/api\/installation-updates\/[^/]+\/media$/, key: "staff.site_visit.submit" },
  { method: "PATCH", re: /^\/api\/complaints\/[^/]+$/, key: "staff.complaints.act" },
  { method: "GET", re: /^\/api\/complaints(\/count)?$/, key: "staff.complaints" },
  { method: "PATCH", re: /^\/api\/staff\/[^/]+\/language$/, key: "staff.language" },
];

export function scopeForRoute(method: string, pathname: string): { key: string; need: ScopeLevel } | null {
  const m = method.toUpperCase();
  const rule = ROUTE_RULES.find((r) => r.method === m && r.re.test(pathname));
  if (!rule) return null;
  return { key: rule.key, need: m === "GET" ? "read" : "write" };
}

// GET /api/maintenance/site-contact-proposals, POST /api/maintenance/site-contact-mappings
// — admin/superadmin session only (same as /api/callers).

import {
  SCOPE_DEFAULT_LEVEL,
  SCOPE_REGISTRY,
  SCOPE_ROLES,
  applySiteContactMappings,
  deleteScopeRoleGrant,
  deleteScopeUserOverride,
  getUserById,
  isScopeKey,
  isScopeLevel,
  isScopeRole,
  listScopeRoleGrants,
  listScopeSubjects,
  listScopeUserOverrides,
  proposeSiteContactBackfill,
  upsertScopeRoleGrant,
  upsertScopeUserOverride,
  type ScopeLevel,
} from "@sbm/core";
import { requireAdmin } from "./auth";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** GET /api/maintenance/site-contact-proposals — confirmed sites only; propose site↔contact links from POC fields. */
export async function handleGetSiteContactProposals(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const proposals = await proposeSiteContactBackfill(env.DB);
  return json({ proposals });
}

/** POST /api/maintenance/site-contact-mappings — apply one or many { site_id, caller_id }. */
export async function handlePostSiteContactMappings(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const raw = (body as { mappings?: unknown }).mappings ?? (body as { items?: unknown }).items;
  if (!Array.isArray(raw)) return json({ error: "mappings array required" }, 400);

  const items: { site_id: string; caller_id: string }[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const site_id = String((row as { site_id?: unknown }).site_id ?? "").trim();
    const caller_id = String((row as { caller_id?: unknown }).caller_id ?? "").trim();
    if (site_id && caller_id) items.push({ site_id, caller_id });
  }
  if (items.length === 0) return json({ error: "no valid mappings" }, 400);

  const result = await applySiteContactMappings(env.DB, items);
  return json(result);
}

// --- SBM-81: Manage scopes (view-as read-only). Admin/superadmin only. ---

/** GET /api/maintenance/scopes — registry + role grants + per-user overrides + who can be overridden. */
export async function handleGetScopes(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const [role_grants, user_overrides, users] = await Promise.all([
    listScopeRoleGrants(env.DB),
    listScopeUserOverrides(env.DB),
    listScopeSubjects(env.DB),
  ]);
  return json({
    registry: SCOPE_REGISTRY,
    roles: SCOPE_ROLES,
    default_level: SCOPE_DEFAULT_LEVEL,
    role_grants,
    user_overrides,
    users,
  });
}

async function readLevel(request: Request): Promise<ScopeLevel | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const level = (body as { level?: unknown }).level;
  if (!isScopeLevel(level)) return json({ error: "level must be none | read | write" }, 400);
  return level;
}

/** PUT /api/maintenance/scopes/roles/:role/:key — body { level }. */
export async function handlePutScopeRoleGrant(request: Request, env: Env, role: string, key: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  if (!isScopeRole(role)) return json({ error: "unknown role" }, 400);
  if (!isScopeKey(key)) return json({ error: "unknown scope" }, 400);
  const level = await readLevel(request);
  if (level instanceof Response) return level;
  await upsertScopeRoleGrant(env.DB, role, key, level, gate.user_id);
  return json({ ok: true });
}

/** DELETE /api/maintenance/scopes/roles/:role/:key — back to the registry default. */
export async function handleDeleteScopeRoleGrant(request: Request, env: Env, role: string, key: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  if (!isScopeRole(role)) return json({ error: "unknown role" }, 400);
  if (!isScopeKey(key)) return json({ error: "unknown scope" }, 400);
  await deleteScopeRoleGrant(env.DB, role, key);
  return json({ ok: true });
}

/** PUT /api/maintenance/scopes/users/:userId/:key — body { level }. */
export async function handlePutScopeUserOverride(request: Request, env: Env, userId: string, key: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  if (!isScopeKey(key)) return json({ error: "unknown scope" }, 400);
  const target = await getUserById(env.DB, userId);
  if (!target || target.role === "staff") return json({ error: "user must be an admin or superadmin" }, 400);
  const level = await readLevel(request);
  if (level instanceof Response) return level;
  await upsertScopeUserOverride(env.DB, userId, key, level, gate.user_id);
  return json({ ok: true });
}

/** DELETE /api/maintenance/scopes/users/:userId/:key — drop the override. */
export async function handleDeleteScopeUserOverride(request: Request, env: Env, userId: string, key: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  if (!isScopeKey(key)) return json({ error: "unknown scope" }, 400);
  await deleteScopeUserOverride(env.DB, userId, key);
  return json({ ok: true });
}

// GET /api/calls, GET /api/calls/:id, PATCH /api/todos/:id — Tasks 6-7.
// GET/POST /api/escalations, PATCH /api/escalations/:id, GET /api/sites,
// GET /api/sites/attention, PATCH /api/sites/:id, POST /api/sites/backfill,
// GET/POST /api/sites/:id/team — docs/ADDITIONAL_FEATURES_M0.md "Phase 1
// home page", the site confirmation workflow, and site details/team.

import {
  addSiteTeamMember,
  closeEscalation,
  createEscalation,
  createSite,
  getCallWithTodos,
  getConfirmedSitesSummary,
  getSitesNeedingAttention,
  getUserById,
  isCallAccessibleToUser,
  isUserAssignedToSite,
  linkCallToSites,
  listCallsForSiteScan,
  listCallsWithTodos,
  listOpenEscalations,
  listSiteTeamMembers,
  listSites,
  updateSite,
  updateTodo,
  type SessionWithUser,
} from "@sbm/core";
import { scanCallForSites } from "../../packages/core/prompts/site-scan";
import { requireSession } from "../lib/auth";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * admin/superadmin only — the office dashboard (calls, todos, escalations,
 * site management) isn't reachable by a `staff` session even by direct API
 * call, matching migration 0011: staff have no UI for any of this. Returns
 * the session on success, or the Response to short-circuit with otherwise.
 */
async function requireAdmin(request: Request, env: Env): Promise<SessionWithUser | Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff") return json({ error: "forbidden" }, 403);
  return session;
}

export async function handleGetCalls(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  return json(await listCallsWithTodos(env.DB));
}

/**
 * Unlike the other call/todo/escalation routes, a `staff` session CAN reach
 * this one — but only for a call linked to a site they're assigned to (the
 * "open a call from my site's timeline" path SiteView's Timeline card
 * offers everyone). Anything else — no session, or a staff session on an
 * unrelated call — is rejected the same as the rest of the office endpoints.
 */
export async function handleGetCall(request: Request, env: Env, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff" && !(await isCallAccessibleToUser(env.DB, session.user_id, id))) {
    return json({ error: "forbidden" }, 403);
  }
  const call = await getCallWithTodos(env.DB, id);
  if (!call) return json({ error: "not found" }, 404);
  return json(call);
}

const TODO_PATCH_KEYS = ["status", "completed_at", "snoozed_until"] as const;

export async function handlePatchTodo(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (typeof body !== "object" || body === null) return json({ error: "invalid body" }, 400);

  const patch: Partial<Record<(typeof TODO_PATCH_KEYS)[number], string | null>> = {};
  for (const key of TODO_PATCH_KEYS) {
    if (key in (body as Record<string, unknown>)) {
      patch[key] = (body as Record<string, unknown>)[key] as string | null;
    }
  }

  const updated = await updateTodo(env.DB, id, patch);
  if (!updated) return json({ error: "not found" }, 404);
  return json(updated);
}

/**
 * `staff` gets only the sites they're on the team roster for; admin/superadmin
 * get everything (unchanged from before roles existed). A session is now
 * required at all — closes the gap where a caller with just the shared
 * X-SBM-Key but no cookie could otherwise read the full unfiltered list.
 */
export async function handleGetSites(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const forUserId = session.user_role === "staff" ? session.user_id : null;
  return json(await listSites(env.DB, forUserId));
}

/** "Add new site" — manual creation, distinct from the LLM-driven upsertSite path. See createSite in queries.ts. */
export async function handlePostSite(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return json({ error: "name is required" }, 400);
  const address = typeof record.address === "string" && record.address.trim() ? record.address.trim() : null;
  const pocName = typeof record.poc_name === "string" && record.poc_name.trim() ? record.poc_name.trim() : null;

  const site = await createSite(env.DB, name, address, pocName, gate.user_id);
  return json(site, 201);
}

export async function handleGetSitesAttention(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  return json(await getSitesNeedingAttention(env.DB));
}

/** Same staff-vs-admin scoping as handleGetSites — see comment there. */
export async function handleGetConfirmedSites(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const forUserId = session.user_role === "staff" ? session.user_id : null;
  return json(await getConfirmedSitesSummary(env.DB, forUserId));
}

/**
 * Backfill — runs the same Haiku site scan the webhook now runs
 * automatically on new calls (site-scan.ts), but over calls that already
 * have a transcript and predate that pipeline step. Manual trigger only,
 * synchronous: the caller sees exactly what was found, which matters for a
 * one-off admin action more than fire-and-forget would. `force: true`
 * rescans every transcribed call, including ones already linked to a site.
 */
export async function handlePostSitesBackfill(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  let force = false;
  try {
    const body = (await request.json()) as { force?: unknown };
    force = body?.force === true;
  } catch {
    // no body / not JSON — force stays false
  }

  const calls = await listCallsForSiteScan(env.DB, force);

  const results = await Promise.all(
    calls.map(async (call) => {
      try {
        const entries = (JSON.parse(call.diarized_transcript).entries ?? []) as { speaker_id: string; transcript: string }[];
        const sites = await scanCallForSites({ apiKey: env.ANTHROPIC_API_KEY!, model: env.ANTHROPIC_HAIKU_MODEL, entries });
        if (sites.length > 0) await linkCallToSites(env.DB, call.id, sites);
        return { call_id: call.id, sites, error: null as string | null };
      } catch (err) {
        return { call_id: call.id, sites: [] as string[], error: String(err) };
      }
    })
  );

  return json({
    scanned: results.length,
    sitesFound: [...new Set(results.flatMap((r) => r.sites))],
    results,
  });
}

const SITE_PATCH_KEYS = ["is_confirmed", "address", "poc_name"] as const;

export async function handlePatchSite(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (typeof body !== "object" || body === null) return json({ error: "invalid body" }, 400);
  const record = body as Record<string, unknown>;

  if ("is_confirmed" in record && record.is_confirmed !== "Y" && record.is_confirmed !== "N" && record.is_confirmed !== null) {
    return json({ error: "is_confirmed must be 'Y', 'N', or null" }, 400);
  }

  const patch: Partial<Record<(typeof SITE_PATCH_KEYS)[number], string | null>> = {};
  for (const key of SITE_PATCH_KEYS) {
    if (key in record) patch[key] = record[key] as string | null;
  }

  const updated = await updateSite(env.DB, id, patch, gate.user_id);
  if (!updated) return json({ error: "not found" }, 404);
  return json(updated);
}

/**
 * Read-only, so left reachable by a `staff` session — SiteView shows a
 * site's team roster to anyone viewing it — but scoped: a staff session can
 * only read the roster for a site they're actually assigned to, or they
 * could enumerate other sites' contact numbers by guessing IDs.
 */
export async function handleGetSiteTeam(request: Request, env: Env, siteId: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff" && !(await isUserAssignedToSite(env.DB, session.user_id, siteId))) {
    return json({ error: "forbidden" }, 403);
  }
  return json(await listSiteTeamMembers(env.DB, siteId));
}

/**
 * Admin-only. `user_id`, when present, is the "choose from dropdown" path
 * (migration 0011) — the member's name/phone come from their own account
 * server-side, never from client-sent fields, so a spoofed name/number in
 * the request body can't override the real profile.
 */
export async function handlePostSiteTeamMember(request: Request, env: Env, siteId: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const userId = typeof record.user_id === "string" && record.user_id ? record.user_id : null;

  let name: string;
  let contactNumber: string;
  if (userId) {
    const user = await getUserById(env.DB, userId);
    if (!user) return json({ error: "no such user" }, 404);
    // A missing phone no longer blocks assignment — contact_number is
    // NOT NULL in the schema, so "" stands in for "not on file yet" and can
    // be added later from the Staff page without re-doing the assignment.
    name = user.name;
    contactNumber = user.phone ?? "";
  } else {
    name = typeof record.name === "string" ? record.name.trim() : "";
    contactNumber = typeof record.contact_number === "string" ? record.contact_number.trim() : "";
    if (!name || !contactNumber) return json({ error: "name and contact_number are required" }, 400);
  }

  const member = await addSiteTeamMember(env.DB, siteId, name, contactNumber, gate.user_id, userId);
  return json(member, 201);
}

export async function handleGetEscalations(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  return json(await listOpenEscalations(env.DB));
}

export async function handlePostEscalation(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const text = typeof body === "object" && body !== null ? (body as Record<string, unknown>).text : undefined;
  if (typeof text !== "string" || text.trim().length === 0) return json({ error: "text is required" }, 400);

  const siteIdRaw = typeof body === "object" && body !== null ? (body as Record<string, unknown>).site_id : undefined;
  const siteId = typeof siteIdRaw === "string" && siteIdRaw.length > 0 ? siteIdRaw : null;

  const escalation = await createEscalation(env.DB, { text: text.trim(), siteId });
  return json(escalation, 201);
}

export async function handleCloseEscalation(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const updated = await closeEscalation(env.DB, id);
  if (!updated) return json({ error: "not found" }, 404);
  return json(updated);
}

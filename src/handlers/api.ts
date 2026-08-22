// GET /api/calls, GET /api/calls/:id, PATCH /api/todos/:id — Tasks 6-7.
// GET/POST /api/escalations, PATCH /api/escalations/:id, GET /api/sites,
// GET /api/sites/attention, PATCH /api/sites/:id, POST /api/sites/backfill,
// GET/POST /api/sites/:id/team — docs/ADDITIONAL_FEATURES_M0.md "Phase 1
// home page", the site confirmation workflow, and site details/team.

import {
  addSiteTeamMember,
  closeEscalation,
  createEscalation,
  getCallWithTodos,
  getConfirmedSitesSummary,
  getSitesNeedingAttention,
  linkCallToSites,
  listCallsForSiteScan,
  listCallsWithTodos,
  listOpenEscalations,
  listSiteTeamMembers,
  listSites,
  updateSite,
  updateTodo,
} from "@sbm/core";
import { scanCallForSites } from "../../packages/core/prompts/site-scan";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleGetCalls(env: Env): Promise<Response> {
  return json(await listCallsWithTodos(env.DB));
}

export async function handleGetCall(env: Env, id: string): Promise<Response> {
  const call = await getCallWithTodos(env.DB, id);
  if (!call) return json({ error: "not found" }, 404);
  return json(call);
}

const TODO_PATCH_KEYS = ["status", "completed_at", "snoozed_until"] as const;

export async function handlePatchTodo(request: Request, env: Env, id: string): Promise<Response> {
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

export async function handleGetSites(env: Env): Promise<Response> {
  return json(await listSites(env.DB));
}

export async function handleGetSitesAttention(env: Env): Promise<Response> {
  return json(await getSitesNeedingAttention(env.DB));
}

export async function handleGetConfirmedSites(env: Env): Promise<Response> {
  return json(await getConfirmedSitesSummary(env.DB));
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

  const updated = await updateSite(env.DB, id, patch);
  if (!updated) return json({ error: "not found" }, 404);
  return json(updated);
}

export async function handleGetSiteTeam(env: Env, siteId: string): Promise<Response> {
  return json(await listSiteTeamMembers(env.DB, siteId));
}

export async function handlePostSiteTeamMember(request: Request, env: Env, siteId: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const contactNumber = typeof record.contact_number === "string" ? record.contact_number.trim() : "";
  if (!name || !contactNumber) return json({ error: "name and contact_number are required" }, 400);

  const member = await addSiteTeamMember(env.DB, siteId, name, contactNumber);
  return json(member, 201);
}

export async function handleGetEscalations(env: Env): Promise<Response> {
  return json(await listOpenEscalations(env.DB));
}

export async function handlePostEscalation(request: Request, env: Env): Promise<Response> {
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

export async function handleCloseEscalation(env: Env, id: string): Promise<Response> {
  const updated = await closeEscalation(env.DB, id);
  if (!updated) return json({ error: "not found" }, 404);
  return json(updated);
}

// GET /api/calls, GET /api/calls/:id, PATCH /api/todos/:id — Tasks 6-7.
// GET/POST /api/escalations, PATCH /api/escalations/:id, GET /api/sites,
// GET /api/sites/attention — docs/ADDITIONAL_FEATURES_M0.md "Phase 1 home page".

import {
  closeEscalation,
  createEscalation,
  getCallWithTodos,
  getSitesNeedingAttention,
  listCallsWithTodos,
  listOpenEscalations,
  listSites,
  updateTodo,
} from "@sbm/core";
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

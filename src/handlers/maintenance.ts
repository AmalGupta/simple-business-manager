// GET /api/maintenance/site-contact-proposals, POST /api/maintenance/site-contact-mappings
// — admin/superadmin session only (same as /api/callers).

import { applySiteContactMappings, proposeSiteContactBackfill } from "@sbm/core";
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

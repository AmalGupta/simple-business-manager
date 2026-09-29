// SBM-64 — staff transitions: notice-period offboarding (migration 0050).
// Admin/superadmin only, session-cookie gated like the rest of /api/staff*.
//
//   GET    /api/staff/offboarding                        in-progress leavers + remaining counts
//   GET    /api/staff/:id/offboarding                    one leaver's open work, grouped client-side
//   POST   /api/staff/:id/offboarding                    { last_working_day } — start
//   PATCH  /api/staff/:id/offboarding                    { last_working_day } — change the date
//   DELETE /api/staff/:id/offboarding                    cancel
//   POST   /api/staff/:id/offboarding/transfer           { items: [{kind,id}], to_user_id | "self" }
//   POST   /api/staff/:id/offboarding/handover-site      { site_id, to_user_id }
//   POST   /api/staff/:id/offboarding/finish-now         finalize today instead of after the LWD
//   POST   /api/staff/:id/reactivate                     undo a finished offboarding

import {
  cancelOffboarding,
  finalizeOffboarding,
  getOffboardingDetail,
  getUserById,
  handOverSite,
  isIsoDate,
  istTodayIso,
  listOffboardingStaff,
  reactivateStaffUser,
  startOffboarding,
  transferWorkItems,
  updateLastWorkingDay,
  type OffboardItemKind,
} from "@sbm/core";
import { requireAdmin } from "./auth";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const ITEM_KINDS: readonly OffboardItemKind[] = ["todo", "site_task", "complaint"];

/** The leaver must be an existing staff account that hasn't already left. */
async function loadLeaver(env: Env, id: string) {
  const user = await getUserById(env.DB, id);
  if (!user || user.role !== "staff") return json({ error: "staff member not found" }, 404);
  if (user.disabled_at) return json({ error: "this staff member has already left" }, 409);
  return user;
}

/** A recipient is an active staff member other than the leaver, or the acting admin ("self"). */
async function resolveRecipient(env: Env, raw: unknown, leaverId: string, actorId: string): Promise<string | Response> {
  if (raw === "self") return actorId;
  if (typeof raw !== "string" || !raw) return json({ error: "to_user_id is required" }, 400);
  if (raw === leaverId) return json({ error: "cannot hand work back to the leaver" }, 400);
  if (raw === actorId) return actorId;
  const target = await getUserById(env.DB, raw);
  if (!target || target.role !== "staff" || target.disabled_at) {
    return json({ error: "to_user_id must be an active staff member" }, 400);
  }
  return raw;
}

export async function handleListOffboarding(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  return json(await listOffboardingStaff(env.DB));
}

export async function handleGetOffboarding(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const detail = await getOffboardingDetail(env.DB, id);
  if (!detail) return json({ error: "staff member not found" }, 404);
  return json(detail);
}

export async function handleStartOffboarding(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const user = await loadLeaver(env, id);
  if (user instanceof Response) return user;
  if (user.id === gate.user_id) return json({ error: "cannot offboard yourself" }, 400);
  const body = await readBody(request);
  const lwd = body.last_working_day;
  if (!isIsoDate(lwd)) return json({ error: "last_working_day must be yyyy-mm-dd" }, 400);
  if (lwd < istTodayIso()) return json({ error: "last working day can't be in the past" }, 400);

  if (request.method === "PATCH") {
    if (!user.last_working_day) return json({ error: "offboarding hasn't started" }, 409);
    await updateLastWorkingDay(env.DB, id, lwd);
  } else {
    if (user.last_working_day) return json({ error: "offboarding already started" }, 409);
    await startOffboarding(env.DB, id, lwd, gate.user_id);
  }
  return json({ ok: true, last_working_day: lwd });
}

export async function handleCancelOffboarding(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const user = await loadLeaver(env, id);
  if (user instanceof Response) return user;
  await cancelOffboarding(env.DB, id);
  return json({ ok: true });
}

export async function handleOffboardingTransfer(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const user = await loadLeaver(env, id);
  if (user instanceof Response) return user;
  const body = await readBody(request);
  const to = await resolveRecipient(env, body.to_user_id, id, gate.user_id);
  if (to instanceof Response) return to;
  const raw = Array.isArray(body.items) ? body.items : [];
  const items = raw
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    .map((i) => ({ kind: i.kind as OffboardItemKind, id: String(i.id ?? "") }))
    .filter((i) => ITEM_KINDS.includes(i.kind) && i.id);
  if (items.length === 0) return json({ error: "items is required" }, 400);
  const moved = await transferWorkItems(env.DB, { fromUserId: id, items, toUserId: to, actorUserId: gate.user_id });
  return json({ ok: true, moved, to_user_id: to });
}

export async function handleOffboardingHandoverSite(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const user = await loadLeaver(env, id);
  if (user instanceof Response) return user;
  const body = await readBody(request);
  const siteId = typeof body.site_id === "string" ? body.site_id : "";
  if (!siteId) return json({ error: "site_id is required" }, 400);
  const to = await resolveRecipient(env, body.to_user_id, id, gate.user_id);
  if (to instanceof Response) return to;
  const { moved } = await handOverSite(env.DB, { fromUserId: id, siteId, toUserId: to, actorUserId: gate.user_id });
  return json({ ok: true, moved, to_user_id: to });
}

export async function handleOffboardingFinishNow(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const user = await loadLeaver(env, id);
  if (user instanceof Response) return user;
  if (!user.last_working_day) return json({ error: "offboarding hasn't started" }, 409);
  const result = await finalizeOffboarding(env.DB, id, gate.user_id);
  return json({ ok: true, rerouted: result.rerouted, router_user_id: result.routerUserId });
}

export async function handleReactivateStaff(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const user = await getUserById(env.DB, id);
  if (!user || user.role !== "staff") return json({ error: "staff member not found" }, 404);
  if (!user.disabled_at) return json({ error: "this staff member is active" }, 409);
  await reactivateStaffUser(env.DB, id);
  return json({ ok: true });
}

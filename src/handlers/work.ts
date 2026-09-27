// Staff roster — migration 0044. Assigned work (call todos + site tasks) for
// one staff member, planning it onto a day, admin urgent flag, hand-off to a
// teammate, the admin roster grid, and the staff-by-staff audit trail.
//
//   GET   /api/work/assigned[?for_user_id=]     staff: own; admin: one staff member
//   PATCH /api/work/:kind/:id[?for_user_id=]    { scheduled_for } | { status: "done" } | { urgent }
//   POST  /api/work/:kind/:id/handoff[?for_user_id=]   { to_user_id }
//   GET   /api/work/roster?to=yyyy-mm-dd         admin
//   GET   /api/work/events?user_id=&before_seq=  admin
//
// "Subject" is whose share of the work a request acts on: staff → always
// self; admin → ?for_user_id= (required for per-assignee actions).

import {
  completeSiteTask,
  getStaffRosterGrid,
  getUserById,
  getWorkItemRef,
  handOffWork,
  istTodayIso,
  isWorkItemKind,
  listAssignedWork,
  listWorkEventsForUser,
  logWorkEvents,
  setWorkScheduledFor,
  setWorkUrgent,
  updateTodo,
  type WorkItemKind,
} from "@sbm/core";
import { requireSession } from "../lib/auth";
import { resolveForUserId } from "../lib/for-user-scope";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null) return json({ error: "invalid body" }, 400);
    return body as Record<string, unknown>;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
}

export async function handleGetAssignedWork(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const subject = await resolveForUserId(request, env, session);
  if (subject instanceof Response) return subject;
  if (!subject) return json({ error: "for_user_id required" }, 400);
  return json(await listAssignedWork(env.DB, subject));
}

export async function handlePatchWork(request: Request, env: Env, kindRaw: string, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (!isWorkItemKind(kindRaw)) return json({ error: "unknown kind" }, 404);
  const kind: WorkItemKind = kindRaw;
  const isAdmin = session.user_role !== "staff";

  const record = await readBody(request);
  if (record instanceof Response) return record;

  const ref = await getWorkItemRef(env.DB, kind, id);
  if (!ref) return json({ error: "not found" }, 404);

  // Admin-only: urgent flag.
  if ("urgent" in record) {
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    await setWorkUrgent(env.DB, ref, record.urgent === true, session.user_id);
    return json({ ok: true, urgent: record.urgent === true });
  }

  const subject = await resolveForUserId(request, env, session);
  if (subject instanceof Response) return subject;
  if (!subject) return json({ error: "for_user_id required" }, 400);
  if (!ref.assignee_ids.includes(subject)) return json({ error: "forbidden" }, 403);

  if ("scheduled_for" in record) {
    const raw = record.scheduled_for;
    const date = typeof raw === "string" && raw ? raw : null;
    if (date !== null && !isValidIsoDate(date)) return json({ error: "scheduled_for must be yyyy-mm-dd" }, 400);
    if (!isAdmin) {
      // Urgent work can't be postponed — it's pinned to today until done.
      if (ref.urgent_at) return json({ error: "urgent work cannot be rescheduled" }, 403);
      if (date !== null && date < istTodayIso()) return json({ error: "cannot plan work in the past" }, 400);
    }
    const { previous } = await setWorkScheduledFor(env.DB, kind, id, subject, date);
    if (previous !== date) {
      await logWorkEvents(env.DB, [
        {
          kind,
          itemId: id,
          siteId: ref.site_id,
          actorUserId: session.user_id,
          subjectUserId: subject,
          event: "scheduled",
          fromValue: previous,
          toValue: date,
        },
      ]);
    }
    return json({ ok: true, scheduled_for: date });
  }

  if (record.status === "done") {
    if (kind === "todo") {
      await updateTodo(env.DB, id, { status: "done", completed_at: new Date().toISOString() });
    } else {
      await completeSiteTask(env.DB, id, session.user_id);
    }
    await logWorkEvents(env.DB, [
      { kind, itemId: id, siteId: ref.site_id, actorUserId: session.user_id, subjectUserId: subject, event: "completed" },
    ]);
    return json({ ok: true });
  }

  return json({ error: "no recognised fields in patch" }, 400);
}

export async function handlePostWorkHandoff(request: Request, env: Env, kindRaw: string, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (!isWorkItemKind(kindRaw)) return json({ error: "unknown kind" }, 404);

  const record = await readBody(request);
  if (record instanceof Response) return record;
  const toUserId = typeof record.to_user_id === "string" ? record.to_user_id : "";
  if (!toUserId) return json({ error: "to_user_id required" }, 400);

  const subject = await resolveForUserId(request, env, session);
  if (subject instanceof Response) return subject;
  if (!subject) return json({ error: "for_user_id required" }, 400);
  if (toUserId === subject) return json({ error: "already assigned to this person" }, 400);

  const ref = await getWorkItemRef(env.DB, kindRaw, id);
  if (!ref) return json({ error: "not found" }, 404);
  if (!ref.assignee_ids.includes(subject)) return json({ error: "forbidden" }, 403);
  const openStatus = kindRaw === "todo" ? "open" : "assigned";
  if (ref.status !== openStatus) return json({ error: "work is no longer open" }, 409);

  const target = await getUserById(env.DB, toUserId);
  if (!target || target.role !== "staff" || target.disabled_at) return json({ error: "invalid to_user_id" }, 400);

  await handOffWork(env.DB, ref, subject, toUserId, session.user_id);
  return json({ ok: true });
}

export async function handleGetStaffRoster(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff") return json({ error: "forbidden" }, 403);
  const to = new URL(request.url).searchParams.get("to")?.trim() ?? "";
  if (!isValidIsoDate(to)) return json({ error: "to must be yyyy-mm-dd" }, 400);
  return json(await getStaffRosterGrid(env.DB, to));
}

export async function handleGetWorkEvents(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff") return json({ error: "forbidden" }, 403);
  const params = new URL(request.url).searchParams;
  const userId = params.get("user_id")?.trim() ?? "";
  if (!userId) return json({ error: "user_id required" }, 400);
  const limit = Number(params.get("limit") ?? "100");
  return json(
    await listWorkEventsForUser(env.DB, userId, {
      limit: Number.isFinite(limit) ? limit : 100,
      beforeSeq: params.get("before_seq") ? Number(params.get("before_seq")) : null,
    })
  );
}

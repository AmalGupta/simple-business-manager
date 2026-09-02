// GET /api/sites/:id/tasks, GET /api/site-tasks/open, PATCH /api/site-tasks/:id
// — the site-task workflow system, migration 0013. See the workflow
// management plan discussed with the owner: stages are independent task
// types with no pipeline order, admin assigns them from a site's "View work
// timeline" popup, and a staff member can hand off to a teammate directly
// when they complete their own stage.

import {
  assignSiteTask,
  completeSiteTask,
  getSiteTaskById,
  isUserActiveOnSiteTasks,
  listOpenSiteTasks,
  listSiteTasks,
  listUnassignedSiteTasksForSite,
  type SessionWithUser,
} from "@sbm/core";
import { requireSession } from "../lib/auth";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireAdmin(request: Request, env: Env): Promise<SessionWithUser | Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff") return json({ error: "forbidden" }, 403);
  return session;
}

/** Admin/superadmin only — all 23 stages for one site, for the "View work timeline" popup. */
export async function handleGetSiteTasks(request: Request, env: Env, siteId: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  return json(await listSiteTasks(env.DB, siteId));
}

/**
 * Any session. `staff` gets only their own open assignments (the personal
 * home tiles); admin/superadmin get every open assignment business-wide
 * (the same 8 tiles, counted across all staff). The dashboard groups this
 * flat list into category tiles client-side.
 */
export async function handleListOpenSiteTasks(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const forUserId = session.user_role === "staff" ? session.user_id : null;
  return json(await listOpenSiteTasks(env.DB, forUserId));
}

/** The handoff picker after marking a stage done — every still-unassigned stage at that site. Staff never see admin-only intake stages. */
export async function handleListUnassignedSiteTasks(request: Request, env: Env, siteId: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const excludeStaffHidden = session.user_role === "staff";
  return json(await listUnassignedSiteTasksForSite(env.DB, siteId, excludeStaffHidden));
}

/**
 * `{ status: "done" }` — completes a task. Allowed for admin/superadmin
 * always, or for `staff` only when it's their own assignment.
 *
 * `{ assigned_to_user_id, due_date? }` — assigns/reassigns a task.
 * admin/superadmin can always assign or reassign. `staff` can only assign a
 * currently-`unassigned` stage, and only on a site where they already hold
 * (or completed) another task — the narrow handoff permission from the plan.
 * A `staff` session can never reassign a stage someone else already holds.
 */
export async function handlePatchSiteTask(request: Request, env: Env, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);

  const task = await getSiteTaskById(env.DB, id);
  if (!task) return json({ error: "not found" }, 404);

  if (session.user_role === "staff" && task.category === "admin_intake") {
    return json({ error: "forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (typeof body !== "object" || body === null) return json({ error: "invalid body" }, 400);
  const record = body as Record<string, unknown>;

  if (record.status === "done") {
    if (session.user_role === "staff" && task.assigned_to_user_id !== session.user_id) {
      return json({ error: "forbidden" }, 403);
    }
    return json(await completeSiteTask(env.DB, id, session.user_id));
  }

  if (typeof record.assigned_to_user_id === "string" && record.assigned_to_user_id) {
    if (session.user_role === "staff") {
      if (task.status !== "unassigned") return json({ error: "forbidden" }, 403);
      if (!(await isUserActiveOnSiteTasks(env.DB, session.user_id, task.site_id))) {
        return json({ error: "forbidden" }, 403);
      }
    }
    const dueDate = typeof record.due_date === "string" ? record.due_date : record.due_date === null ? null : undefined;
    return json(await assignSiteTask(env.DB, id, { assignedToUserId: record.assigned_to_user_id, assignedByUserId: session.user_id, dueDate }));
  }

  return json({ error: "no recognised fields in patch" }, 400);
}

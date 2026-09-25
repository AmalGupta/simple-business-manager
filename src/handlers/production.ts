// GET/POST /api/production-jobs, GET /api/production-jobs/:id,
// GET /api/production-steps/open, PATCH /api/production-steps/:id,
// POST /api/production-jobs/:id/problems, PATCH /api/production-job-problems/:id
// — the production job tracker (migration 0041). Routed the same way as
// site-tasks.ts: X-SBM-Key gated at the router (src/index.ts), session used
// inside handlers for role/assignment logic. See migrations/
// 0041_production_warehouse.sql for the design rationale.

import {
  assignProductionStep,
  blockProductionStep,
  completeProductionStep,
  createProductionJob,
  createProductionJobProblem,
  getProductionJobById,
  getProductionJobProblemById,
  getProductionJobStepById,
  isUserActiveOnProductionJob,
  listOpenProductionSteps,
  listProductionJobProblems,
  listProductionJobs,
  listProductionJobSteps,
  resolveProductionJobProblem,
  type ProductionJobStatus,
  type SessionWithUser,
} from "@sbm/core";
import { requireSession } from "../lib/auth";
import { resolveForUserId } from "../lib/for-user-scope";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

async function requireAdmin(request: Request, env: Env): Promise<SessionWithUser | Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff") return json({ error: "forbidden" }, 403);
  return session;
}

const JOB_STATUSES: readonly ProductionJobStatus[] = ["active", "ready_for_dispatch", "dispatched", "completed"];

/** Admin/superadmin only — the Production tile's job list. Optional ?status= filter. */
export async function handleListProductionJobs(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const statusParam = new URL(request.url).searchParams.get("status");
  const status = statusParam && JOB_STATUSES.includes(statusParam as ProductionJobStatus) ? (statusParam as ProductionJobStatus) : null;
  return json(await listProductionJobs(env.DB, status));
}

/** Admin/superadmin only — office hands the survey over, which seeds all 5 steps. */
export async function handleCreateProductionJob(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const siteId = typeof record.site_id === "string" ? record.site_id.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const surveyNote = typeof record.survey_note === "string" ? record.survey_note : null;
  if (!siteId) return json({ error: "site_id is required" }, 400);
  if (!title) return json({ error: "title is required" }, 400);

  const job = await createProductionJob(env.DB, { siteId, title, surveyNote, createdByUserId: gate.user_id });
  return json(job, 201);
}

/** Any session — job + its steps + its problems, for the job detail screen (admin or the staff member working it). */
export async function handleGetProductionJob(request: Request, env: Env, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const job = await getProductionJobById(env.DB, id);
  if (!job) return json({ error: "not found" }, 404);
  const [steps, problems] = await Promise.all([listProductionJobSteps(env.DB, id), listProductionJobProblems(env.DB, id)]);
  return json({ job, steps, problems });
}

/**
 * Any session. `staff` gets only their own assigned steps (the "My
 * production steps" home tile); admin/superadmin get every currently-
 * assigned step business-wide, grouped by job client-side. Mirrors
 * handleListOpenSiteTasks.
 */
export async function handleListOpenProductionSteps(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const scoped = await resolveForUserId(request, env, session);
  if (scoped instanceof Response) return scoped;
  return json(await listOpenProductionSteps(env.DB, scoped));
}

/**
 * `{ status: "done", note? }` — completes a step (assignee or admin).
 * `{ status: "blocked", blocked_note }` — marks it blocked (assignee or admin).
 * `{ assigned_to_user_id }` — assign/reassign. admin/superadmin always;
 * `staff` only when they currently hold or completed another step on the
 * same job (the narrow handoff permission — mirrors handlePatchSiteTask),
 * and only onto a step whose previous step is already done (sequential gate).
 */
export async function handlePatchProductionStep(request: Request, env: Env, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);

  const step = await getProductionJobStepById(env.DB, id);
  if (!step) return json({ error: "not found" }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (typeof body !== "object" || body === null) return json({ error: "invalid body" }, 400);
  const record = body as Record<string, unknown>;

  if (record.status === "done") {
    if (session.user_role === "staff" && step.assigned_to_user_id !== session.user_id) {
      return json({ error: "forbidden" }, 403);
    }
    const note = typeof record.note === "string" ? record.note : undefined;
    return json(await completeProductionStep(env.DB, id, session.user_id, note));
  }

  if (record.status === "blocked") {
    if (session.user_role === "staff" && step.assigned_to_user_id !== session.user_id) {
      return json({ error: "forbidden" }, 403);
    }
    const blockedNote = typeof record.blocked_note === "string" ? record.blocked_note.trim() : "";
    if (!blockedNote) return json({ error: "blocked_note is required" }, 400);
    return json(await blockProductionStep(env.DB, id, blockedNote));
  }

  if (typeof record.assigned_to_user_id === "string" && record.assigned_to_user_id) {
    // Sequential gate: the previous step must be done before this one can
    // be assigned (glass_integration can't start before assembly, etc.).
    if (step.step_order > 1) {
      const siblings = await listProductionJobSteps(env.DB, step.job_id);
      const previous = siblings.find((s) => s.step_order === step.step_order - 1);
      if (previous && previous.status !== "done") {
        return json({ error: `"${previous.step_key}" must be done first` }, 409);
      }
    }
    if (session.user_role === "staff") {
      if (!(await isUserActiveOnProductionJob(env.DB, session.user_id, step.job_id))) {
        return json({ error: "forbidden" }, 403);
      }
    }
    return json(
      await assignProductionStep(env.DB, id, { assignedToUserId: record.assigned_to_user_id, assignedByUserId: session.user_id })
    );
  }

  return json({ error: "no recognised fields in patch" }, 400);
}

/** Raise a site problem against a job — any session working the job, or admin. Not gated on step order or site membership: Tanseem's "goes to site and resolves it" role can trigger at any point. */
export async function handlePostProductionJobProblem(request: Request, env: Env, jobId: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const job = await getProductionJobById(env.DB, jobId);
  if (!job) return json({ error: "not found" }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const description = typeof record.description === "string" ? record.description.trim() : "";
  if (!description) return json({ error: "description is required" }, 400);

  const problem = await createProductionJobProblem(env.DB, {
    jobId,
    siteId: job.site_id,
    description,
    raisedByUserId: session.user_id,
  });
  return json(problem, 201);
}

/** Resolve a site problem — assignee/admin (kept loose: any logged-in session, same as raising one). */
export async function handlePatchProductionJobProblem(request: Request, env: Env, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const problem = await getProductionJobProblemById(env.DB, id);
  if (!problem) return json({ error: "not found" }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const resolutionNote = typeof record.resolution_note === "string" ? record.resolution_note : null;
  const updated = await resolveProductionJobProblem(env.DB, id, session.user_id, resolutionNote);
  return json(updated);
}

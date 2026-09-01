// GET/POST /api/sites/:id/installations, GET /api/installations/:id,
// POST /api/installations/:id/updates, POST /api/installation-updates/:id/media,
// POST /api/sites/:id/complaints, GET /api/material-shortages,
// PATCH /api/material-shortages/:id — the staff field workflow (migration
// 0016): physical installations at a site, each with a repeatable 6-category
// checklist. Session-cookie gated throughout, same as site-media.ts and
// site-voice-note.ts (this is staff-initiated, not the office dashboard).

import {
  addSiteMedia,
  createEscalation,
  createInstallation,
  createInstallationUpdate,
  createMaterialShortage,
  getInstallationById,
  getInstallationUpdateById,
  insertCall,
  linkCallToInstallationUpdate,
  linkCallToSiteExplicit,
  listInstallationUpdates,
  listInstallations,
  listMaterialShortages,
  resolveMaterialShortage,
  setCallFailed,
  setCallSubmitted,
  type InstallationCategory,
  type InstallationUpdateCategory,
  type MaterialShortageStatus,
  type SessionWithUser,
} from "@sbm/core";
import { assertSiteMembership, requireSession } from "../lib/auth";
import { normalizeAudioContentType, submitRecording } from "../lib/sarvam";
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

const UPDATE_CATEGORIES: readonly InstallationUpdateCategory[] = [
  "location",
  "work_done",
  "work_pending",
  "material_short",
  "complaints",
  "site_delay",
];

/** The three site-visit categories sharing the `installations` table — see migration 0017. */
const INSTALLATION_CATEGORIES: readonly InstallationCategory[] = ["installation", "measurement", "material_delivery"];

function parseInstallationCategory(value: string | null): InstallationCategory | null {
  return value && INSTALLATION_CATEGORIES.includes(value as InstallationCategory) ? (value as InstallationCategory) : null;
}

export async function handleGetInstallations(env: Env, siteId: string, categoryParam: string | null): Promise<Response> {
  const category = parseInstallationCategory(categoryParam);
  if (!category) return json({ error: "invalid or missing category" }, 400);
  return json(await listInstallations(env.DB, siteId, category));
}

export async function handlePostInstallation(request: Request, env: Env, siteId: string, createdBy: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const label = record.label;
  if (typeof label !== "string" || label.trim().length === 0) return json({ error: "label is required" }, 400);
  const category = parseInstallationCategory(typeof record.category === "string" ? record.category : null);
  if (!category) return json({ error: "invalid or missing category" }, 400);
  return json(await createInstallation(env.DB, siteId, label.trim(), createdBy, category), 201);
}

/**
 * Installation + its full update history — the frontend groups by category
 * and shows the latest per category on the checklist. Membership is checked
 * here rather than at the router, same as handleGetMedia in site-media.ts:
 * the id alone doesn't reveal which site until the row is resolved.
 */
export async function handleGetInstallation(env: Env, id: string, session: SessionWithUser): Promise<Response> {
  const installation = await getInstallationById(env.DB, id);
  if (!installation) return json({ error: "not found" }, 404);
  if (!(await assertSiteMembership(env, session, installation.site_id))) return json({ error: "forbidden" }, 403);
  const updates = await listInstallationUpdates(env.DB, id);
  return json({ installation, updates });
}

/**
 * The required voice note for one checklist row. Reuses the exact pattern
 * in site-voice-note.ts (R2 write -> insertCall -> ctx.waitUntil(submit)),
 * plus stamps installation_update_id on both sides of the link and, for the
 * two categories with a dedicated ledger, dual-writes there immediately —
 * admin visibility into an open complaint or shortage shouldn't wait on the
 * optional photo/video that completes the checklist row.
 */
export async function handlePostInstallationUpdate(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  installationId: string,
  session: SessionWithUser
): Promise<Response> {
  const installation = await getInstallationById(env.DB, installationId);
  if (!installation) return json({ error: "not found" }, 404);
  if (!(await assertSiteMembership(env, session, installation.site_id))) return json({ error: "forbidden" }, 403);
  const reportedByUserId = session.user_id;

  const form = await request.formData();
  const category = form.get("category");
  if (typeof category !== "string" || !UPDATE_CATEGORIES.includes(category as InstallationUpdateCategory)) {
    return json({ error: "invalid or missing category" }, 400);
  }
  const file = form.get("recording");
  if (!(file instanceof File)) return json({ error: "Missing 'recording' file" }, 400);

  const installationUpdateId = crypto.randomUUID();
  const callId = crypto.randomUUID();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "m4a";
  const r2Key = `${env.INGEST_PREFIX}${callId}.${ext}`;

  await env.RECORDINGS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: normalizeAudioContentType(file.type) },
  });

  // installation_updates.voice_note_call_id needs the call's id to exist
  // first, so calls.installation_update_id can't be set until the update
  // row exists in turn — insert the call plain, then backfill the reverse
  // pointer once both rows are there (see linkCallToInstallationUpdate).
  await insertCall(env.DB, {
    id: callId,
    r2Key,
    source: "ios",
    recordedAt: new Date().toISOString(),
    recordingDate: null,
    durationS: null,
    recordedForSiteId: installation.site_id,
    uploadedByUserId: reportedByUserId,
  });
  await linkCallToSiteExplicit(env.DB, callId, installation.site_id);

  const update = await createInstallationUpdate(env.DB, {
    id: installationUpdateId,
    installationId,
    category: category as InstallationUpdateCategory,
    voiceNoteCallId: callId,
    reportedByUserId,
  });
  await linkCallToInstallationUpdate(env.DB, callId, installationUpdateId);

  if (category === "complaints") {
    await createEscalation(env.DB, {
      text: `Complaint reported during site visit — "${installation.label}". See linked voice note for details.`,
      siteId: installation.site_id,
      createdByUserId: reportedByUserId,
      source: "staff_field",
      installationUpdateId,
    });
  }
  if (category === "material_short") {
    await createMaterialShortage(env.DB, {
      siteId: installation.site_id,
      installationId,
      installationUpdateId,
      reportedByUserId,
    });
  }

  const callbackUrl = `${new URL(request.url).origin}/webhooks/sarvam`;
  ctx.waitUntil(
    submitRecording(env, r2Key, callbackUrl)
      .then((result) => setCallSubmitted(env.DB, callId, result.jobId))
      .catch((err) => setCallFailed(env.DB, callId, `submit: ${String(err)}`))
  );

  return json(update, 201);
}

/** Photo/video attached to an existing checklist row — thin wrapper around addSiteMedia, same R2 key scheme and MIME sniffing as site-media.ts. */
export async function handlePostInstallationUpdateMedia(request: Request, env: Env, updateId: string, session: SessionWithUser): Promise<Response> {
  const update = await getInstallationUpdateById(env.DB, updateId);
  if (!update) return json({ error: "not found" }, 404);
  if (!(await assertSiteMembership(env, session, update.site_id))) return json({ error: "forbidden" }, 403);
  const uploadedBy = session.user_id;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Missing 'file'" }, 400);

  const mediaType = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "photo" : null;
  if (!mediaType) return json({ error: "file must be an image or video" }, 400);

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const r2Key = `site-media/${update.site_id}/${crypto.randomUUID()}.${ext}`;
  await env.RECORDINGS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const media = await addSiteMedia(env.DB, {
    siteId: update.site_id,
    mediaType,
    r2Key,
    contentType: file.type || "application/octet-stream",
    fileSize: file.size ?? null,
    caption: null,
    uploadedBy,
    installationUpdateId: updateId,
  });

  return json(media, 201);
}

/**
 * Site-level complaint (the home category grid's "Complaints" box, not
 * nested in an installation). Text is always required — it's what goes in
 * the escalations.text column; a voice note is an optional attachment, not
 * gated the way the installation checklist's is.
 */
export async function handlePostSiteComplaint(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  siteId: string,
  reportedByUserId: string
): Promise<Response> {
  const form = await request.formData();
  const textField = form.get("text");
  const text = typeof textField === "string" ? textField.trim() : "";
  if (!text) return json({ error: "text is required" }, 400);

  const file = form.get("recording");
  if (file instanceof File) {
    const callId = crypto.randomUUID();
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "m4a";
    const r2Key = `${env.INGEST_PREFIX}${callId}.${ext}`;
    await env.RECORDINGS.put(r2Key, file.stream(), {
      httpMetadata: { contentType: normalizeAudioContentType(file.type) },
    });
    await insertCall(env.DB, {
      id: callId,
      r2Key,
      source: "ios",
      recordedAt: new Date().toISOString(),
      recordingDate: null,
      durationS: null,
      recordedForSiteId: siteId,
      uploadedByUserId: reportedByUserId,
    });
    await linkCallToSiteExplicit(env.DB, callId, siteId);
    const callbackUrl = `${new URL(request.url).origin}/webhooks/sarvam`;
    ctx.waitUntil(
      submitRecording(env, r2Key, callbackUrl)
        .then((result) => setCallSubmitted(env.DB, callId, result.jobId))
        .catch((err) => setCallFailed(env.DB, callId, `submit: ${String(err)}`))
    );
  }

  const escalation = await createEscalation(env.DB, {
    text,
    siteId,
    createdByUserId: reportedByUserId,
    source: "staff_field",
  });
  return json(escalation, 201);
}

/** Admin ledger — session-only, no X-SBM-Key, same pattern as /api/staff. */
export async function handleGetMaterialShortages(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const statusParam = new URL(request.url).searchParams.get("status");
  const status: MaterialShortageStatus | undefined = statusParam === "open" || statusParam === "fulfilled" ? statusParam : undefined;
  return json(await listMaterialShortages(env.DB, status));
}

export async function handlePatchMaterialShortage(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const updated = await resolveMaterialShortage(env.DB, id, gate.user_id);
  if (!updated) return json({ error: "not found" }, 404);
  return json(updated);
}

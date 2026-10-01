// SBM-103 — task updates (migration 0058).
//
//   GET  /api/work/:kind/:id/updates            task header + every post, newest first
//   POST /api/work/:kind/:id/updates            multipart { body, media[] } — "Share update" / admin reply
//   POST /api/work/:kind/:id/updates/seen       clears the green bubble for the caller
//   POST /api/work/:kind/:id/complete[?for_user_id=]
//        multipart { completed_body, completed_media[], pending_body, pending_media[] }
//        — mark done with notes; "completed" needs at least one input, a
//        non-empty "pending" spawns a follow-up task for the assignee
//   GET  /api/work/updates/inbox[?for_user_id=] items with unseen posts from the other side
//   GET  /api/task-update-media/:id             stream one voice note / photo / video
//
// Session-cookie gated like the other media routes (<img>/<audio> can't send
// X-SBM-Key). Admins see every item; staff only items they hold or have
// posted on. Voice notes are transcribed (Sarvam, single speaker) and never
// sent to extraction — the transcript lands via the shared Sarvam webhook.

import {
  canUserAccessTaskUpdates,
  createFollowupTask,
  createTaskUpdate,
  getTaskTimeline,
  getTaskUpdateMediaById,
  getWorkItemRef,
  getWorkItemTitle,
  isWorkItemKind,
  listTaskUpdateInbox,
  listTaskUpdates,
  markTaskUpdatesSeen,
  setTaskUpdateFollowup,
  setTaskUpdateMediaSubmitted,
  setTaskUpdateMediaTranscript,
  type NewTaskUpdateMedia,
  type SessionWithUser,
  type TaskUpdateMediaType,
  type WorkItemKind,
  type WorkItemRef,
} from "@sbm/core";
import { requireSession } from "../lib/auth";
import { resolveForUserId } from "../lib/for-user-scope";
import { streamR2Object } from "../lib/r2-stream";
import { normalizeAudioContentType, submitRecording } from "../lib/sarvam";
import { checkCanComplete, markWorkItemDone } from "./work";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

const MAX_BODY_CHARS = 4000;
const MAX_FILES_PER_SECTION = 10;

type Access = { session: SessionWithUser; kind: WorkItemKind; ref: WorkItemRef; isAdmin: boolean };

async function authorize(request: Request, env: Env, kindRaw: string, id: string): Promise<Access | Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (!isWorkItemKind(kindRaw)) return json({ error: "unknown kind" }, 404);
  const ref = await getWorkItemRef(env.DB, kindRaw, id);
  if (!ref) return json({ error: "not found" }, 404);
  const isAdmin = session.user_role !== "staff";
  if (!isAdmin && !(await canUserAccessTaskUpdates(env.DB, kindRaw, id, session.user_id))) {
    return json({ error: "forbidden" }, 403);
  }
  return { session, kind: kindRaw, ref, isAdmin };
}

function mediaTypeOf(file: File): TaskUpdateMediaType | null {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("audio/")) return "voice";
  if (type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
  return null;
}

function extOf(file: File, fallback: string): string {
  return file.name.includes(".") ? file.name.split(".").pop()! : fallback;
}

type Section = { body: string | null; files: File[] };

/** `prefix` is "" for a plain update, "completed_" / "pending_" for the done form. */
function readSection(form: FormData, prefix: string): Section | Response {
  const raw = form.get(`${prefix}body`);
  const body = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, MAX_BODY_CHARS) : null;
  const files = form.getAll(`${prefix}media`).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES_PER_SECTION) return json({ error: `at most ${MAX_FILES_PER_SECTION} files per section` }, 400);
  for (const f of files) {
    if (!mediaTypeOf(f)) return json({ error: "files must be a voice note, photo or video" }, 400);
  }
  return { body, files };
}

const isEmpty = (s: Section) => !s.body && s.files.length === 0;

/** Puts each file in R2 (voice → VOICE_NOTES for Sarvam, photo/video → RECORDINGS). */
async function storeFiles(env: Env, kind: WorkItemKind, itemId: string, files: File[]): Promise<NewTaskUpdateMedia[]> {
  const out: NewTaskUpdateMedia[] = [];
  for (const file of files) {
    const mediaType = mediaTypeOf(file)!;
    const id = crypto.randomUUID();
    const contentType = mediaType === "voice" ? normalizeAudioContentType(file.type) : file.type || "application/octet-stream";
    const r2Key = `task-updates/${kind}/${itemId}/${id}.${extOf(file, mediaType === "voice" ? "m4a" : "bin")}`;
    const bucket = mediaType === "voice" ? env.VOICE_NOTES : env.RECORDINGS;
    await bucket.put(r2Key, file.stream(), { httpMetadata: { contentType } });
    out.push({ id, mediaType, r2Key, contentType, fileSize: file.size ?? null });
  }
  return out;
}

function transcribeVoice(request: Request, env: Env, ctx: ExecutionContext, media: NewTaskUpdateMedia[]): void {
  const callbackUrl = `${new URL(request.url).origin}/webhooks/sarvam`;
  for (const m of media) {
    if (m.mediaType !== "voice") continue;
    ctx.waitUntil(
      submitRecording(env, m.r2Key, callbackUrl, { diarize: false })
        .then((result) => setTaskUpdateMediaSubmitted(env.DB, m.id, result.jobId))
        .catch((err) => {
          console.error("[task update] transcription submit failed", m.id, err);
          return setTaskUpdateMediaTranscript(env.DB, m.id, { transcript: null, status: "failed" });
        })
    );
  }
}

async function postSection(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  access: Access,
  section: "update" | "completed" | "pending",
  part: Section
): Promise<string> {
  const media = await storeFiles(env, access.kind, access.ref.id, part.files);
  const updateId = await createTaskUpdate(env.DB, {
    kind: access.kind,
    itemId: access.ref.id,
    siteId: access.ref.site_id,
    authorUserId: access.session.user_id,
    section,
    body: part.body,
    media,
  });
  transcribeVoice(request, env, ctx, media);
  return updateId;
}

export async function handleGetTaskUpdates(request: Request, env: Env, kindRaw: string, id: string): Promise<Response> {
  const access = await authorize(request, env, kindRaw, id);
  if (access instanceof Response) return access;
  const [task, updates] = await Promise.all([getTaskTimeline(env.DB, access.kind, id), listTaskUpdates(env.DB, access.kind, id)]);
  return json({ task, updates });
}

export async function handlePostTaskUpdate(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  kindRaw: string,
  id: string
): Promise<Response> {
  const access = await authorize(request, env, kindRaw, id);
  if (access instanceof Response) return access;
  const part = readSection(await request.formData(), "");
  if (part instanceof Response) return part;
  if (isEmpty(part)) return json({ error: "add a note, voice note, photo or video" }, 400);
  const updateId = await postSection(request, env, ctx, access, "update", part);
  return json({ ok: true, id: updateId }, 201);
}

export async function handlePostTaskUpdatesSeen(request: Request, env: Env, kindRaw: string, id: string): Promise<Response> {
  const access = await authorize(request, env, kindRaw, id);
  if (access instanceof Response) return access;
  await markTaskUpdatesSeen(env.DB, access.kind, id, access.session.user_id);
  return json({ ok: true });
}

export async function handlePostTaskComplete(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  kindRaw: string,
  id: string
): Promise<Response> {
  const access = await authorize(request, env, kindRaw, id);
  if (access instanceof Response) return access;
  const subject = await resolveForUserId(request, env, access.session);
  if (subject instanceof Response) return subject;
  if (!subject) return json({ error: "for_user_id required" }, 400);
  if (!access.ref.assignee_ids.includes(subject)) return json({ error: "forbidden" }, 403);
  const openStatus = access.kind === "site_task" ? "assigned" : "open";
  if (access.ref.status !== openStatus) return json({ error: "work is no longer open" }, 409);
  const blocked = await checkCanComplete(env, access.kind, id, access.isAdmin);
  if (blocked) return blocked;

  const form = await request.formData();
  const completed = readSection(form, "completed_");
  if (completed instanceof Response) return completed;
  const pending = readSection(form, "pending_");
  if (pending instanceof Response) return pending;
  if (isEmpty(completed)) return json({ error: "add what was completed — a note, voice note, photo or video" }, 400);

  const title = await getWorkItemTitle(env.DB, access.kind, id);
  await postSection(request, env, ctx, access, "completed", completed);
  const pendingId = isEmpty(pending) ? null : await postSection(request, env, ctx, access, "pending", pending);
  await markWorkItemDone(env, access.ref, subject, access.session.user_id);

  let followup: { kind: WorkItemKind; id: string } | null = null;
  if (pendingId) {
    followup = await createFollowupTask(env.DB, {
      kind: access.kind,
      itemId: id,
      title,
      pendingBody: pending.body,
      staffUserId: subject,
      actorUserId: access.session.user_id,
    });
    if (followup) await setTaskUpdateFollowup(env.DB, pendingId, followup.kind, followup.id);
  }
  return json({ ok: true, followup });
}

export async function handleGetTaskUpdateInbox(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const subject = await resolveForUserId(request, env, session);
  if (subject instanceof Response) return subject;
  // An admin on a staff bookmark sees that staff member's inbox.
  const asStaff = session.user_role === "staff" || Boolean(subject);
  const viewerId = subject ?? session.user_id;
  return json(await listTaskUpdateInbox(env.DB, viewerId, asStaff ? "staff" : session.user_role));
}

export async function handleGetTaskUpdateMedia(request: Request, env: Env, mediaId: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return new Response("Unauthorized", { status: 401 });
  const media = await getTaskUpdateMediaById(env.DB, mediaId);
  if (!media) return new Response("Not found", { status: 404 });
  if (session.user_role === "staff") {
    const onItem = await canUserAccessTaskUpdates(env.DB, media.item_kind, media.item_id, session.user_id);
    const onFollowup =
      !onItem && media.followup_kind && media.followup_id
        ? await canUserAccessTaskUpdates(env.DB, media.followup_kind, media.followup_id, session.user_id)
        : false;
    if (!onItem && !onFollowup) return new Response("Forbidden", { status: 403 });
  }
  const bucket = media.media_type === "voice" ? env.VOICE_NOTES : env.RECORDINGS;
  return streamR2Object(bucket, media.r2_key, media.content_type ?? undefined, request);
}

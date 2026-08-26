// GET/POST /api/sites/:id/media, GET /api/media/:mediaId, and
// GET /api/calls/:id/recording (voice-note/call audio playback) — all
// session-cookie-gated (see src/lib/auth.ts header comment: <img>/<video>/
// <audio> tags can't attach the X-SBM-Key header the rest of /api/* uses).

import { addSiteMedia, getCallById, getSiteMediaById, isCallRecordingAccessibleToUser, listSiteMedia, type SessionWithUser } from "@sbm/core";
import { streamR2Object } from "../lib/r2-stream";
import { assertSiteMembership } from "../lib/auth";
import type { Env } from "../index";

const MEDIA_PREFIX = "site-media/";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function extOf(file: File): string {
  return file.name.includes(".") ? file.name.split(".").pop()! : "bin";
}

export async function handleGetSiteMedia(env: Env, siteId: string): Promise<Response> {
  return json(await listSiteMedia(env.DB, siteId));
}

export async function handlePostSiteMedia(request: Request, env: Env, siteId: string, uploadedBy: string): Promise<Response> {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Missing 'file'" }, 400);

  const mediaType = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "photo" : null;
  if (!mediaType) return json({ error: "file must be an image or video" }, 400);

  const captionField = form.get("caption");
  const caption = typeof captionField === "string" && captionField.trim() ? captionField.trim() : null;

  const r2Key = `${MEDIA_PREFIX}${siteId}/${crypto.randomUUID()}.${extOf(file)}`;
  await env.RECORDINGS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const media = await addSiteMedia(env.DB, {
    siteId,
    mediaType,
    r2Key,
    contentType: file.type || "application/octet-stream",
    fileSize: file.size ?? null,
    caption,
    uploadedBy,
  });

  return json(media, 201);
}

export async function handleGetMedia(
  request: Request,
  env: Env,
  mediaId: string,
  session: SessionWithUser
): Promise<Response> {
  const media = await getSiteMediaById(env.DB, mediaId);
  if (!media) return new Response("Not found", { status: 404 });
  if (!(await assertSiteMembership(env, session, media.site_id))) return new Response("Forbidden", { status: 403 });
  return streamR2Object(env.RECORDINGS, media.r2_key, media.content_type, request);
}

/**
 * Session-gated, but not merely session-gated: a `staff` session must also
 * be on the team roster for a site this call is linked to (recording, not
 * transcript/todos — see isCallRecordingAccessibleToUser). Previously any
 * authenticated session could stream any call's raw audio by call id alone.
 */
export async function handleGetCallRecording(
  request: Request,
  env: Env,
  callId: string,
  session: SessionWithUser
): Promise<Response> {
  const call = await getCallById(env.DB, callId);
  if (!call) return new Response("Not found", { status: 404 });
  if (session.user_role === "staff" && !(await isCallRecordingAccessibleToUser(env.DB, session.user_id, callId))) {
    return new Response("Forbidden", { status: 403 });
  }
  // No content-type column on `calls` — streamR2Object falls back to
  // whatever was set on the object at upload time (see r2-stream.ts).
  return streamR2Object(env.RECORDINGS, call.r2_key, undefined, request);
}

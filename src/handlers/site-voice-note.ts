// POST /api/sites/:id/voice-note — a voice memo recorded on a site's page,
// deliberately routed through the same call pipeline as a real phone
// recording (R2 -> Sarvam -> Claude extraction) rather than being a
// separate raw-audio attachment type, since the infra already exists. The
// only difference from handleUploadPost (upload.ts) is that the site link
// and uploader are set explicitly at upload time instead of waiting for
// extraction to infer a site from transcript content.

import {
  createSiteVoiceNoteTask,
  getSiteName,
  getUserById,
  insertCall,
  linkCallToSiteExplicit,
  setCallFailed,
  setCallSubmitted,
} from "@sbm/core";
import { normalizeAudioContentType, submitRecording } from "../lib/sarvam";
import { buildVoiceNoteKey } from "../lib/voice-note-key";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export async function handlePostSiteVoiceNote(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  siteId: string,
  uploadedByUserId: string
): Promise<Response> {
  const form = await request.formData();
  const file = form.get("recording");
  if (!(file instanceof File)) return json({ error: "Missing 'recording' file" }, 400);

  const callId = crypto.randomUUID();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "m4a";
  const recordedAt = new Date().toISOString();
  const [uploader, siteName] = await Promise.all([getUserById(env.DB, uploadedByUserId), getSiteName(env.DB, siteId)]);
  const r2Key = buildVoiceNoteKey({
    speaker: uploader?.name ?? "Unknown",
    metadata: siteName ? [siteName] : [],
    recordedAtIso: recordedAt,
    id: callId,
    ext: ext ?? "m4a",
  });

  await env.VOICE_NOTES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: normalizeAudioContentType(file.type) },
  });

  await insertCall(env.DB, {
    id: callId,
    r2Key,
    source: "ios",
    recordedAt,
    recordingDate: null,
    durationS: null,
    recordedForSiteId: siteId,
    uploadedByUserId,
  });
  await linkCallToSiteExplicit(env.DB, callId, siteId);

  /* Fan the recording out as one shared task to everyone assigned to the
     site. Awaited rather than deferred to waitUntil: the point is that the
     recording becomes actionable the moment it's uploaded, so the caller's
     immediate refetch has to see it. It's two small writes.

     Deliberately before Sarvam is even submitted, and independent of it —
     the todos Claude extracts from the transcript land later with
     origin='llm'. A transcription that fails still leaves the task, which
     is the right outcome: the audio is playable regardless. */
  const task = await createSiteVoiceNoteTask(env.DB, {
    callId,
    siteId,
    siteName,
    uploaderName: uploader?.name ?? null,
    uploadedByUserId,
  });

  const callbackUrl = `${new URL(request.url).origin}/webhooks/sarvam`;
  ctx.waitUntil(
    submitRecording(env, r2Key, callbackUrl)
      .then((result) => setCallSubmitted(env.DB, callId, result.jobId))
      .catch((err) => setCallFailed(env.DB, callId, `submit: ${String(err)}`))
  );

  // assignedTo is [] when nobody is on the site — see createSiteVoiceNoteTask.
  return json({ callId, todoId: task?.todoId ?? null, assignedTo: task?.assigneeUserIds ?? [] }, 202);
}

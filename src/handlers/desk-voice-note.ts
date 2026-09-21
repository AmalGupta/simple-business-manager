// POST /api/desk-voice-note — admin/superadmin records a desk conversation
// from the home header mic. Same Sarvam → Claude → todos pipeline as a
// phone call / site voice memo, but no site link and no Drive caller.
// uploaded_by_user_id is the recorder; extraction auto-assigns staff from
// spoken owners with assigned_by = that recorder.

import {
  getUserById,
  insertCall,
  setCallFailed,
  setCallSubmitted,
} from "@sbm/core";
import { requireAdmin } from "./auth";
import { normalizeAudioContentType, submitRecording } from "../lib/sarvam";
import { buildVoiceNoteKey } from "../lib/voice-note-key";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

export async function handlePostDeskVoiceNote(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const form = await request.formData();
  const file = form.get("recording");
  if (!(file instanceof File)) return json({ error: "Missing 'recording' file" }, 400);

  const callId = crypto.randomUUID();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "m4a";
  const recordedAt = new Date().toISOString();
  const uploader = await getUserById(env.DB, gate.user_id);
  const r2Key = buildVoiceNoteKey({
    speaker: uploader?.name ?? "Unknown",
    metadata: ["desk"],
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
    uploadedByUserId: gate.user_id,
  });

  const callbackUrl = `${new URL(request.url).origin}/webhooks/sarvam`;
  ctx.waitUntil(
    submitRecording(env, r2Key, callbackUrl)
      .then((result) => setCallSubmitted(env.DB, callId, result.jobId))
      .catch((err) => setCallFailed(env.DB, callId, `submit: ${String(err)}`))
  );

  return json({ callId }, 202);
}

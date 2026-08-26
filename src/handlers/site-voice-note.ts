// POST /api/sites/:id/voice-note — a voice memo recorded on a site's page,
// deliberately routed through the same call pipeline as a real phone
// recording (R2 -> Sarvam -> Claude extraction) rather than being a
// separate raw-audio attachment type, since the infra already exists. The
// only difference from handleUploadPost (upload.ts) is that the site link
// and uploader are set explicitly at upload time instead of waiting for
// extraction to infer a site from transcript content.

import { insertCall, linkCallToSiteExplicit, setCallFailed, setCallSubmitted } from "@sbm/core";
import { normalizeAudioContentType, submitRecording } from "../lib/sarvam";
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
    uploadedByUserId,
  });
  await linkCallToSiteExplicit(env.DB, callId, siteId);

  const callbackUrl = `${new URL(request.url).origin}/webhooks/sarvam`;
  ctx.waitUntil(
    submitRecording(env, r2Key, callbackUrl)
      .then((result) => setCallSubmitted(env.DB, callId, result.jobId))
      .catch((err) => setCallFailed(env.DB, callId, `submit: ${String(err)}`))
  );

  return json({ callId }, 202);
}

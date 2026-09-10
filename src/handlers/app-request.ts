// In-app "request or report an issue" form — voice only. A staff or admin
// session records a short spoken request; it's routed through the same
// Sarvam batch pipeline as a site voice note (src/lib/sarvam.ts), and once
// the webhook (src/handlers/stt-webhook.ts) gets the transcript back, it's
// formatted with Claude and filed straight into Jira (src/lib/jira.ts).
// Session-cookie gated only, same pattern as /api/complaints — not
// X-SBM-Key, since this is a page a staff member fills out on their own
// phone, not a request the admin dashboard makes on Amal's behalf.

import { createAppRequest, listAppRequests, markAppRequestFailed, setAppRequestSubmittedToStt } from "@sbm/core";
import { requireSession } from "../lib/auth";
import { normalizeAudioContentType, submitRecording } from "../lib/sarvam";
import { buildVoiceNoteKey } from "../lib/voice-note-key";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

/**
 * Stores the recording, creates the row, and kicks off the Sarvam submit in
 * the background — mirrors handlePostSiteVoiceNote. Returns 202 immediately
 * with the row at status "pending"; the client polls GET /api/app-requests
 * for it to move to "transcribing" then "submitted"/"failed".
 */
export async function handlePostAppRequestVoiceNote(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);

  const form = await request.formData();
  const file = form.get("recording");
  if (!(file instanceof File)) return json({ error: "Missing 'recording' file" }, 400);

  const id = crypto.randomUUID();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "m4a";
  const r2Key = buildVoiceNoteKey({
    speaker: session.user_name,
    metadata: ["app-request"],
    recordedAtIso: new Date().toISOString(),
    id,
    ext: ext ?? "m4a",
  });

  await env.VOICE_NOTES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: normalizeAudioContentType(file.type) },
  });

  const created = await createAppRequest(env.DB, {
    id,
    createdByUserId: session.user_id,
    createdByName: session.user_name,
    createdByRole: session.user_role,
    r2Key,
  });

  const callbackUrl = `${new URL(request.url).origin}/webhooks/sarvam`;
  ctx.waitUntil(
    // One speaker — no diarization, unlike a two-party call.
    submitRecording(env, r2Key, callbackUrl, { diarize: false })
      .then((result) => setAppRequestSubmittedToStt(env.DB, created.id, result.jobId))
      .catch((err) => markAppRequestFailed(env.DB, created.id, `submit: ${String(err)}`))
  );

  return json(created, 202);
}

/** Staff see only their own past submissions; admin/superadmin see everyone's. */
export async function handleGetAppRequests(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const forUserId = session.user_role === "staff" ? session.user_id : null;
  return json(await listAppRequests(env.DB, forUserId));
}

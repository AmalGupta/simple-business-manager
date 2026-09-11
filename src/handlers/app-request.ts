// In-app "request or report an issue" form — voice only. A staff or admin
// session records a short spoken request; it's routed through the same
// Sarvam batch pipeline as a site voice note (src/lib/sarvam.ts), and once
// the webhook (src/handlers/stt-webhook.ts) gets the transcript back, it's
// formatted with Claude and filed straight into Jira (src/lib/jira.ts).
// Session-cookie gated only, same pattern as /api/complaints — not
// X-SBM-Key, since this is a page a staff member fills out on their own
// phone, not a request the admin dashboard makes on Amal's behalf.

import {
  createAppRequest,
  deleteAppRequest,
  getAppRequestById,
  listAppRequests,
  markAppRequestFailed,
  setAppRequestSubmittedToStt,
  updateAppRequestJiraStatus,
  type AppRequest,
} from "@sbm/core";
import { requireSession } from "../lib/auth";
import { closeJiraIssue, fetchJiraIssueStatuses } from "../lib/jira";
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

/** Pull fresh Jira statuses for every filed ticket and persist any changes. */
async function syncJiraStatuses(env: Env, rows: AppRequest[]): Promise<AppRequest[]> {
  const keyed = rows.filter((r) => r.jira_issue_key);
  if (keyed.length === 0) return rows;

  const statuses = await fetchJiraIssueStatuses(
    env,
    keyed.map((r) => r.jira_issue_key!)
  );
  if (statuses.size === 0) return rows;

  const updates: Promise<void>[] = [];
  const next = rows.map((row) => {
    const key = row.jira_issue_key;
    if (!key) return row;
    const status = statuses.get(key);
    if (!status || status === row.jira_status) return row;
    updates.push(updateAppRequestJiraStatus(env.DB, row.id, status));
    return { ...row, jira_status: status };
  });
  if (updates.length > 0) await Promise.all(updates);
  return next;
}

/** Each user only sees their own past submissions; statuses refreshed from Jira. */
export async function handleGetAppRequests(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const rows = await listAppRequests(env.DB, session.user_id);
  return json(await syncJiraStatuses(env, rows));
}

/**
 * Deletes the caller's own row. Body `{ closeJira?: boolean }` — when true and
 * the row has a Jira key, transitions that issue to Done and comments
 * "deleted from the table by the user - <name>" before removing the row.
 */
export async function handleDeleteAppRequest(request: Request, env: Env, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);

  const row = await getAppRequestById(env.DB, id);
  if (!row) return json({ error: "not found" }, 404);
  if (row.created_by_user_id !== session.user_id) return json({ error: "forbidden" }, 403);

  let closeJira = false;
  try {
    const body = (await request.json()) as { closeJira?: unknown };
    closeJira = Boolean(body?.closeJira);
  } catch {
    // empty body is fine — delete without closing
  }

  if (closeJira && row.jira_issue_key) {
    try {
      await closeJiraIssue(
        env,
        row.jira_issue_key,
        `deleted from the table by the user - ${session.user_name}`
      );
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  }

  if (row.r2_key) {
    try {
      await env.VOICE_NOTES.delete(row.r2_key);
    } catch {
      // best-effort; row delete still proceeds
    }
  }

  await deleteAppRequest(env.DB, id);
  return new Response(null, { status: 204 });
}

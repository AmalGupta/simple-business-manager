// Task 4 (checkpoint) — Sarvam callback → transcript → D1, then Task 5 extraction
// in ctx.waitUntil. See docs/SCAFFOLDING.md §5 for the job flow and docs/BUILD_BRIEF.md
// "Stop and show me the transcript before continuing" for why Task 4 is a hard gate.
//
// Body shape confirmed against a real live callback on 2026-08-21:
// {"job_id": "...", "job_type": "SPEECH_TO_TEXT_BULK", "status": "Completed",
//  "completion_time": "...", "error": ""} — note "status", not "job_state" as
// an earlier draft of this file assumed (that mismatch was silently eating
// every real callback: undefined !== "Completed" fell through to a no-op).
//
// Callers Directory (migration 0021) — a 'staff' caller is trusted and goes
// straight to extraction, same as before this feature. Anything else
// ('client' category, or a legacy call with no linked caller) runs the
// cheap spam-scan first: a spam verdict marks the caller's directory entry
// spam, soft-deletes this call, deletes the R2 recording, and moves the
// Drive file into the Spam folder — extraction and site-scan never run.
// Family callers never reach this handler at all — see
// src/lib/drive-calls-poller.ts, which skips them before transcription.

import { ACTIVE } from "../../packages/core/prompts";
import { extractCall } from "../../packages/core/prompts/extract";
import { formatSpokenRequest } from "../../packages/core/prompts/app-request-format";
import { scanCallForSites } from "../../packages/core/prompts/site-scan";
import { scanCallForSpam } from "../../packages/core/prompts/spam-scan";
import {
  getAppRequestByJobId,
  getCallByJobId,
  type AppRequest,
  getCallerById,
  linkCallToSites,
  markAppRequestFailed,
  markAppRequestSubmitted,
  markCallerSpam,
  saveExtraction,
  setCallFailed,
  setCallTranscribed,
  softDeleteCallAsSpam,
  type Call,
  type DiarizedEntry,
} from "@sbm/core";
import { fetchResult } from "../lib/sarvam";
import { createJiraIssue } from "../lib/jira";
import { moveDriveFile } from "../lib/google-drive";
import type { Env } from "../index";

interface SarvamWebhookBody {
  job_id: string;
  status: string;
  error?: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Main Sonnet extraction + the parallel Haiku site-scan. Shared by the trusted-staff path and the not-spam client path below. */
async function runExtractionAndSiteScan(
  env: Env,
  call: Call,
  entries: DiarizedEntry[],
  callerName: string | null
): Promise<void> {
  await Promise.all([
    (async () => {
      try {
        if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
        const extraction = await extractCall({
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.ANTHROPIC_MODEL,
          clientName: callerName,
          recordedAt: call.recorded_at,
          entries,
        });
        await saveExtraction(env.DB, call.id, extraction, ACTIVE.version);
      } catch (err) {
        await setCallFailed(env.DB, call.id, `extraction: ${String(err)}`);
      }
    })(),
    (async () => {
      try {
        if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
        const sites = await scanCallForSites({
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.ANTHROPIC_HAIKU_MODEL,
          entries,
        });
        if (sites.length > 0) await linkCallToSites(env.DB, call.id, sites);
      } catch (err) {
        // A scan failure must never mark the call failed or block extraction.
        console.error("[site scan] failed for call", call.id, err);
      }
    })(),
  ]);
}

/** Spam verdict on a call from a not-yet-known caller: mark the directory, soft-delete, delete R2, move the Drive file — never runs extraction/site-scan. */
async function handleSpamVerdict(env: Env, ctx: ExecutionContext, call: Call, callerId: string | null): Promise<void> {
  if (callerId) await markCallerSpam(env.DB, callerId);
  await softDeleteCallAsSpam(env.DB, call.id);
  try {
    await env.VOICE_NOTES.delete(call.r2_key);
  } catch (err) {
    console.error("[spam] R2 delete failed for call", call.id, err);
  }
  if (call.drive_file_id && env.GOOGLE_DRIVE_ARCHIVE_FOLDER_ID && env.GOOGLE_DRIVE_SPAM_FOLDER_ID) {
    const driveFileId = call.drive_file_id;
    const archiveId = env.GOOGLE_DRIVE_ARCHIVE_FOLDER_ID;
    const spamId = env.GOOGLE_DRIVE_SPAM_FOLDER_ID;
    ctx.waitUntil(
      moveDriveFile(env, driveFileId, { addParentId: spamId, removeParentId: archiveId }).catch((err) =>
        console.error("[spam] drive move failed for call", call.id, err)
      )
    );
  }
}

/**
 * The in-app "request/report an issue" branch — a spoken staff/admin
 * request, not a call. Format with a cheap Haiku pass, then file straight
 * into Jira with a title prefixed by who filed it. Any failure here (Claude
 * or Jira) lands the row at status 'failed' with the transcript preserved,
 * same as the call branch never losing a transcript to an extraction error.
 */
async function processAppRequest(env: Env, appRequest: AppRequest, transcript: string): Promise<void> {
  try {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const formatted = await formatSpokenRequest({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_HAIKU_MODEL,
      transcript,
      knownSubmitterName: appRequest.created_by_name,
    });
    const prefix = appRequest.created_by_role === "staff" ? "[Staff-Request]" : "[Admin-Request]";
    const issue = await createJiraIssue(env, {
      summary: `${prefix} ${formatted.title}`,
      description: `${formatted.summary}\n\n---\nTranscript:\n${transcript}`,
      reporterName: `${formatted.speakerName} (${appRequest.created_by_role})`,
    });
    await markAppRequestSubmitted(env.DB, appRequest.id, {
      transcript,
      speakerName: formatted.speakerName,
      title: formatted.title,
      summary: formatted.summary,
      jiraIssueKey: issue.key,
      jiraIssueUrl: issue.url,
      jiraStatus: issue.status,
    });
  } catch (err) {
    console.error("[app-request] processing failed for", appRequest.id, err);
    await markAppRequestFailed(env.DB, appRequest.id, err instanceof Error ? err.message : String(err), transcript);
  }
}

export async function handleSarvamWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (!env.SARVAM_WEBHOOK_TOKEN) return new Response("Webhook not configured", { status: 500 });

  const token = request.headers.get("X-SARVAM-JOB-CALLBACK-TOKEN") ?? "";
  if (!timingSafeEqual(token, env.SARVAM_WEBHOOK_TOKEN)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rawBody = await request.text();
  console.log("[sarvam webhook] raw body:", rawBody);

  let body: SarvamWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  // App-request voice notes (migration 0033/0034) share this same job_id
  // space but never appear in `calls` — check there first so a spoken
  // request doesn't 404.
  const call = await getCallByJobId(env.DB, body.job_id);
  const appRequest = call ? null : await getAppRequestByJobId(env.DB, body.job_id);
  if (!call && !appRequest) return new Response("Unknown job_id", { status: 404 });

  if (body.status !== "Completed") {
    // Acknowledge intermediate/failed states without processing.
    if (body.status === "Failed") {
      const message = `Sarvam status: ${body.status}${body.error ? ` — ${body.error}` : ""}`;
      if (call) await setCallFailed(env.DB, call.id, message);
      if (appRequest) await markAppRequestFailed(env.DB, appRequest.id, message);
    }
    return new Response("ok", { status: 200 });
  }

  if (appRequest) {
    try {
      const result = await fetchResult(env, body.job_id);
      await processAppRequest(env, appRequest, result.transcript ?? "");
    } catch (err) {
      await markAppRequestFailed(env.DB, appRequest.id, `webhook: ${String(err)}`);
    }
    return new Response("ok", { status: 200 });
  }
  if (!call) return new Response("Unknown job_id", { status: 404 }); // unreachable — narrows the type below

  try {
    const result = await fetchResult(env, body.job_id);
    await setCallTranscribed(
      env.DB,
      call.id,
      call.r2_key,
      result.transcript,
      result.language_code ?? null,
      result.diarized_transcript ? JSON.stringify(result.diarized_transcript) : null
    );

    // Sarvam doesn't always return diarized_transcript despite with_diarization
    // being requested (see docs/SCAFFOLDING.md §5) — falling straight to []
    // silently discarded the flat transcript and ran extraction on nothing.
    // Fall back to the flat transcript as a single untagged entry instead.
    const entries: DiarizedEntry[] = result.diarized_transcript?.entries?.length
      ? result.diarized_transcript.entries
      : result.transcript
        ? [{ speaker_id: "unknown", transcript: result.transcript }]
        : [];
    const caller = call.client_id ? await getCallerById(env.DB, call.client_id) : null;

    if (caller?.category === "staff") {
      // Trusted — straight to extraction, no spam-check. Two independent
      // waitUntils, same as before this feature: a scan failure must never
      // block the extraction that actually produces the dashboard card.
      ctx.waitUntil(runExtractionAndSiteScan(env, call, entries, caller.name));
    } else {
      // 'client' category, or a legacy call with no linked caller — spam
      // check first. Collapsed into one waitUntil: a spam verdict has to
      // suppress both extraction and site-scan, which two independent
      // waitUntils can't coordinate.
      ctx.waitUntil(
        (async () => {
          let verdict: { isSpam: boolean } | null = null;
          try {
            if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
            verdict = await scanCallForSpam({
              apiKey: env.ANTHROPIC_API_KEY,
              model: env.ANTHROPIC_HAIKU_MODEL,
              entries,
            });
          } catch (err) {
            // A missed spam call costs nothing; falling through to normal
            // extraction on a spam-scan failure is the safe default.
            console.error("[spam scan] failed for call", call.id, err);
          }

          if (verdict?.isSpam) {
            await handleSpamVerdict(env, ctx, call, call.client_id);
            return;
          }

          await runExtractionAndSiteScan(env, call, entries, caller?.name ?? null);
        })()
      );
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    await setCallFailed(env.DB, call.id, `webhook: ${String(err)}`);
    return new Response("Processing failed", { status: 500 });
  }
}

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
import { scanCallForSites } from "../../packages/core/prompts/site-scan";
import { scanCallForSpam } from "../../packages/core/prompts/spam-scan";
import {
  getCallByJobId,
  getCallerById,
  linkCallToSites,
  markCallerSpam,
  saveExtraction,
  setCallFailed,
  setCallTranscribed,
  softDeleteCallAsSpam,
  type Call,
  type DiarizedEntry,
} from "@sbm/core";
import { fetchResult } from "../lib/sarvam";
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
    await env.RECORDINGS.delete(call.r2_key);
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

  if (body.status !== "Completed") {
    // Acknowledge intermediate/failed states without processing.
    if (body.status === "Failed") {
      const call = await getCallByJobId(env.DB, body.job_id);
      if (call) await setCallFailed(env.DB, call.id, `Sarvam status: ${body.status}${body.error ? ` — ${body.error}` : ""}`);
    }
    return new Response("ok", { status: 200 });
  }

  const call = await getCallByJobId(env.DB, body.job_id);
  if (!call) return new Response("Unknown job_id", { status: 404 });

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

    const entries = result.diarized_transcript?.entries ?? [];
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

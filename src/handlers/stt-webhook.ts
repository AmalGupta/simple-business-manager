// Task 4 (checkpoint) — Sarvam callback → transcript → D1, then Task 5 extraction
// in ctx.waitUntil. See docs/SCAFFOLDING.md §5 for the job flow and docs/BUILD_BRIEF.md
// "Stop and show me the transcript before continuing" for why Task 4 is a hard gate.
//
// Body shape confirmed against a real live callback on 2026-08-21:
// {"job_id": "...", "job_type": "SPEECH_TO_TEXT_BULK", "status": "Completed",
//  "completion_time": "...", "error": ""} — note "status", not "job_state" as
// an earlier draft of this file assumed (that mismatch was silently eating
// every real callback: undefined !== "Completed" fell through to a no-op).

import { ACTIVE } from "../../packages/core/prompts";
import { extractCall } from "../../packages/core/prompts/extract";
import { scanCallForSites } from "../../packages/core/prompts/site-scan";
import { getCallByJobId, linkCallToSites, saveExtraction, setCallFailed, setCallTranscribed } from "@sbm/core";
import { fetchResult } from "../lib/sarvam";
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

    ctx.waitUntil(
      (async () => {
        try {
          if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
          const extraction = await extractCall({
            apiKey: env.ANTHROPIC_API_KEY,
            model: env.ANTHROPIC_MODEL,
            clientName: null, // client identification is an open item — see docs/SCAFFOLDING.md §10
            recordedAt: call.recorded_at,
            entries,
          });
          await saveExtraction(env.DB, call.id, extraction, ACTIVE.version);
        } catch (err) {
          await setCallFailed(env.DB, call.id, `extraction: ${String(err)}`);
        }
      })()
    );

    // Separate, cheap Haiku pass dedicated to site discovery — see
    // packages/core/prompts/site-scan.ts. Runs independently of the main
    // extraction above: a scan failure must never mark the call failed or
    // block the extraction that actually produces the dashboard card.
    ctx.waitUntil(
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
          console.error("[site scan] failed for call", call.id, err);
        }
      })()
    );

    return new Response("ok", { status: 200 });
  } catch (err) {
    await setCallFailed(env.DB, call.id, `webhook: ${String(err)}`);
    return new Response("Processing failed", { status: 500 });
  }
}

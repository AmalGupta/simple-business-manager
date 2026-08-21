// Task 4 (checkpoint) — Sarvam callback → transcript → D1, then Task 5 extraction
// in ctx.waitUntil. See docs/SCAFFOLDING.md §5 for the job flow and docs/BUILD_BRIEF.md
// "Stop and show me the transcript before continuing" for why Task 4 is a hard gate.
//
// The exact webhook body field names (job_id / job_state) are inferred from
// the pipeline diagram in §5, not from a captured real payload — that diagram
// is the only spec given. If a live Sarvam callback doesn't match this shape,
// that mismatch is exactly the go/no-go signal Task 4 exists to surface.

import { ACTIVE } from "../../packages/core/prompts";
import { extractCall } from "../../packages/core/prompts/extract";
import { getCallByJobId, saveExtraction, setCallFailed, setCallTranscribed } from "@sbm/core";
import { fetchResult } from "../lib/sarvam";
import type { Env } from "../index";

interface SarvamWebhookBody {
  job_id: string;
  job_state: string;
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

  let body: SarvamWebhookBody;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (body.job_state !== "Completed") {
    // Acknowledge intermediate/failed states without processing.
    if (body.job_state === "Failed") {
      const call = await getCallByJobId(env.DB, body.job_id);
      if (call) await setCallFailed(env.DB, call.id, `Sarvam job_state: ${body.job_state}`);
    }
    return new Response("ok", { status: 200 });
  }

  const call = await getCallByJobId(env.DB, body.job_id);
  if (!call) return new Response("Unknown job_id", { status: 404 });

  try {
    const result = await fetchResult(env, body.job_id);
    await setCallTranscribed(env.DB, call.id, result.transcript, result.language_code ?? null);

    ctx.waitUntil(
      (async () => {
        try {
          if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
          const entries = result.diarized_transcript?.entries ?? [];
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

    return new Response("ok", { status: 200 });
  } catch (err) {
    await setCallFailed(env.DB, call.id, `webhook: ${String(err)}`);
    return new Response("Processing failed", { status: 500 });
  }
}

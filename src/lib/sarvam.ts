// Sarvam Batch STT — job flow and verified field names from docs/SCAFFOLDING.md §5.
// Kept behind this module (a Transcriber-shaped surface: submit + fetchResult) so
// swapping to Bhashini later touches one file, per §5 "Bhashini fallback".

import type { SarvamResult } from "@sbm/core";
import type { Env } from "../index";

const BASE = "https://api.sarvam.ai";

const headers = (env: Env) => ({
  "api-subscription-key": env.SARVAM_API_KEY!,
  "content-type": "application/json",
});

export interface SubmitResult {
  jobId: string;
}

/**
 * job_parameters is echoed at both job creation and job start — confirmed
 * against a live working call (2026-08-21). model bumped to saaras:v4 (was
 * v3) and with_timestamps added per that same verified call.
 */
function jobParameters(env: Env) {
  return {
    model: "saaras:v4",
    mode: env.SARVAM_STT_MODE,
    language_code: env.SARVAM_LANGUAGE_CODE,
    with_diarization: true,
    with_timestamps: true,
    num_speakers: 2,
  };
}

/** Presigned upload, R2 body streamed straight through — never buffered. */
export async function submitRecording(
  env: Env,
  r2Key: string,
  callbackUrl: string
): Promise<SubmitResult> {
  if (!env.SARVAM_API_KEY) throw new Error("SARVAM_API_KEY not configured");
  if (!env.SARVAM_WEBHOOK_TOKEN) throw new Error("SARVAM_WEBHOOK_TOKEN not configured");

  const fileName = r2Key.split("/").pop()!;

  const jobRes = await fetch(`${BASE}/speech-to-text/job/v1`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      job_parameters: jobParameters(env),
      callback: {
        url: callbackUrl,
        auth_token: env.SARVAM_WEBHOOK_TOKEN,
      },
    }),
  });
  if (!jobRes.ok) throw new Error(`Sarvam job create failed: ${jobRes.status} ${await jobRes.text()}`);
  const job = await jobRes.json<{ job_id: string }>();

  const uploadRes = await fetch(`${BASE}/speech-to-text/job/v1/upload-files`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({ job_id: job.job_id, files: [fileName] }),
  });
  if (!uploadRes.ok) throw new Error(`Sarvam upload-files failed: ${uploadRes.status} ${await uploadRes.text()}`);
  const upload = await uploadRes.json<{ upload_urls: Record<string, { file_url: string }> }>();

  const object = await env.RECORDINGS.get(r2Key);
  if (!object) throw new Error(`missing R2 object: ${r2Key}`);

  const uploadUrl = upload.upload_urls[fileName]?.file_url;
  if (!uploadUrl) throw new Error(`Sarvam upload-files returned no file_url for ${fileName}`);

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    // Azure Blob SAS PUT rejects the request with 400 MissingRequiredHeader
    // without this — confirmed against a live presigned URL.
    headers: { "x-ms-blob-type": "BlockBlob" },
    body: object.body, // streamed, never buffered
  });
  if (!putRes.ok) throw new Error(`Sarvam presigned PUT failed: ${putRes.status} ${await putRes.text()}`);

  // job_id is a path segment here, not a body field, and callback is not
  // repeated (it's registered once at creation) — confirmed live 2026-08-21.
  const startRes = await fetch(`${BASE}/speech-to-text/job/v1/${job.job_id}/start`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({ job_parameters: jobParameters(env) }),
  });
  if (!startRes.ok) throw new Error(`Sarvam job start failed: ${startRes.status} ${await startRes.text()}`);

  return { jobId: job.job_id };
}

/**
 * Called from the webhook once job_state is Completed. /status alone returns
 * download_urls.<file>.json.file_url — no separate /download-files call
 * needed, confirmed against a live working call (2026-08-21), superseding
 * the two-step status→download-files flow SCAFFOLDING.md §5 documented.
 * The 0.json result payload's own shape (transcript / language_code /
 * diarized_transcript) is still unconfirmed against a live callback —
 * that's the Task 4 checkpoint.
 */
export async function fetchResult(env: Env, jobId: string): Promise<SarvamResult> {
  if (!env.SARVAM_API_KEY) throw new Error("SARVAM_API_KEY not configured");

  const statusRes = await fetch(`${BASE}/speech-to-text/job/v1/${jobId}/status`, {
    method: "GET",
    headers: headers(env),
  });
  if (!statusRes.ok) throw new Error(`Sarvam status failed: ${statusRes.status} ${await statusRes.text()}`);
  const status = await statusRes.json<{
    download_urls: Record<string, Record<string, { file_url: string }>>;
  }>();

  const firstFile = Object.values(status.download_urls)[0];
  const firstUrl = firstFile?.json?.file_url;
  if (!firstUrl) throw new Error("Sarvam status returned no download_urls.<file>.json.file_url");

  const resultRes = await fetch(firstUrl);
  if (!resultRes.ok) throw new Error(`Sarvam result download failed: ${resultRes.status}`);
  return resultRes.json<SarvamResult>();
}

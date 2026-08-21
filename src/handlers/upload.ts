// Task 2 — GET /upload (plain HTML, no build step) and POST /upload
// (multipart → R2 → D1 row, respond 202 before transcription starts).
// See docs/BUILD_BRIEF.md Task 2 and Task 3.

import { getInsightsSummary, insertCall, setCallFailed, setCallSubmitted, type InsightsSummary } from "@sbm/core";
import { submitRecording } from "../lib/sarvam";
import type { Env } from "../index";

// Recorder filenames look like "AUDIO-2026-08-20-22-05-33.m4a" — the
// timestamp is the device's local wall-clock time (IST, UTC+5:30), not UTC.
const AUDIO_FILENAME_RE = /(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function parseRecordedAtFromFilename(fileName: string): string | null {
  const match = fileName.match(AUDIO_FILENAME_RE);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const utcMillis =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) -
    IST_OFFSET_MS;
  return new Date(utcMillis).toISOString();
}

function statTile(n: number, label: string): string {
  return `<div class="stat"><div class="stat-n">${n}</div><div class="stat-label">${label}</div></div>`;
}

function uploadPageHtml(sbmKey: string, summary: InsightsSummary): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Simple Business Manager — Upload</title>
<style>
  body { font-family: system-ui, sans-serif; background: #F4F7F6; color: #17443C; max-width: 480px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
  h1 { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-size: 1.25rem; margin: 0 0 1.5rem; font-weight: 500; }
  h2 { font-size: 0.75rem; color: #5F8A82; text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 0.75rem; font-weight: 500; }
  form { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2.5rem; }
  input[type="file"] { padding: 0.75rem; border: 1px solid #DBE6E2; border-radius: 2px; background: #fff; }
  button { padding: 0.875rem; min-height: 44px; border: none; border-radius: 2px; background: #17443C; color: #fff; font-size: 1rem; }
  #status { font-size: 0.875rem; color: #5F8A82; min-height: 1.25em; }
  .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
  .stat { background: #fff; border: 1px solid #DBE6E2; border-radius: 4px; padding: 1rem; }
  .stat-n { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-size: 1.917rem; font-weight: 500; line-height: 1; }
  .stat-label { font-size: 0.8125rem; color: #5F8A82; margin-top: 0.375rem; }
  .dashboard-link { display: inline-block; margin-top: 2.5rem; font-size: 0.8125rem; color: #5F8A82; }
</style>
</head>
<body>
  <h1>Upload a call recording</h1>
  <form id="f">
    <input type="file" name="recording" accept="audio/*,.wav,.m4a,.mp3,.aac,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/mpeg,audio/aac" required />
    <button type="submit">Upload</button>
  </form>
  <p id="status"></p>

  <h2>Total insights</h2>
  <div class="stats">
    ${statTile(summary.totalCalls, summary.totalCalls === 1 ? "call captured" : "calls captured")}
    ${statTile(summary.openTodos, summary.openTodos === 1 ? "todo open" : "todos open")}
    ${statTile(summary.doneTodos, summary.doneTodos === 1 ? "todo closed" : "todos closed")}
    ${statTile(summary.callsWaitingOnCustomer, summary.callsWaitingOnCustomer === 1 ? "call waiting on customer" : "calls waiting on customer")}
  </div>

  <a class="dashboard-link" href="/">View the full dashboard →</a>

  <script>
    var SBM_KEY = ${JSON.stringify(sbmKey)};
    document.getElementById("f").addEventListener("submit", function (e) {
      e.preventDefault();
      var status = document.getElementById("status");
      status.textContent = "Uploading…";
      var fd = new FormData(e.target);
      fetch("/upload", { method: "POST", headers: { "X-SBM-Key": SBM_KEY }, body: fd })
        .then(function (res) {
          if (!res.ok) return res.text().then(function (t) { throw new Error(t); });
          return res.json();
        })
        .then(function (data) {
          status.textContent = "Uploaded — call " + data.callId;
          // Totals above are server-rendered on load; reload to pick up the new call.
          setTimeout(function () { location.reload(); }, 1200);
        })
        .catch(function (err) { status.textContent = "Failed: " + err.message; });
    });
  </script>
</body>
</html>`;
}

export async function handleUploadPage(env: Env): Promise<Response> {
  const summary = await getInsightsSummary(env.DB);
  return new Response(uploadPageHtml(env.SBM_API_KEY ?? "", summary), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function handleUploadPost(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const form = await request.formData();
  const file = form.get("recording");
  if (!(file instanceof File)) {
    return new Response("Missing 'recording' file", { status: 400 });
  }

  const sourceField = form.get("source");
  const source = sourceField === "android" ? "android" : "ios";

  const callId = crypto.randomUUID();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "m4a";
  const r2Key = `${env.INGEST_PREFIX}${callId}.${ext}`;

  await env.RECORDINGS.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  await insertCall(env.DB, {
    id: callId,
    r2Key,
    source,
    // recordedAt is always upload time. recordingDate is the recorder's own
    // filename timestamp (see docs/SCAFFOLDING.md §10) when parseable, kept
    // as a separate field — the two can legitimately differ by hours or
    // days when a recording is uploaded well after the call happened.
    recordedAt: new Date().toISOString(),
    recordingDate: parseRecordedAtFromFilename(file.name),
    durationS: null,
  });

  // Respond before transcription finishes — a phone on a patchy connection
  // won't hold the request open for a Sarvam round trip.
  const callbackUrl = `${new URL(request.url).origin}/webhooks/sarvam`;
  ctx.waitUntil(
    submitRecording(env, r2Key, callbackUrl)
      .then((result) => setCallSubmitted(env.DB, callId, result.jobId))
      .catch((err) => setCallFailed(env.DB, callId, `submit: ${String(err)}`))
  );

  return new Response(JSON.stringify({ callId }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
}

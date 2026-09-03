// Pull up to BATCH_SIZE new recordings from the shared Drive Calls folder
// into R2 + the existing Sarvam → extract pipeline.

import {
  deleteCallById,
  findOrCreateCaller,
  insertCall,
  insertSkippedCall,
  setAppSetting,
  setCallDriveFileId,
  setCallSubmitted,
  setDrivePollProgress,
  DRIVE_POLL_LAST_AT_KEY,
  DRIVE_POLL_LAST_RESULT_KEY,
  type DrivePollProgress,
  type DrivePollStep,
} from "@sbm/core";
import type { Env } from "../index";
import { contentTypeForDriveCall, parseDriveCallFilename } from "./drive-call-filename";
import { downloadDriveFile, listDriveFiles, moveDriveFile, type DriveFileListItem } from "./google-drive";
import { submitRecording } from "./sarvam";

/** Per-file: ~2 Drive fetches + 1 R2 put + ~4 D1 ops + 1 progress write. */
const SUBREQUESTS_PER_FILE_EST = 8;
/** Workers Free allows 50 subrequests/invocation; leave headroom for listing + setup. */
const DEFAULT_SUBREQUEST_BUDGET = 45;

function subrequestBudget(env: Env): number {
  const raw = env.DRIVE_POLL_SUBREQUEST_BUDGET?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_SUBREQUEST_BUDGET;
}

/**
 * Max files one invocation can ingest without hitting the subrequest cap.
 * Set DRIVE_POLL_SUBREQUEST_BUDGET in wrangler (e.g. 950) on paid Workers.
 */
export function drivePollBatchCap(env: Env, requested: number): number {
  const budget = subrequestBudget(env);
  const byBudget = Math.max(1, Math.floor((budget - 6) / SUBREQUESTS_PER_FILE_EST));
  return Math.min(requested, byBudget);
}

export const DRIVE_POLL_BATCH_SIZE = 20;

export interface DrivePollIngested {
  callId: string;
  driveFileId: string;
  fileName: string;
  clientName: string;
  archived: boolean;
  skipped: boolean;
}

export interface DrivePollResult {
  scanned: number;
  skippedExisting: number;
  ingested: DrivePollIngested[];
  errors: { fileName: string; error: string }[];
}

function resolveCallbackUrl(env: Env, callbackOrigin?: string): string {
  const origin = (callbackOrigin ?? env.PUBLIC_BASE_URL)?.replace(/\/$/, "");
  if (!origin) throw new Error("PUBLIC_BASE_URL not configured");
  return `${origin}/webhooks/sarvam`;
}

function callsFolderId(env: Env): string {
  const id = env.GOOGLE_DRIVE_CALLS_FOLDER_ID?.trim();
  if (!id) throw new Error("GOOGLE_DRIVE_CALLS_FOLDER_ID not configured");
  return id;
}

function archiveFolderId(env: Env): string {
  const id = env.GOOGLE_DRIVE_ARCHIVE_FOLDER_ID?.trim();
  if (!id) throw new Error("GOOGLE_DRIVE_ARCHIVE_FOLDER_ID not configured");
  return id;
}

/**
 * Callers Directory (migration 0021) — where known-Spam-caller Drive files
 * move instead of Archive. Unlike callsFolderId/archiveFolderId, an unset
 * var returns null rather than throwing: this folder is optional until the
 * admin creates it, and its absence must not break polling for every other
 * (family/staff/client) file in the same batch.
 */
function spamFolderId(env: Env): string | null {
  return env.GOOGLE_DRIVE_SPAM_FOLDER_ID?.trim() || null;
}

function fileSortKeyMs(file: DriveFileListItem): number {
  const parsed = parseDriveCallFilename(file.name).recordedAt;
  if (parsed) return Date.parse(parsed);
  if (file.modifiedTime) return Date.parse(file.modifiedTime);
  return 0;
}

async function loadKnownDriveFileIds(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare(`SELECT drive_file_id AS id FROM calls WHERE drive_file_id IS NOT NULL`)
    .all<{ id: string }>();
  return new Set((results ?? []).map((r) => r.id));
}

/** Page Drive (modifiedTime desc) until we have `limit` not-yet-ingested files. */
async function pickNewFiles(
  env: Env,
  folderIdValue: string,
  known: Set<string>,
  limit: number
): Promise<{ candidates: DriveFileListItem[]; scanned: number; skippedExisting: number }> {
  const fresh: DriveFileListItem[] = [];
  let scanned = 0;
  let skippedExisting = 0;
  let pageToken: string | undefined;

  do {
    const page = await listDriveFiles(env, {
      q: `'${folderIdValue}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      pageSize: 100,
      pageToken,
      orderBy: "modifiedTime desc",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size)",
    });
    let pageUnknowns = 0;
    for (const file of page.files) {
      scanned += 1;
      if (known.has(file.id)) {
        skippedExisting += 1;
        continue;
      }
      pageUnknowns += 1;
      fresh.push(file);
    }
    // Newest-first: an all-known tip page means we're caught up.
    if (pageUnknowns === 0 && fresh.length === 0) break;
    pageToken = page.nextPageToken;
  } while (pageToken && fresh.length < limit);

  fresh.sort((a, b) => fileSortKeyMs(b) - fileSortKeyMs(a));
  return { candidates: fresh.slice(0, limit), scanned, skippedExisting };
}

async function reportProgress(env: Env, progress: DrivePollProgress): Promise<void> {
  try {
    await setDrivePollProgress(env.DB, { ...progress, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[drive-poll] progress write failed:", String(err));
  }
}

async function rollbackPreSubmitIngest(env: Env, callId: string, r2Key: string | null): Promise<void> {
  try {
    await deleteCallById(env.DB, callId);
  } catch (err) {
    console.error(`[drive-poll] rollback delete call ${callId}:`, String(err));
  }
  if (r2Key) {
    try {
      await env.RECORDINGS.delete(r2Key);
    } catch (err) {
      console.error(`[drive-poll] rollback delete R2 ${r2Key}:`, String(err));
    }
  }
}

async function ingestOne(
  env: Env,
  file: DriveFileListItem,
  callbackUrl: string,
  callsId: string,
  archiveId: string,
  spamId: string | null,
  onStep: (step: DrivePollStep, clientName?: string) => void
): Promise<DrivePollIngested> {
  const parsed = parseDriveCallFilename(file.name);
  const caller = await findOrCreateCaller(env.DB, {
    name: parsed.callerLabel,
    phone: parsed.phone,
  });

  const callId = crypto.randomUUID();
  const callTime = parsed.recordedAt ?? new Date().toISOString();

  // Family: never touch R2/Sarvam. Known-Spam: same treatment — the LLM
  // spam-check (see stt-webhook.ts) only ever runs once per new/unknown
  // number; a number already tagged spam is pre-filtered here from then on.
  if (caller.category === "family" || caller.category === "spam") {
    onStep("skip", caller.name);
    const destinationFolderId = caller.category === "family" ? archiveId : spamId;
    if (!destinationFolderId) {
      throw new Error(
        caller.category === "spam"
          ? "GOOGLE_DRIVE_SPAM_FOLDER_ID not configured"
          : "GOOGLE_DRIVE_ARCHIVE_FOLDER_ID not configured"
      );
    }

    await insertSkippedCall(env.DB, {
      id: callId,
      callerId: caller.id,
      source: "drive",
      recordedAt: callTime,
      recordingDate: parsed.recordedAt,
      driveFileId: null,
    });

    try {
      onStep("archive", caller.name);
      await moveDriveFile(env, file.id, { addParentId: destinationFolderId, removeParentId: callsId });
      await setCallDriveFileId(env.DB, callId, file.id);
    } catch (err) {
      await deleteCallById(env.DB, callId);
      throw err;
    }

    return {
      callId,
      driveFileId: file.id,
      fileName: file.name,
      clientName: caller.name,
      archived: true,
      skipped: true,
    };
  }

  // staff / client (new or existing, unknown) — unchanged normal flow.
  const ext = file.name.includes(".") ? file.name.split(".").pop()! : "m4a";
  const r2Key = `${env.INGEST_PREFIX}${callId}.${ext}`;
  let submitted = false;

  try {
    onStep("download", caller.name);
    const downloaded = await downloadDriveFile(env, file.id);
    await env.RECORDINGS.put(r2Key, downloaded.body, {
      httpMetadata: {
        contentType: contentTypeForDriveCall(file.name, downloaded.contentType),
      },
    });

    onStep("insert", caller.name);
    await insertCall(env.DB, {
      id: callId,
      r2Key,
      source: "drive",
      recordedAt: callTime,
      recordingDate: parsed.recordedAt,
      durationS: null,
      clientId: caller.id,
    });

    onStep("submit", caller.name);
    const submitResult = await submitRecording(env, r2Key, callbackUrl);
    await setCallSubmitted(env.DB, callId, submitResult.jobId);
    submitted = true;

    // Archive only after R2 + D1 + STT submit — failed files stay in Calls for retry.
    onStep("archive", caller.name);
    await moveDriveFile(env, file.id, { addParentId: archiveId, removeParentId: callsId });
    await setCallDriveFileId(env.DB, callId, file.id);
  } catch (err) {
    if (!submitted) await rollbackPreSubmitIngest(env, callId, r2Key);
    throw err;
  }

  return {
    callId,
    driveFileId: file.id,
    fileName: file.name,
    clientName: caller.name,
    archived: true,
    skipped: false,
  };
}

/**
 * Scan the Drive Calls folder (newest first), skip already-ingested
 * drive_file_id rows, transfer up to `limit` files into R2 + STT, then
 * move each successful file into the Archive folder (or the Spam folder
 * for a known-Spam caller / Family caller — see ingestOne).
 */
export async function pollDriveCalls(
  env: Env,
  _ctx: ExecutionContext,
  options: { limit?: number; callbackOrigin?: string } = {}
): Promise<DrivePollResult> {
  const requested = options.limit ?? DRIVE_POLL_BATCH_SIZE;
  const limit = drivePollBatchCap(env, requested);
  const startedAt = new Date().toISOString();
  const progress: DrivePollProgress = {
    status: "running",
    startedAt,
    updatedAt: startedAt,
    limit,
    phase: "listing",
    current: { fileName: "Calls folder", step: "listing" },
    completed: [],
    errors: [],
    scanned: 0,
    skippedExisting: 0,
    message: "Scanning Drive folder…",
  };
  await reportProgress(env, progress);

  try {
    const callbackUrl = resolveCallbackUrl(env, options.callbackOrigin);
    const callsId = callsFolderId(env);
    const archiveId = archiveFolderId(env);
    const spamId = spamFolderId(env); // null until GOOGLE_DRIVE_SPAM_FOLDER_ID is set — see spamFolderId
    const known = await loadKnownDriveFileIds(env.DB);
    const { candidates, scanned, skippedExisting } = await pickNewFiles(env, callsId, known, limit);

    progress.scanned = scanned;
    progress.skippedExisting = skippedExisting;
    progress.phase = "ingest";
    progress.current = null;
    progress.message =
      candidates.length === 0
        ? "No new recordings in this cycle."
        : `Ingesting ${candidates.length} of up to ${limit}…`;
    await reportProgress(env, progress);

    const result: DrivePollResult = {
      scanned,
      skippedExisting,
      ingested: [],
      errors: [],
    };

    for (const file of candidates) {
      try {
        const ingested = await ingestOne(
          env,
          file,
          callbackUrl,
          callsId,
          archiveId,
          spamId,
          (step, clientName) => {
            progress.current = { fileName: file.name, step, clientName };
            progress.message = null;
          }
        );
        result.ingested.push(ingested);
        progress.completed.push({
          fileName: ingested.fileName,
          clientName: ingested.clientName,
          archived: ingested.archived,
          skipped: ingested.skipped,
        });
      } catch (err) {
        const error = String(err);
        result.errors.push({ fileName: file.name, error });
        progress.errors.push({ fileName: file.name, error });
        if (/too many subrequests/i.test(error)) break;
      }
      progress.current = null;
      await reportProgress(env, progress);
    }

    const archived = result.ingested.filter((r) => r.archived).length;
    const summary =
      limit < requested
        ? `ingested ${result.ingested.length}/${limit} (cap ${requested} — subrequest budget); archived ${archived}; scanned ${scanned}; skipped ${skippedExisting}; errors ${result.errors.length}`
        : `ingested ${result.ingested.length}/${limit}; archived ${archived}; scanned ${scanned}; skipped ${skippedExisting}; errors ${result.errors.length}`;
    progress.status = "done";
    progress.phase = "done";
    progress.current = null;
    progress.message = summary;
    await Promise.all([
      setAppSetting(env.DB, DRIVE_POLL_LAST_AT_KEY, new Date().toISOString()),
      setAppSetting(env.DB, DRIVE_POLL_LAST_RESULT_KEY, summary),
      reportProgress(env, progress),
    ]);

    return result;
  } catch (err) {
    progress.status = "error";
    progress.phase = "done";
    progress.current = null;
    progress.message = String(err);
    await reportProgress(env, progress);
    throw err;
  }
}

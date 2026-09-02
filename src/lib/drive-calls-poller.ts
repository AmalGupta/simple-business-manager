// Pull up to BATCH_SIZE new recordings from the shared Drive Calls folder
// into R2 + the existing Sarvam → extract pipeline.

import {
  findOrCreateClient,
  insertCall,
  setAppSetting,
  setCallFailed,
  setCallSubmitted,
  DRIVE_POLL_LAST_AT_KEY,
  DRIVE_POLL_LAST_RESULT_KEY,
} from "@sbm/core";
import type { Env } from "../index";
import { contentTypeForDriveCall, parseDriveCallFilename } from "./drive-call-filename";
import { downloadDriveFile, listDriveFiles, moveDriveFile, type DriveFileListItem } from "./google-drive";
import { submitRecording } from "./sarvam";

export const DRIVE_POLL_BATCH_SIZE = 2;

export interface DrivePollIngested {
  callId: string;
  driveFileId: string;
  fileName: string;
  clientName: string;
  archived: boolean;
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

async function ingestOne(
  env: Env,
  ctx: ExecutionContext,
  file: DriveFileListItem,
  callbackUrl: string,
  callsId: string,
  archiveId: string
): Promise<DrivePollIngested> {
  const parsed = parseDriveCallFilename(file.name);
  const clientId = await findOrCreateClient(env.DB, {
    name: parsed.callerLabel,
    phone: parsed.phone,
  });

  const callId = crypto.randomUUID();
  const ext = file.name.includes(".") ? file.name.split(".").pop()! : "m4a";
  const r2Key = `${env.INGEST_PREFIX}${callId}.${ext}`;

  const downloaded = await downloadDriveFile(env, file.id);
  await env.RECORDINGS.put(r2Key, downloaded.body, {
    httpMetadata: {
      contentType: contentTypeForDriveCall(file.name, downloaded.contentType),
    },
  });

  const callTime = parsed.recordedAt ?? new Date().toISOString();
  await insertCall(env.DB, {
    id: callId,
    r2Key,
    source: "drive",
    recordedAt: callTime,
    recordingDate: parsed.recordedAt,
    durationS: null,
    clientId,
    driveFileId: file.id,
  });

  ctx.waitUntil(
    submitRecording(env, r2Key, callbackUrl)
      .then((result) => setCallSubmitted(env.DB, callId, result.jobId))
      .catch((err) => setCallFailed(env.DB, callId, `submit: ${String(err)}`))
  );

  // Move out of Calls only after R2 + D1 succeeded — Drive is the backlog queue.
  let archived = false;
  try {
    await moveDriveFile(env, file.id, { addParentId: archiveId, removeParentId: callsId });
    archived = true;
  } catch (err) {
    console.error(`[drive-poll] archive move failed for ${file.name}:`, String(err));
  }

  return {
    callId,
    driveFileId: file.id,
    fileName: file.name,
    clientName: parsed.callerLabel,
    archived,
  };
}

/**
 * Scan the Drive Calls folder (newest first), skip already-ingested
 * drive_file_id rows, transfer up to `limit` files into R2 + STT, then
 * move each successful file into the Archive folder.
 */
export async function pollDriveCalls(
  env: Env,
  ctx: ExecutionContext,
  options: { limit?: number; callbackOrigin?: string } = {}
): Promise<DrivePollResult> {
  const limit = options.limit ?? DRIVE_POLL_BATCH_SIZE;
  const callbackUrl = resolveCallbackUrl(env, options.callbackOrigin);
  const callsId = callsFolderId(env);
  const archiveId = archiveFolderId(env);
  const known = await loadKnownDriveFileIds(env.DB);
  const { candidates, scanned, skippedExisting } = await pickNewFiles(env, callsId, known, limit);

  const result: DrivePollResult = {
    scanned,
    skippedExisting,
    ingested: [],
    errors: [],
  };

  for (const file of candidates) {
    try {
      result.ingested.push(await ingestOne(env, ctx, file, callbackUrl, callsId, archiveId));
    } catch (err) {
      result.errors.push({ fileName: file.name, error: String(err) });
    }
  }

  const archived = result.ingested.filter((r) => r.archived).length;
  const summary = `ingested ${result.ingested.length}/${limit}; archived ${archived}; scanned ${scanned}; skipped ${skippedExisting}; errors ${result.errors.length}`;
  await Promise.all([
    setAppSetting(env.DB, DRIVE_POLL_LAST_AT_KEY, new Date().toISOString()),
    setAppSetting(env.DB, DRIVE_POLL_LAST_RESULT_KEY, summary),
  ]);

  return result;
}

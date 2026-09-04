// All D1 access lives here — see docs/SCAFFOLDING.md §1 ("no SQL outside queries.ts").

import { matchStaffByOwner } from "./assignment";
import type {
  Call,
  Caller,
  CallerCategory,
  CallExtraction,
  CallSource,
  CallType,
  DiarizedEntry,
  DrivePollProgress,
  Escalation,
  EscalationSource,
  EscalationStatus,
  Installation,
  InstallationCategory,
  InstallationUpdate,
  InstallationUpdateCategory,
  MaterialShortage,
  MaterialShortageStatus,
  SiteMedia,
  SiteMediaType,
  SiteTaskStatus,
  Todo,
  TodoAssignee,
  TodoOwner,
  TodoVoiceNote,
  User,
  UserRole,
  WorkflowCategory,
} from "./types";
import { STAFF_HIDDEN_WORKFLOW_CATEGORIES } from "./types";

/** Cloudflare D1 — https://developers.cloudflare.com/d1/platform/limits/ */
const D1_MAX_BOUND_PARAMS = 100;

function staffHiddenCategorySql(alias = "workflow_stages.category"): { clause: string; binds: string[] } {
  const placeholders = STAFF_HIDDEN_WORKFLOW_CATEGORIES.map(() => "?").join(", ");
  return {
    clause: `AND ${alias} NOT IN (${placeholders})`,
    binds: [...STAFF_HIDDEN_WORKFLOW_CATEGORIES],
  };
}

/** D1 allows at most 100 bound params — chunk dynamic `IN (...)` lists. */
async function queryAllByIdChunks<T>(
  db: D1Database,
  ids: string[],
  buildSql: (placeholders: string) => string
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += D1_MAX_BOUND_PARAMS) {
    const chunk = ids.slice(i, i + D1_MAX_BOUND_PARAMS);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await db.prepare(buildSql(placeholders)).bind(...chunk).all<T>();
    if (results?.length) out.push(...results);
  }
  return out;
}

export interface NewCallInput {
  id: string;
  r2Key: string;
  source: CallSource;
  recordedAt: string;
  recordingDate: string | null;
  durationS: number | null;
  /** Set for a voice memo uploaded explicitly from a site's page — see src/handlers/site-voice-note.ts. */
  recordedForSiteId?: string | null;
  uploadedByUserId?: string | null;
  /** Set when this call is the required voice note for one installation checklist row — see src/handlers/installation.ts. */
  installationUpdateId?: string | null;
  /** Linked caller (callers.id) from Drive filename (or later enrichment). */
  clientId?: string | null;
  /** Google Drive file id — unique when set (migration 0020). */
  driveFileId?: string | null;
}

export async function insertCall(db: D1Database, input: NewCallInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO calls (id, r2_key, source, recorded_at, recording_date, duration_s, stt_status, recorded_for_site_id, uploaded_by_user_id, installation_update_id, client_id, drive_file_id)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.r2Key,
      input.source,
      input.recordedAt,
      input.recordingDate,
      input.durationS,
      input.recordedForSiteId ?? null,
      input.uploadedByUserId ?? null,
      input.installationUpdateId ?? null,
      input.clientId ?? null,
      input.driveFileId ?? null
    )
    .run();
}

export async function getCallById(db: D1Database, id: string): Promise<Call | null> {
  const row = await db.prepare(`SELECT * FROM calls WHERE id = ?`).bind(id).first<Call>();
  return row ?? null;
}

export async function getCallByDriveFileId(db: D1Database, driveFileId: string): Promise<Call | null> {
  const row = await db
    .prepare(`SELECT * FROM calls WHERE drive_file_id = ?`)
    .bind(driveFileId)
    .first<Call>();
  return row ?? null;
}

export interface FoundOrCreatedCaller {
  id: string;
  category: CallerCategory;
  name: string;
}

/**
 * Find or create a callers row for a Drive caller (phone preferred for
 * uniqueness). Returns the resolved category too, so the Drive poller can
 * branch (family/spam -> skip) without a second round trip. A brand-new
 * caller always lands as 'client' — see Callers Directory design notes.
 */
export async function findOrCreateCaller(
  db: D1Database,
  opts: { name: string; phone: string | null }
): Promise<FoundOrCreatedCaller> {
  const name = opts.name.trim() || "Unknown Caller";
  const phone = opts.phone?.trim() || null;

  if (phone) {
    const byPhone = await db
      .prepare(`SELECT id, category, name FROM callers WHERE phone = ?`)
      .bind(phone)
      .first<FoundOrCreatedCaller>();
    if (byPhone) return byPhone;
  }

  const byName = await db
    .prepare(`SELECT id, category, name FROM callers WHERE name = ? AND phone IS NULL`)
    .bind(name)
    .first<FoundOrCreatedCaller>();
  if (byName && !phone) return byName;

  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO callers (id, name, phone, category) VALUES (?, ?, ?, 'client')`)
    .bind(id, name, phone)
    .run();
  return { id, category: "client", name };
}

export async function getCallerById(db: D1Database, id: string): Promise<Caller | null> {
  const row = await db.prepare(`SELECT * FROM callers WHERE id = ?`).bind(id).first<Caller>();
  return row ?? null;
}

export interface CallerRow {
  id: string;
  name: string;
  phone: string | null;
  category: CallerCategory;
  staff_user_id: string | null;
  staff_user_name: string | null;
  created_at: string;
}

const CALLER_SELECT = `
  SELECT callers.id, callers.name, callers.phone, callers.category,
         callers.staff_user_id, users.name AS staff_user_name, callers.created_at
  FROM callers
  LEFT JOIN users ON users.id = callers.staff_user_id
`;

export async function listCallers(db: D1Database): Promise<CallerRow[]> {
  const { results } = await db.prepare(`${CALLER_SELECT} ORDER BY callers.name ASC`).all<CallerRow>();
  return results ?? [];
}

export async function createCaller(
  db: D1Database,
  input: { name: string; phone: string | null; category: CallerCategory; staffUserId?: string | null }
): Promise<CallerRow> {
  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO callers (id, name, phone, category, staff_user_id) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, input.name, input.phone, input.category, input.staffUserId ?? null)
    .run();
  const row = await db.prepare(`${CALLER_SELECT} WHERE callers.id = ?`).bind(id).first<CallerRow>();
  return row!;
}

export async function updateCaller(
  db: D1Database,
  id: string,
  patch: Partial<{ name: string; phone: string | null; category: CallerCategory; staff_user_id: string | null }>
): Promise<CallerRow | null> {
  const fields: string[] = [];
  const binds: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    binds.push(value);
  }
  if (fields.length === 0) return getCallerRow(db, id);
  binds.push(id);
  await db.prepare(`UPDATE callers SET ${fields.join(", ")} WHERE id = ?`).bind(...binds).run();
  return getCallerRow(db, id);
}

async function getCallerRow(db: D1Database, id: string): Promise<CallerRow | null> {
  const row = await db.prepare(`${CALLER_SELECT} WHERE callers.id = ?`).bind(id).first<CallerRow>();
  return row ?? null;
}

/**
 * Minimal `calls` row for Family / repeat-known-Spam callers — never
 * downloaded from Drive, never submitted to Sarvam. r2_key is a synthetic,
 * still-unique placeholder (schema keeps r2_key NOT NULL UNIQUE) that's
 * never written to or read from R2; every R2-touching code path checks
 * stt_status = 'skipped' first and short-circuits instead.
 */
export async function insertSkippedCall(
  db: D1Database,
  input: {
    id: string;
    callerId: string;
    source: CallSource;
    recordedAt: string;
    recordingDate: string | null;
    driveFileId: string | null;
  }
): Promise<void> {
  const r2Key = `no-recording/${input.id}`;
  await db
    .prepare(
      `INSERT INTO calls (id, r2_key, client_id, source, recorded_at, recording_date, stt_status, drive_file_id)
       VALUES (?, ?, ?, ?, ?, ?, 'skipped', ?)`
    )
    .bind(input.id, r2Key, input.callerId, input.source, input.recordedAt, input.recordingDate, input.driveFileId)
    .run();
}

export async function markCallerSpam(db: D1Database, callerId: string): Promise<void> {
  await db.prepare(`UPDATE callers SET category = 'spam' WHERE id = ?`).bind(callerId).run();
}

export async function softDeleteCallAsSpam(db: D1Database, callId: string): Promise<void> {
  await db
    .prepare(`UPDATE calls SET deleted_at = datetime('now'), deleted_reason = 'spam' WHERE id = ?`)
    .bind(callId)
    .run();
}

export const DRIVE_POLL_ENABLED_KEY = "drive_poll_enabled";
export const DRIVE_POLL_LAST_AT_KEY = "drive_poll_last_at";
export const DRIVE_POLL_LAST_RESULT_KEY = "drive_poll_last_result";
export const DRIVE_POLL_PROGRESS_KEY = "drive_poll_progress";

export async function getAppSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare(`SELECT value FROM app_settings WHERE key = ?`).bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setAppSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(key, value)
    .run();
}

export function parseDrivePollProgress(raw: string | null): DrivePollProgress | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DrivePollProgress;
    if (!parsed || typeof parsed !== "object" || !parsed.status) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setDrivePollProgress(db: D1Database, progress: DrivePollProgress): Promise<void> {
  await setAppSetting(db, DRIVE_POLL_PROGRESS_KEY, JSON.stringify(progress));
}

export async function getDrivePollSettings(db: D1Database): Promise<{
  enabled: boolean;
  lastAt: string | null;
  lastResult: string | null;
  progress: DrivePollProgress | null;
}> {
  const [enabled, lastAt, lastResult, progressRaw] = await Promise.all([
    getAppSetting(db, DRIVE_POLL_ENABLED_KEY),
    getAppSetting(db, DRIVE_POLL_LAST_AT_KEY),
    getAppSetting(db, DRIVE_POLL_LAST_RESULT_KEY),
    getAppSetting(db, DRIVE_POLL_PROGRESS_KEY),
  ]);
  return {
    enabled: enabled === "1" || enabled === "true",
    lastAt,
    lastResult,
    progress: parseDrivePollProgress(progressRaw),
  };
}

export interface InsightsSummary {
  totalCalls: number;
  openTodos: number;
  doneTodos: number;
  snoozedTodos: number;
  /** Calls with at least one still-open, customer-waiting todo. */
  callsWaitingOnCustomer: number;
}

/** Server-rendered on the upload portal (GET /upload) — see docs/BUILD_BRIEF.md. */
export async function getInsightsSummary(db: D1Database): Promise<InsightsSummary> {
  const [callsRow, todoStatusRes, waitingRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM calls`).first<{ n: number }>(),
    db.prepare(`SELECT status, COUNT(*) AS n FROM todos GROUP BY status`).all<{ status: string; n: number }>(),
    db
      .prepare(`SELECT COUNT(DISTINCT call_id) AS n FROM todos WHERE status != 'done' AND customer_waiting = 1`)
      .first<{ n: number }>(),
  ]);

  const byStatus = Object.fromEntries((todoStatusRes.results ?? []).map((r) => [r.status, r.n]));

  return {
    totalCalls: callsRow?.n ?? 0,
    openTodos: byStatus.open ?? 0,
    doneTodos: byStatus.done ?? 0,
    snoozedTodos: byStatus.snoozed ?? 0,
    callsWaitingOnCustomer: waitingRow?.n ?? 0,
  };
}

export async function getCallByJobId(db: D1Database, jobId: string): Promise<Call | null> {
  const row = await db.prepare(`SELECT * FROM calls WHERE stt_job_id = ?`).bind(jobId).first<Call>();
  return row ?? null;
}

/** Task 3 — Sarvam job accepted and transcribing. */
export async function setCallSubmitted(db: D1Database, callId: string, jobId: string): Promise<void> {
  await db
    .prepare(`UPDATE calls SET stt_status = 'transcription_in_progress', stt_job_id = ? WHERE id = ?`)
    .bind(jobId, callId)
    .run();
}

/** Any pipeline step (submit, webhook, extraction) failing — never leaves stt_status stuck. */
export async function setCallFailed(db: D1Database, callId: string, error: string): Promise<void> {
  await db
    .prepare(`UPDATE calls SET stt_status = 'failed', stt_error = ? WHERE id = ?`)
    .bind(error, callId)
    .run();
}

/** Drive poll — stamp drive_file_id only after Archive move succeeds (retry stays in Calls until then). */
export async function setCallDriveFileId(db: D1Database, callId: string, driveFileId: string): Promise<void> {
  await db.prepare(`UPDATE calls SET drive_file_id = ? WHERE id = ?`).bind(driveFileId, callId).run();
}

/** Roll back a Drive ingest row before STT submit — no child rows exist yet. */
export async function deleteCallById(db: D1Database, callId: string): Promise<void> {
  await db.prepare(`DELETE FROM calls WHERE id = ?`).bind(callId).run();
}

/** Task 4 — transcript landed. Written the moment fetchResult returns, so it's viewable immediately. */
export async function setCallTranscribed(
  db: D1Database,
  callId: string,
  r2Key: string,
  transcript: string,
  languageCode: string | null,
  diarizedTranscript: string | null
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `INSERT INTO transcripts (id, r2_key, transcript, language_code, diarized_transcript)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(crypto.randomUUID(), r2Key, transcript, languageCode, diarizedTranscript),
    db.prepare(`UPDATE calls SET stt_status = 'transcribed' WHERE id = ?`).bind(callId),
  ]);
}

/**
 * Find-or-create a site by name. Sequential/parallel-safe: `sites.name` is
 * UNIQUE, so a concurrent upsert of the same name resolves to the same row
 * via ON CONFLICT rather than erroring. The ON CONFLICT branch only touches
 * `name` (a no-op — it's the conflict key), so an existing site's
 * is_confirmed is never reset by a later scan finding it again.
 */
export async function upsertSite(db: D1Database, name: string): Promise<string> {
  const trimmed = name.trim();
  const row = await db
    .prepare(
      `INSERT INTO sites (id, name) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET name = excluded.name
       RETURNING id`
    )
    .bind(crypto.randomUUID(), trimmed)
    .first<{ id: string }>();
  return row!.id;
}

/**
 * Upserts each name into `sites` and links it to the call. Used by both the
 * main extraction (saveExtraction, inline) and the Haiku site scan
 * (packages/core/prompts/site-scan.ts) — the latter calls this directly
 * since it has no other fields to write alongside it.
 */
export async function linkCallToSites(db: D1Database, callId: string, siteNames: string[]): Promise<void> {
  const names = [...new Set(siteNames.map((s) => s.trim()).filter(Boolean))];
  if (names.length === 0) return;
  const siteIds = await Promise.all(names.map((name) => upsertSite(db, name)));
  await db.batch(
    siteIds.map((siteId) =>
      db.prepare(`INSERT OR IGNORE INTO call_sites (call_id, site_id) VALUES (?, ?)`).bind(callId, siteId)
    )
  );
}

/**
 * Direct site link for a voice memo uploaded explicitly from a site's page —
 * the site is already known (the id, not just a name), so this skips
 * linkCallToSites' upsert-by-name path entirely.
 */
export async function linkCallToSiteExplicit(db: D1Database, callId: string, siteId: string): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO call_sites (call_id, site_id) VALUES (?, ?)`).bind(callId, siteId).run();
}

/**
 * Backfills the reverse pointer once both rows exist — insertCall runs
 * before its installation_updates row can exist (the row's own
 * voice_note_call_id needs the call's id first), so this call's
 * installation_update_id FK can't be set at insert time. See
 * src/handlers/installation.ts.
 */
export async function linkCallToInstallationUpdate(db: D1Database, callId: string, installationUpdateId: string): Promise<void> {
  await db.prepare(`UPDATE calls SET installation_update_id = ? WHERE id = ?`).bind(installationUpdateId, callId).run();
}

/** Task 5 — extraction landed. Writes the extracted fields, prompt_version, sites, todos, and commitments.
 * Auto-assigns each todo to a staff account when owner matches the roster (see matchStaffByOwner). */
export async function saveExtraction(
  db: D1Database,
  callId: string,
  extraction: CallExtraction,
  promptVersion: string
): Promise<void> {
  const siteNames = [...new Set(extraction.sites.map((s) => s.trim()).filter(Boolean))];
  const siteIds = await Promise.all(siteNames.map((name) => upsertSite(db, name)));
  const staff = await listStaffRoster(db);

  const statements = [
    db
      .prepare(
        `UPDATE calls
         SET stt_status = 'extracted', call_type = ?, summary = ?, key_takeaways = ?, unresolved = ?,
             material_needs = ?, deadline = ?, prompt_version = ?
         WHERE id = ?`
      )
      .bind(
        extraction.call_type,
        extraction.summary,
        JSON.stringify(extraction.key_takeaways),
        JSON.stringify(extraction.unresolved),
        JSON.stringify(extraction.material_needs),
        extraction.deadline || null,
        promptVersion,
        callId
      ),
  ];

  for (const siteId of siteIds) {
    statements.push(
      db
        .prepare(`INSERT OR IGNORE INTO call_sites (call_id, site_id) VALUES (?, ?)`)
        .bind(callId, siteId)
    );
  }

  for (const todo of extraction.todos) {
    const matched = matchStaffByOwner(todo.owner, staff);
    const todoId = crypto.randomUUID();
    statements.push(
      db
        .prepare(
          `INSERT INTO todos (id, call_id, owner, text, due_date, origin)
           VALUES (?, ?, ?, ?, ?, 'llm')`
        )
        .bind(todoId, callId, todo.owner, todo.text, todo.due_date || null)
    );
    if (matched) {
      statements.push(
        db
          .prepare(
            `INSERT INTO todo_assignees (todo_id, user_id, assigned_by_user_id, assigned_at) VALUES (?, ?, NULL, datetime('now'))`
          )
          .bind(todoId, matched.id)
      );
    }
  }

  for (const c of extraction.commitments) {
    statements.push(
      db
        .prepare(
          `INSERT INTO commitments (id, call_id, raw_phrase, resolved_datetime, promised_to) VALUES (?, ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), callId, c.raw_phrase, c.resolved_datetime || null, c.promised_to || null)
    );
  }

  await db.batch(statements);
}

/**
 * One-shot / recovery: assign open todos that still have no assignees when
 * owner matches a staff name. Returns how many rows were updated.
 */
export async function autoAssignOpenTodosByOwner(db: D1Database): Promise<number> {
  const staff = await listStaffRoster(db);
  if (staff.length === 0) return 0;
  const { results } = await db
    .prepare(
      `SELECT todos.id AS id, todos.owner AS owner FROM todos
       WHERE todos.status = 'open' AND todos.owner IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM todo_assignees WHERE todo_assignees.todo_id = todos.id)`
    )
    .all<{ id: string; owner: string }>();
  let updated = 0;
  for (const row of results ?? []) {
    const matched = matchStaffByOwner(row.owner, staff);
    if (!matched) continue;
    await db
      .prepare(
        `INSERT INTO todo_assignees (todo_id, user_id, assigned_by_user_id, assigned_at)
         SELECT ?, ?, NULL, datetime('now')
         WHERE NOT EXISTS (SELECT 1 FROM todo_assignees WHERE todo_id = ?)`
      )
      .bind(row.id, matched.id, row.id)
      .run();
    updated += 1;
  }
  return updated;
}

/**
 * Re-run extraction for an existing call: drop prior LLM todos and all
 * commitments for that call, then saveExtraction (writes prompt_version and
 * new rows). Manual todos (origin != 'llm') are preserved. call_sites rows
 * already present are left alone (INSERT OR IGNORE in saveExtraction).
 */
export async function replaceExtraction(
  db: D1Database,
  callId: string,
  extraction: CallExtraction,
  promptVersion: string
): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM todos WHERE call_id = ? AND origin = 'llm'`).bind(callId),
    db.prepare(`DELETE FROM commitments WHERE call_id = ?`).bind(callId),
  ]);
  await saveExtraction(db, callId, extraction, promptVersion);
}

/** Diarized entries + recorded_at + linked caller id for re-extract / offline eval. */
export async function getCallDiarizedForExtract(
  db: D1Database,
  callId: string
): Promise<{ recorded_at: string | null; entries: DiarizedEntry[]; client_id: string | null } | null> {
  const row = await db
    .prepare(
      `SELECT calls.recorded_at AS recorded_at, calls.client_id AS client_id,
              transcripts.diarized_transcript AS diarized_transcript
       FROM calls
       LEFT JOIN transcripts ON transcripts.r2_key = calls.r2_key
       WHERE calls.id = ?`
    )
    .bind(callId)
    .first<{ recorded_at: string | null; client_id: string | null; diarized_transcript: string | null }>();
  if (!row) return null;
  let entries: DiarizedEntry[] = [];
  if (row.diarized_transcript) {
    try {
      const parsed = JSON.parse(row.diarized_transcript) as { entries?: DiarizedEntry[] };
      entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      entries = [];
    }
  }
  return { recorded_at: row.recorded_at, entries, client_id: row.client_id };
}

// ---------------------------------------------------------------------------
// Read/write API — Tasks 6-7. Shape matches the mock block at the bottom of
// web/src/Dashboard.jsx exactly, so the dashboard's fetch is a straight swap.
// ---------------------------------------------------------------------------

export interface TodoRow {
  id: string;
  owner: TodoOwner;
  text: string;
  due_date: string | null;
  status: Todo["status"];
  completed_at: string | null;
  closed_by_call_id: string | null;
  /** migration 0025 — a todo can be assigned to more than one staff member. */
  assignees: TodoAssignee[];
}

export interface CommitmentRow {
  id: string;
  raw_phrase: string;
  resolved_datetime: string | null;
  promised_to: string | null;
}

export interface UnresolvedRow {
  item: string;
  blocked_on: string | null;
}

export interface CallRow {
  id: string;
  client_name: string;
  client_phone: string | null;
  recorded_at: string | null;
  recording_date: string | null;
  duration_s: number | null;
  source: CallSource;
  customer_waiting: 0 | 1;
  call_type: CallType | null;
  /**
   * Set when this row is a site voice memo (site page, complaints, measurements,
   * installation checklist). NULL for Drive / phone uploads — used by the Calls
   * grid to label Voice Note vs Voice Call without a schema migration.
   */
  recorded_for_site_id: string | null;
  sites: string[];
  deadline: string | null;
  summary: string | null;
  key_takeaways: string[];
  commitments: CommitmentRow[];
  unresolved: UnresolvedRow[];
  material_needs: string[];
  /** Full text — present on GET /api/calls/:id and after client hydrate; null on lean list. */
  transcript: string | null;
  /** True when a transcripts row exists for this call (lean list uses this instead of shipping the blob). */
  has_transcript: boolean;
  todos: TodoRow[];
}

function parseJsonArray(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Handles both the current { item, blocked_on } shape and pre-M0 rows that stored plain strings. */
function parseUnresolvedArray(text: string | null | undefined): UnresolvedRow[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) =>
      typeof entry === "string"
        ? { item: entry, blocked_on: null }
        : { item: String(entry?.item ?? ""), blocked_on: entry?.blocked_on ? String(entry.blocked_on) : null }
    );
  } catch {
    return [];
  }
}

interface RawCallJoinRow {
  id: string;
  duration_s: number | null;
  recorded_at: string | null;
  recording_date: string | null;
  source: CallSource;
  call_type: CallType | null;
  recorded_for_site_id: string | null;
  summary: string | null;
  key_takeaways: string | null;
  unresolved: string | null;
  material_needs: string | null;
  deadline: string | null;
  transcript: string | null;
  has_transcript?: number | null;
  client_name: string;
  client_phone: string | null;
}

interface RawTodoRow {
  id: string;
  call_id: string;
  owner: TodoOwner;
  text: string;
  due_date: string | null;
  status: Todo["status"];
  completed_at: string | null;
  closed_by_call_id: string | null;
  customer_waiting: 0 | 1;
}

interface RawCommitmentRow {
  id: string;
  call_id: string;
  raw_phrase: string;
  resolved_datetime: string | null;
  promised_to: string | null;
}

interface RawSiteRow {
  call_id: string;
  name: string;
}

const CALL_SELECT = `
  SELECT calls.id, calls.duration_s, calls.recorded_at, calls.recording_date, calls.source,
         calls.call_type, calls.recorded_for_site_id, calls.summary, calls.key_takeaways,
         calls.unresolved, calls.material_needs, calls.deadline,
         transcripts.transcript AS transcript,
         CASE WHEN transcripts.r2_key IS NOT NULL THEN 1 ELSE 0 END AS has_transcript,
         COALESCE(callers.name, 'Unknown caller') AS client_name,
         callers.phone AS client_phone
  FROM calls
  LEFT JOIN callers ON calls.client_id = callers.id
  LEFT JOIN transcripts ON transcripts.r2_key = calls.r2_key
`;

/* Lean list for GET /api/calls — same joins/filters as CALL_SELECT but never
   selects the transcript blob (home/drilldowns use has_transcript instead). */
const CALL_LIST_SELECT = `
  SELECT calls.id, calls.duration_s, calls.recorded_at, calls.recording_date, calls.source,
         calls.call_type, calls.recorded_for_site_id, calls.summary, calls.key_takeaways,
         calls.unresolved, calls.material_needs, calls.deadline,
         NULL AS transcript,
         CASE WHEN transcripts.r2_key IS NOT NULL THEN 1 ELSE 0 END AS has_transcript,
         COALESCE(callers.name, 'Unknown caller') AS client_name,
         callers.phone AS client_phone
  FROM calls
  LEFT JOIN callers ON calls.client_id = callers.id
  LEFT JOIN transcripts ON transcripts.r2_key = calls.r2_key
`;

const TODO_SELECT = `
  SELECT id, call_id, owner, text, due_date, status, completed_at, closed_by_call_id, customer_waiting
  FROM todos
`;

const COMMITMENT_SELECT = `
  SELECT id, call_id, raw_phrase, resolved_datetime, promised_to
  FROM commitments
`;

/* Rejected sites (is_confirmed = 'N') are hidden from call chips — unreviewed
   (NULL) still show, only an explicit rejection hides one. */
const SITE_SELECT = `
  SELECT call_sites.call_id AS call_id, sites.name AS name
  FROM call_sites
  JOIN sites ON sites.id = call_sites.site_id
  WHERE sites.is_confirmed IS NOT 'N'
`;

function toTodoRow(t: RawTodoRow): TodoRow {
  return {
    id: t.id,
    owner: t.owner,
    text: t.text,
    due_date: t.due_date,
    status: t.status,
    completed_at: t.completed_at,
    closed_by_call_id: t.closed_by_call_id,
    assignees: [], // filled in by hydrateTodoAssignees — see hydrateCallRows/getCallWithTodos
  };
}

/** Batch-fetch assignees for many todos at once (mirrors queryAllByIdChunks
 *  usage elsewhere, e.g. getSitesNeedingAttention). */
export async function getAssigneesByTodoIds(db: D1Database, todoIds: string[]): Promise<Map<string, TodoAssignee[]>> {
  if (todoIds.length === 0) return new Map();
  const rows = await queryAllByIdChunks<{ todo_id: string; id: string; name: string }>(db, todoIds, (ph) =>
    `SELECT todo_assignees.todo_id AS todo_id, users.id AS id, users.name AS name
     FROM todo_assignees JOIN users ON users.id = todo_assignees.user_id
     WHERE todo_assignees.todo_id IN (${ph})`
  );
  const out = new Map<string, TodoAssignee[]>();
  for (const r of rows) {
    const list = out.get(r.todo_id) ?? [];
    list.push({ id: r.id, name: r.name });
    out.set(r.todo_id, list);
  }
  return out;
}

/** Mutates each TodoRow in place, attaching its assignees. Not baked into
 *  TODO_SELECT itself — a flat JOIN would duplicate todo rows for a
 *  multi-assignee todo. */
async function hydrateTodoAssignees(db: D1Database, todos: TodoRow[]): Promise<TodoRow[]> {
  if (todos.length === 0) return todos;
  const map = await getAssigneesByTodoIds(db, todos.map((t) => t.id));
  for (const t of todos) t.assignees = map.get(t.id) ?? [];
  return todos;
}

export async function isTodoAssignee(db: D1Database, todoId: string, userId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 FROM todo_assignees WHERE todo_id = ? AND user_id = ?`).bind(todoId, userId).first();
  return row != null;
}

/** Replaces the full assignee set for one todo (not incremental add/remove
 *  — matches a multi-select "Save" UI action). Empty array clears assignment. */
export async function setTodoAssignees(
  db: D1Database,
  todoId: string,
  userIds: string[],
  assignedByUserId: string | null
): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM todo_assignees WHERE todo_id = ?`).bind(todoId),
    ...userIds.map((uid) =>
      db
        .prepare(
          `INSERT INTO todo_assignees (todo_id, user_id, assigned_by_user_id, assigned_at) VALUES (?, ?, ?, datetime('now'))`
        )
        .bind(todoId, uid, assignedByUserId)
    ),
  ]);
}

function toCallRow(
  c: RawCallJoinRow,
  todos: TodoRow[],
  customerWaiting: 0 | 1,
  sites: string[],
  commitments: CommitmentRow[]
): CallRow {
  const hasTranscript = c.has_transcript != null ? Boolean(c.has_transcript) : c.transcript != null;
  return {
    id: c.id,
    client_name: c.client_name,
    client_phone: c.client_phone,
    recorded_at: c.recorded_at,
    recording_date: c.recording_date,
    duration_s: c.duration_s,
    source: c.source,
    customer_waiting: customerWaiting,
    call_type: c.call_type,
    recorded_for_site_id: c.recorded_for_site_id ?? null,
    sites,
    deadline: c.deadline,
    summary: c.summary,
    key_takeaways: parseJsonArray(c.key_takeaways),
    commitments,
    unresolved: parseUnresolvedArray(c.unresolved),
    material_needs: parseJsonArray(c.material_needs),
    transcript: c.transcript,
    has_transcript: hasTranscript,
    todos,
  };
}

export type CallEntryTypeFilter = "voice_call" | "voice_note";

export interface CallListFilters {
  includeLowSignal?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
  callers?: string[];
  importantOnly?: boolean;
  withTodosOnly?: boolean;
  entryTypes?: CallEntryTypeFilter[];
}

export const CALLS_PAGE_DEFAULT_LIMIT = 50;
export const CALLS_PAGE_MAX_LIMIT = 100;

export interface CallListPageResult {
  items: CallRow[];
  total: number;
  next_cursor: string | null;
  has_more: boolean;
}

const CALL_LIST_FROM = `
  FROM calls
  LEFT JOIN callers ON calls.client_id = callers.id
  LEFT JOIN transcripts ON transcripts.r2_key = calls.r2_key
`;

function buildCallListWhere(filters: CallListFilters): { sql: string; binds: unknown[] } {
  const clauses = ["calls.deleted_at IS NULL", "calls.stt_status != 'skipped'"];
  const binds: unknown[] = [];

  if (!filters.includeLowSignal) {
    clauses.push("(calls.call_type IS NULL OR calls.call_type != 'low_signal')");
  }
  if (filters.importantOnly) {
    clauses.push("(calls.call_type IS NULL OR calls.call_type != 'low_signal')");
  }
  if (filters.dateFrom) {
    clauses.push("COALESCE(calls.recording_date, substr(calls.recorded_at, 1, 10)) >= ?");
    binds.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push("COALESCE(calls.recording_date, substr(calls.recorded_at, 1, 10)) <= ?");
    binds.push(filters.dateTo);
  }
  if (filters.callers?.length) {
    const ph = filters.callers.map(() => "?").join(", ");
    clauses.push(`COALESCE(callers.name, 'Unknown caller') IN (${ph})`);
    binds.push(...filters.callers);
  }
  if (filters.withTodosOnly) {
    clauses.push("EXISTS (SELECT 1 FROM todos WHERE todos.call_id = calls.id)");
  }
  const types = filters.entryTypes?.length ? filters.entryTypes : [];
  if (types.length === 1) {
    if (types[0] === "voice_note") clauses.push("calls.recorded_for_site_id IS NOT NULL");
    else clauses.push("calls.recorded_for_site_id IS NULL");
  }

  return { sql: `WHERE ${clauses.join(" AND ")}`, binds };
}

function encodeCallCursor(recordedAt: string, id: string): string {
  const json = JSON.stringify({ recorded_at: recordedAt, id });
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCallCursor(cursor: string): { recorded_at: string; id: string } | null {
  try {
    const pad = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const padded = pad + "=".repeat((4 - (pad.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { recorded_at?: string; id?: string };
    if (typeof parsed.recorded_at === "string" && typeof parsed.id === "string") {
      return { recorded_at: parsed.recorded_at, id: parsed.id };
    }
  } catch {
    /* invalid cursor */
  }
  return null;
}

async function hydrateCallRows(db: D1Database, calls: RawCallJoinRow[]): Promise<CallRow[]> {
  if (calls.length === 0) return [];

  const callIds = calls.map((c) => c.id);
  const [todos, commitments, siteRows] = await Promise.all([
    queryAllByIdChunks<RawTodoRow>(db, callIds, (ph) =>
      `${TODO_SELECT} WHERE call_id IN (${ph}) ORDER BY created_at ASC`
    ),
    queryAllByIdChunks<RawCommitmentRow>(db, callIds, (ph) =>
      `${COMMITMENT_SELECT} WHERE call_id IN (${ph}) ORDER BY created_at ASC`
    ),
    queryAllByIdChunks<RawSiteRow>(db, callIds, (ph) => `${SITE_SELECT} AND call_sites.call_id IN (${ph})`),
  ]);

  const todoRows = todos.map(toTodoRow);
  await hydrateTodoAssignees(db, todoRows);

  const todosByCall = new Map<string, TodoRow[]>();
  const waitingByCall = new Map<string, boolean>();
  todos.forEach((t, i) => {
    const list = todosByCall.get(t.call_id) ?? [];
    list.push(todoRows[i]);
    todosByCall.set(t.call_id, list);
    if (t.status !== "done" && t.customer_waiting) waitingByCall.set(t.call_id, true);
  });

  const commitmentsByCall = new Map<string, CommitmentRow[]>();
  for (const c of commitments) {
    const list = commitmentsByCall.get(c.call_id) ?? [];
    list.push({ id: c.id, raw_phrase: c.raw_phrase, resolved_datetime: c.resolved_datetime, promised_to: c.promised_to });
    commitmentsByCall.set(c.call_id, list);
  }

  const sitesByCall = new Map<string, string[]>();
  for (const s of siteRows) {
    const list = sitesByCall.get(s.call_id) ?? [];
    list.push(s.name);
    sitesByCall.set(s.call_id, list);
  }

  return calls.map((c) =>
    toCallRow(
      c,
      todosByCall.get(c.id) ?? [],
      waitingByCall.get(c.id) ? 1 : 0,
      sitesByCall.get(c.id) ?? [],
      commitmentsByCall.get(c.id) ?? []
    )
  );
}

async function countCallsMatching(db: D1Database, filters: CallListFilters): Promise<number> {
  const { sql: where, binds } = buildCallListWhere(filters);
  const row = await db
    .prepare(`SELECT COUNT(*) AS n ${CALL_LIST_FROM} ${where}`)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Paginated call list — keyset cursor on (recorded_at DESC, id DESC). */
export async function listCallsPage(
  db: D1Database,
  opts: CallListFilters & { limit?: number; cursor?: string | null }
): Promise<CallListPageResult> {
  const limit = Math.min(Math.max(1, opts.limit ?? CALLS_PAGE_DEFAULT_LIMIT), CALLS_PAGE_MAX_LIMIT);
  const { sql: where, binds: filterBinds } = buildCallListWhere(opts);

  let cursorSql = "";
  const cursorBinds: unknown[] = [];
  if (opts.cursor) {
    const decoded = decodeCallCursor(opts.cursor);
    if (!decoded) throw new Error("invalid cursor");
    cursorSql = " AND (calls.recorded_at < ? OR (calls.recorded_at = ? AND calls.id < ?))";
    cursorBinds.push(decoded.recorded_at, decoded.recorded_at, decoded.id);
  }

  const [total, { results: rawCalls }] = await Promise.all([
    countCallsMatching(db, opts),
    db
      .prepare(
        `${CALL_LIST_SELECT} ${where}${cursorSql} ORDER BY calls.recorded_at DESC, calls.id DESC LIMIT ?`
      )
      .bind(...filterBinds, ...cursorBinds, limit)
      .all<RawCallJoinRow>(),
  ]);

  const calls = rawCalls ?? [];
  const items = await hydrateCallRows(db, calls);
  const last = calls[calls.length - 1];
  const next_cursor =
    last?.recorded_at && items.length === limit
      ? encodeCallCursor(last.recorded_at, last.id)
      : null;

  return { items, total, next_cursor, has_more: next_cursor != null };
}

/** Distinct caller names for the Calls filter dropdown. */
export async function listCallCallerOptions(
  db: D1Database,
  opts: { includeLowSignal?: boolean } = {}
): Promise<string[]> {
  const { sql: where, binds } = buildCallListWhere({ includeLowSignal: opts.includeLowSignal });
  const { results } = await db
    .prepare(
      `SELECT DISTINCT COALESCE(callers.name, 'Unknown caller') AS name
       ${CALL_LIST_FROM}
       ${where}
       ORDER BY name COLLATE NOCASE ASC`
    )
    .bind(...binds)
    .all<{ name: string }>();
  return (results ?? []).map((r) => r.name);
}

export interface CallsCalendarResult {
  days: Record<string, number>;
  min_year: number;
}

/** Home calendar — call counts per day (excludes low_signal, same as legacy bulk fetch). */
export async function getCallsCalendar(db: D1Database, year: number, month: number): Promise<CallsCalendarResult> {
  const monthIndex = month - 1;
  if (monthIndex < 0 || monthIndex > 11) throw new Error("invalid month");
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const baseWhere = buildCallListWhere({ includeLowSignal: false });

  const [{ results: dayRows }, minRow] = await Promise.all([
    db
      .prepare(
        `SELECT substr(calls.recorded_at, 1, 10) AS day, COUNT(*) AS n
         ${CALL_LIST_FROM}
         ${baseWhere.sql}
           AND calls.recorded_at IS NOT NULL
           AND substr(calls.recorded_at, 1, 10) >= ?
           AND substr(calls.recorded_at, 1, 10) <= ?
         GROUP BY day`
      )
      .bind(...baseWhere.binds, monthStart, monthEnd)
      .all<{ day: string; n: number }>(),
    db
      .prepare(
        `SELECT MIN(CAST(substr(calls.recorded_at, 1, 4) AS INTEGER)) AS min_year
         ${CALL_LIST_FROM}
         ${baseWhere.sql}
           AND calls.recorded_at IS NOT NULL`
      )
      .bind(...baseWhere.binds)
      .first<{ min_year: number | null }>(),
  ]);

  const days: Record<string, number> = {};
  for (const row of dayRows ?? []) days[row.day] = row.n;

  const currentYear = new Date().getFullYear();
  const min_year = minRow?.min_year ?? currentYear;

  return { days, min_year };
}

export interface DayClosureRow {
  id: string;
  text: string;
  owner: string;
  completed_at: string | null;
  client_name: string;
}

export interface CallsDayViewResult {
  calls: CallRow[];
  closures: DayClosureRow[];
}

/** Home day drilldown — calls recorded that day + todos completed that day. */
export async function getCallsDayView(db: D1Database, date: string): Promise<CallsDayViewResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid date");

  const { sql: where, binds } = buildCallListWhere({ includeLowSignal: false });
  const { results: rawCalls } = await db
    .prepare(
      `${CALL_LIST_SELECT} ${where} AND substr(calls.recorded_at, 1, 10) = ?
       ORDER BY calls.recorded_at DESC, calls.id DESC`
    )
    .bind(...binds, date)
    .all<RawCallJoinRow>();

  const { results: closureRows } = await db
    .prepare(
      `SELECT todos.id AS id, todos.text AS text, todos.owner AS owner, todos.completed_at AS completed_at,
              COALESCE(callers.name, 'Unknown caller') AS client_name
       FROM todos
       JOIN calls ON calls.id = todos.call_id
       LEFT JOIN callers ON callers.id = calls.client_id
       WHERE todos.status = 'done'
         AND substr(todos.completed_at, 1, 10) = ?
         AND calls.deleted_at IS NULL
         AND calls.stt_status != 'skipped'`
    )
    .bind(date)
    .all<DayClosureRow>();

  const calls = await hydrateCallRows(db, rawCalls ?? []);
  return { calls, closures: closureRows ?? [] };
}

/** Open / parked todo drilldowns — calls that have at least one todo in `status`. */
export async function listCallsByTodoStatus(
  db: D1Database,
  status: "open" | "snoozed"
): Promise<CallRow[]> {
  const { sql: where, binds } = buildCallListWhere({ includeLowSignal: false });
  const { results: rawCalls } = await db
    .prepare(
      `${CALL_LIST_SELECT} ${where}
         AND calls.id IN (SELECT DISTINCT call_id FROM todos WHERE status = ?)
       ORDER BY calls.recorded_at DESC, calls.id DESC`
    )
    .bind(...binds, status)
    .all<RawCallJoinRow>();
  return hydrateCallRows(db, rawCalls ?? []);
}

/**
 * `customer_waiting` lives per-todo in the schema (§4) but the dashboard
 * treats it as a call-level flag (the "customer waiting" badge, and the
 * sort rule). Reconciled here: a call is waiting if any of its still-open
 * todos are marked customer_waiting.
 *
 * By default `low_signal` calls are excluded — see docs/ADDITIONAL_FEATURES_M0.md
 * "call_type = low_signal". Pass `includeLowSignal: true` for the Calls
 * dashboard grid (Important vs Regular filters need both).
 *
 * Soft-deleted spam calls (`deleted_at`) and skipped Family/repeat-Spam
 * rows (`stt_status = 'skipped'`) are always excluded — see migration
 * 0021 — regardless of `includeLowSignal`; they never produced a real
 * dashboard card.
 */
export async function listCallsWithTodos(
  db: D1Database,
  opts: { includeLowSignal?: boolean } = {}
): Promise<CallRow[]> {
  const all: CallRow[] = [];
  let cursor: string | null = null;
  do {
    const page = await listCallsPage(db, { ...opts, limit: CALLS_PAGE_MAX_LIMIT, cursor });
    all.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return all;
}

export async function getCallWithTodos(db: D1Database, id: string): Promise<CallRow | null> {
  const c = await db.prepare(`${CALL_SELECT} WHERE calls.id = ?`).bind(id).first<RawCallJoinRow>();
  if (!c) return null;

  const [{ results: rawTodos }, { results: rawCommitments }, { results: rawSites }] = await Promise.all([
    db.prepare(`${TODO_SELECT} WHERE call_id = ? ORDER BY created_at ASC`).bind(id).all<RawTodoRow>(),
    db.prepare(`${COMMITMENT_SELECT} WHERE call_id = ? ORDER BY created_at ASC`).bind(id).all<RawCommitmentRow>(),
    db.prepare(`${SITE_SELECT} AND call_sites.call_id = ?`).bind(id).all<RawSiteRow>(),
  ]);

  let customerWaiting: 0 | 1 = 0;
  const todos = rawTodos.map((t) => {
    if (t.status !== "done" && t.customer_waiting) customerWaiting = 1;
    return toTodoRow(t);
  });
  await hydrateTodoAssignees(db, todos);
  const commitments = rawCommitments.map((c) => ({
    id: c.id,
    raw_phrase: c.raw_phrase,
    resolved_datetime: c.resolved_datetime,
    promised_to: c.promised_to,
  }));
  const sites = rawSites.map((s) => s.name);

  return toCallRow(c, todos, customerWaiting, sites, commitments);
}

export async function getTodoById(db: D1Database, id: string): Promise<Todo | null> {
  const row = await db.prepare(`SELECT * FROM todos WHERE id = ?`).bind(id).first<Todo>();
  return row ?? null;
}

/** getTodoById plus its assignees — what API responses after a mutation
 *  should return, since Todo itself no longer carries assignment fields. */
export async function getTodoRowWithAssignees(db: D1Database, id: string): Promise<(Todo & { assignees: TodoAssignee[] }) | null> {
  const todo = await getTodoById(db, id);
  if (!todo) return null;
  const map = await getAssigneesByTodoIds(db, [id]);
  return { ...todo, assignees: map.get(id) ?? [] };
}

// ---------------------------------------------------------------------------
// Calls Needing Action — admin carousel of every call with an AI-generated
// todo list not yet explicitly resolved. See migration 0025.
// ---------------------------------------------------------------------------

/**
 * Every call with >=1 LLM-generated todo, not yet explicitly resolved by an
 * admin. NOT gated on remaining open todos — resolve is a manual ack,
 * independent of todo completion, so an all-done-but-unresolved call stays
 * listed until the admin taps Resolve. Ordered oldest-first so the carousel
 * and its date slider agree on ordering.
 */
export async function getCallsNeedingAction(db: D1Database, limit = 200): Promise<CallRow[]> {
  const { results } = await db
    .prepare(
      `${CALL_LIST_SELECT} WHERE calls.resolved_at IS NULL
         AND calls.deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM todos WHERE todos.call_id = calls.id AND todos.origin = 'llm')
       ORDER BY COALESCE(calls.recording_date, substr(calls.recorded_at, 1, 10)) ASC, calls.recorded_at ASC
       LIMIT ?`
    )
    .bind(limit)
    .all<RawCallJoinRow>();
  return hydrateCallRows(db, results ?? []);
}

export async function countCallsNeedingAction(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM calls
       WHERE calls.resolved_at IS NULL AND calls.deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM todos WHERE todos.call_id = calls.id AND todos.origin = 'llm')`
    )
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Manual admin ack — unconditional, no gate on remaining open todos. */
export async function resolveCall(db: D1Database, callId: string, resolvedByUserId: string): Promise<void> {
  await db
    .prepare(`UPDATE calls SET resolved_at = datetime('now'), resolved_by_user_id = ? WHERE id = ?`)
    .bind(resolvedByUserId, callId)
    .run();
}

/**
 * Logs "assigned {todo text} to {names}" against every site the todo's call
 * is linked to via call_sites — same free-text pattern updateSite/createSite
 * already use for site_edits. No-op if the call isn't linked to any site
 * (an ordinary phone call with no site tag). getSiteTimeline's `call` entries
 * only carry todo details for site voice memos (recorded_for_site_id ===
 * siteId), not ordinary phone calls, so this explicit log is what actually
 * makes an assignment show up in a site's timeline.
 */
export async function logTodoAssignmentToSiteTimeline(db: D1Database, todoId: string, actorUserId: string): Promise<void> {
  const { results: rows } = await db
    .prepare(
      `SELECT todos.text AS text, call_sites.site_id AS site_id
       FROM todos JOIN call_sites ON call_sites.call_id = todos.call_id
       WHERE todos.id = ?`
    )
    .bind(todoId)
    .all<{ text: string; site_id: string }>();
  if (!rows || rows.length === 0) return;

  const assignees = (await getAssigneesByTodoIds(db, [todoId])).get(todoId) ?? [];
  const names = assignees.length ? assignees.map((a) => a.name).join(", ") : "no one";
  const summary = `Todo "${rows[0].text}" assigned to ${names}`;
  await db.batch(
    rows.map((r) =>
      db
        .prepare(`INSERT INTO site_edits (id, site_id, actor_user_id, summary) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), r.site_id, actorUserId, summary)
    )
  );
}

// ---------------------------------------------------------------------------
// Todo voice notes — raw R2 audio an admin attaches to one todo row from the
// Calls Needing Action carousel. Never transcribed. See migration 0025.
// ---------------------------------------------------------------------------

export async function addTodoVoiceNote(
  db: D1Database,
  input: { todoId: string; r2Key: string; contentType: string; durationS: number | null; uploadedByUserId: string }
): Promise<TodoVoiceNote> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO todo_voice_notes (id, todo_id, r2_key, content_type, duration_s, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.todoId, input.r2Key, input.contentType, input.durationS, input.uploadedByUserId)
    .run();
  const row = await db.prepare(`SELECT * FROM todo_voice_notes WHERE id = ?`).bind(id).first<TodoVoiceNote>();
  return row!;
}

/** Latest voice note per todo id — older rows are kept for audit but the UI
 *  only ever plays the most recent one. */
export async function getLatestVoiceNotesByTodoIds(db: D1Database, todoIds: string[]): Promise<Map<string, TodoVoiceNote>> {
  if (todoIds.length === 0) return new Map();
  const rows = await queryAllByIdChunks<TodoVoiceNote>(db, todoIds, (ph) =>
    `SELECT * FROM todo_voice_notes WHERE todo_id IN (${ph}) ORDER BY created_at DESC`
  );
  const out = new Map<string, TodoVoiceNote>();
  for (const r of rows) if (!out.has(r.todo_id)) out.set(r.todo_id, r); // first-seen per id = most recent
  return out;
}

export async function getTodoVoiceNoteById(db: D1Database, id: string): Promise<TodoVoiceNote | null> {
  return (await db.prepare(`SELECT * FROM todo_voice_notes WHERE id = ?`).bind(id).first<TodoVoiceNote>()) ?? null;
}

const TODO_PATCH_FIELDS = ["status", "completed_at", "snoozed_until"] as const;
type TodoPatchField = (typeof TODO_PATCH_FIELDS)[number];

/** Task 7 — the only fields the dashboard's optimistic update ever sends. */
export async function updateTodo(
  db: D1Database,
  id: string,
  patch: Partial<Record<TodoPatchField, string | null>>
): Promise<(Todo & { assignees: TodoAssignee[] }) | null> {
  const fields = TODO_PATCH_FIELDS.filter((f) => f in patch);
  if (fields.length === 0) return getTodoRowWithAssignees(db, id);

  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => patch[f] ?? null);
  await db
    .prepare(`UPDATE todos SET ${setClause} WHERE id = ?`)
    .bind(...values, id)
    .run();
  return getTodoRowWithAssignees(db, id);
}

// ---------------------------------------------------------------------------
// Sites, escalations — docs/ADDITIONAL_FEATURES_M0.md "Phase 1 home page".
// ---------------------------------------------------------------------------

export interface SiteRow {
  id: string;
  name: string;
  is_confirmed: "Y" | "N" | null;
  address: string | null;
  poc_name: string | null;
  house_no: string | null;
  sector: string | null;
  city: string | null;
  poc_contact_number: string | null;
  assigned_by: string | null;
  referred_by: string | null;
  site_location: string | null;
  target_closure_date: string | null;
}

export interface SiteIntakeDetails {
  name?: string | null;
  house_no?: string | null;
  sector?: string | null;
  city?: string | null;
  address?: string | null;
  poc_name?: string | null;
  poc_contact_number?: string | null;
  assigned_by?: string | null;
  referred_by?: string | null;
  site_location?: string | null;
}

const SITE_ROW_SELECT = `SELECT id, name, is_confirmed, address, poc_name,
  house_no, sector, city, poc_contact_number, assigned_by, referred_by, site_location,
  target_closure_date FROM sites`;

/** Display name for a new site — explicit name wins, else H.No + sector + city. */
export function resolveSiteName(details: SiteIntakeDetails): string {
  const explicit = details.name?.trim();
  if (explicit) return explicit;
  const parts = [details.house_no, details.sector, details.city].map((s) => s?.trim()).filter(Boolean);
  return parts.join(", ") || "New site";
}

function composeSiteAddress(details: SiteIntakeDetails): string | null {
  if (details.address?.trim()) return details.address.trim();
  const parts = [
    details.house_no?.trim() ? `H.No ${details.house_no.trim()}` : null,
    details.sector?.trim() ? `Sector ${details.sector.trim()}` : null,
    details.city?.trim() || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function normalizeIntake(details: SiteIntakeDetails) {
  const trim = (s?: string | null) => (s?.trim() ? s.trim() : null);
  return {
    name: resolveSiteName(details),
    house_no: trim(details.house_no),
    sector: trim(details.sector),
    city: trim(details.city),
    address: composeSiteAddress(details),
    poc_name: trim(details.poc_name),
    poc_contact_number: trim(details.poc_contact_number),
    assigned_by: trim(details.assigned_by),
    referred_by: trim(details.referred_by),
    site_location: trim(details.site_location),
  };
}

/** All sites regardless of confirmation state — the review screen needs to see everything. */
/**
 * `forUserId` restricts to sites that user is on the team roster for — used
 * for a `staff` session (see migration 0011); omitted for admin/superadmin,
 * who see everything, same as before roles existed.
 */
export async function listSites(db: D1Database, forUserId?: string | null): Promise<SiteRow[]> {
  // Same "team roster OR holds a site_task" rule as isUserAssignedToSite —
  // otherwise a staff member with a workflow assignment but no team-roster
  // row could open the site via a workflow tile yet not find it listed here.
  const scoped = forUserId
    ? `AND id IN (
         SELECT site_id FROM site_team_members WHERE user_id = ?
         UNION
         SELECT site_id FROM site_tasks WHERE assigned_to_user_id = ?
       )`
    : "";
  const stmt = db.prepare(`${SITE_ROW_SELECT} WHERE 1=1 ${scoped} ORDER BY (is_confirmed IS NOT NULL), name ASC`);
  const { results } = await (forUserId ? stmt.bind(forUserId, forUserId) : stmt).all<SiteRow>();
  return results;
}

const SITE_PATCH_FIELDS = [
  "is_confirmed",
  "address",
  "poc_name",
  "house_no",
  "sector",
  "city",
  "poc_contact_number",
  "assigned_by",
  "referred_by",
  "site_location",
  "target_closure_date",
] as const;
type SitePatchField = (typeof SITE_PATCH_FIELDS)[number];

/**
 * One dynamic patch for everything editable on a site: confirmation status
 * (SitesReviewView) and address/point-of-contact (SiteView — always
 * editable, not gated on the site having any calls or open items). Only
 * the fields present in `patch` are touched, same pattern as updateTodo.
 *
 * `actorUserId` is opportunistic — passed only when a session cookie was
 * present on the request (see requireSession in src/lib/auth.ts). When a
 * human-meaningful field (address/poc_name) actually changed, a `site_edits`
 * row is logged so the unified timeline (getSiteTimeline) has something to
 * show for "site details edited"; a bare confirmation-status change doesn't
 * log, since that's the review workflow's own action, not a detail edit.
 */
export async function updateSite(
  db: D1Database,
  id: string,
  patch: Partial<Record<SitePatchField, string | null>>,
  actorUserId?: string | null
): Promise<SiteRow | null> {
  const fields = SITE_PATCH_FIELDS.filter((f) => f in patch);
  if (fields.length > 0) {
    const setClause = fields.map((f) => `${f} = ?`).join(", ");
    const values = fields.map((f) => patch[f] ?? null);
    const statements = [db.prepare(`UPDATE sites SET ${setClause} WHERE id = ?`).bind(...values, id)];

    const detailFields = fields.filter(
      (f) =>
        f === "address" ||
        f === "poc_name" ||
        f === "house_no" ||
        f === "sector" ||
        f === "city" ||
        f === "poc_contact_number" ||
        f === "assigned_by" ||
        f === "referred_by" ||
        f === "site_location"
    );
    if (detailFields.length > 0) {
      const labels = detailFields.map((f) => {
        if (f === "poc_name") return "point of contact";
        if (f === "poc_contact_number") return "contact number";
        if (f === "house_no") return "H.No";
        if (f === "site_location") return "site location";
        return f.replace(/_/g, " ");
      });
      statements.push(
        db
          .prepare(`INSERT INTO site_edits (id, site_id, actor_user_id, summary) VALUES (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), id, actorUserId ?? null, `${labels.join(", ").replace(/^./, (c) => c.toUpperCase())} updated`)
      );
    }

    // A dedicated, value-bearing entry rather than folding into the generic
    // "Address, point of contact updated" line above — everyone watching
    // this site (admin/superadmin and staff both read the same timeline)
    // needs to see *what* the new date is without opening the edit form.
    if (fields.includes("target_closure_date")) {
      const value = patch.target_closure_date ?? null;
      const summary = value ? `Target closure date updated to ${value}` : `Target closure date cleared`;
      statements.push(
        db
          .prepare(`INSERT INTO site_edits (id, site_id, actor_user_id, summary) VALUES (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), id, actorUserId ?? null, summary)
      );
    }
    await db.batch(statements);
  }
  const row = await db.prepare(`${SITE_ROW_SELECT} WHERE id = ?`).bind(id).first<SiteRow>();
  return row ?? null;
}

/**
 * Manual "Add new site" — distinct from upsertSite (used by the LLM
 * extraction/site-scan pipeline, which leaves is_confirmed NULL pending
 * review). A human explicitly typing a site name here needs no review, so
 * it's confirmed immediately. Find-or-create by name: if the site already
 * exists (e.g. an unreviewed one the LLM already found), this confirms and
 * patches it rather than erroring on the UNIQUE constraint — same
 * `updateSite` path SitesReviewView uses, so it logs a site_edits row too.
 */
/**
 * Find-or-create a confirmed site by name. When `assignCreatorUserId` is set
 * (staff self-serve create), the creator is added to the site team so the
 * site appears in their scoped listSites / getConfirmedSitesSummary.
 */
export async function createSite(
  db: D1Database,
  details: SiteIntakeDetails,
  actorUserId?: string | null,
  assignCreatorUserId?: string | null
): Promise<SiteRow> {
  const intake = normalizeIntake(details);
  const existing = await db.prepare(`${SITE_ROW_SELECT} WHERE name = ?`).bind(intake.name).first<SiteRow>();
  let site: SiteRow;
  if (existing) {
    const updated = await updateSite(
      db,
      existing.id,
      {
        is_confirmed: "Y",
        address: intake.address,
        poc_name: intake.poc_name,
        house_no: intake.house_no,
        sector: intake.sector,
        city: intake.city,
        poc_contact_number: intake.poc_contact_number,
        assigned_by: intake.assigned_by,
        referred_by: intake.referred_by,
        site_location: intake.site_location,
      },
      actorUserId ?? null
    );
    site = updated ?? existing;
  } else {
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO sites (id, name, is_confirmed, address, poc_name, house_no, sector, city,
           poc_contact_number, assigned_by, referred_by, site_location)
           VALUES (?, ?, 'Y', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          intake.name,
          intake.address,
          intake.poc_name,
          intake.house_no,
          intake.sector,
          intake.city,
          intake.poc_contact_number,
          intake.assigned_by,
          intake.referred_by,
          intake.site_location
        ),
      db
        .prepare(`INSERT INTO site_edits (id, site_id, actor_user_id, summary) VALUES (?, ?, ?, 'Site added')`)
        .bind(crypto.randomUUID(), id, actorUserId ?? null),
    ]);
    await seedSiteTasks(db, id);
    const row = await db.prepare(`${SITE_ROW_SELECT} WHERE id = ?`).bind(id).first<SiteRow>();
    site = row!;
  }

  if (assignCreatorUserId) {
    const onTeam = await db
      .prepare(`SELECT 1 FROM site_team_members WHERE site_id = ? AND user_id = ? LIMIT 1`)
      .bind(site.id, assignCreatorUserId)
      .first();
    if (!onTeam) {
      const user = await getUserById(db, assignCreatorUserId);
      if (user) {
        await addSiteTeamMember(db, site.id, user.name, user.phone ?? "", assignCreatorUserId, assignCreatorUserId);
      }
    }
  }

  return site;
}

export interface SiteTeamMemberRow {
  id: string;
  name: string;
  contact_number: string;
  user_id: string | null;
}

/**
 * `contact_number` reads live from `users.phone` for a row linked to a real
 * account (the dropdown-assigned path — see migration 0011), falling back
 * to the snapshot taken at assignment time for legacy free-text rows. That
 * way an account's own phone-number update (POST /api/me/phone) shows up
 * here immediately, with nothing to keep in sync on write.
 */
export async function listSiteTeamMembers(db: D1Database, siteId: string): Promise<SiteTeamMemberRow[]> {
  const { results } = await db
    .prepare(
      `SELECT site_team_members.id AS id, site_team_members.name AS name,
              COALESCE(users.phone, site_team_members.contact_number) AS contact_number,
              site_team_members.user_id AS user_id
       FROM site_team_members
       LEFT JOIN users ON users.id = site_team_members.user_id
       WHERE site_team_members.site_id = ?
       ORDER BY site_team_members.created_at ASC`
    )
    .bind(siteId)
    .all<SiteTeamMemberRow>();
  return results;
}

/**
 * True if `userId` is on `siteId`'s team roster, OR holds a site_task there
 * — backs assertSiteMembership in src/lib/auth.ts (gates the site timeline,
 * team roster, media, voice-note, and recording routes for a `staff`
 * session). Found live while testing migration 0013: admin can assign a
 * workflow stage to a staff member without also adding them to the site's
 * team roster, and without this OR clause that staff member would see the
 * site in their own workflow tiles but get a 403 wall opening it.
 */
export async function isUserAssignedToSite(db: D1Database, userId: string, siteId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM site_team_members WHERE site_id = ? AND user_id = ?
       UNION
       SELECT 1 FROM site_tasks WHERE site_id = ? AND assigned_to_user_id = ?
       LIMIT 1`
    )
    .bind(siteId, userId, siteId, userId)
    .first();
  return row !== null;
}

/** True if `callId` is linked (call_sites) to any site `userId` is on the team roster for — lets a `staff` session open a call's transcript from their site's timeline. */
/**
 * Excludes site voice memos (`calls.recorded_for_site_id IS NOT NULL`)
 * deliberately — their transcript and extracted todos are admin/superadmin
 * only, unlike a real call that happens to be linked to a staff member's
 * site via the site-scan pass, which stays visible to them as before.
 */
export async function isCallAccessibleToUser(db: D1Database, userId: string, callId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM call_sites
       JOIN calls ON calls.id = call_sites.call_id
       JOIN site_team_members ON site_team_members.site_id = call_sites.site_id
       WHERE call_sites.call_id = ? AND site_team_members.user_id = ? AND calls.recorded_for_site_id IS NULL
       LIMIT 1`
    )
    .bind(callId, userId)
    .first();
  if (row !== null) return true;
  // Staff with an assigned call-todo can open that call for context (incl. voice memos).
  const assigned = await db
    .prepare(
      `SELECT 1 FROM todos JOIN todo_assignees ON todo_assignees.todo_id = todos.id
       WHERE todos.call_id = ? AND todo_assignees.user_id = ? LIMIT 1`
    )
    .bind(callId, userId)
    .first();
  return assigned !== null;
}

/**
 * True if `callId` is linked (call_sites) to any site `userId` is on the
 * team roster for — unlike isCallAccessibleToUser above, this INCLUDES site
 * voice memos: playing back a staff member's own site voice memo is
 * intentional (see AudioPlayer in SiteTimelineEntry, web/src/Dashboard.jsx),
 * only the memo's transcript/todos stay admin-only. Used to scope
 * GET /api/calls/:id/recording so a `staff` session can't stream another
 * site's raw audio just by guessing/knowing a call id.
 */
export async function isCallRecordingAccessibleToUser(db: D1Database, userId: string, callId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM call_sites
       JOIN site_team_members ON site_team_members.site_id = call_sites.site_id
       WHERE call_sites.call_id = ? AND site_team_members.user_id = ?
       LIMIT 1`
    )
    .bind(callId, userId)
    .first();
  return row !== null;
}

/** `memberUserId` links this row to a real login account (the admin "choose from dropdown" flow) — see migration 0011. */
export async function addSiteTeamMember(
  db: D1Database,
  siteId: string,
  name: string,
  contactNumber: string,
  addedBy?: string | null,
  memberUserId?: string | null
): Promise<SiteTeamMemberRow> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO site_team_members (id, site_id, name, contact_number, added_by, user_id) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, siteId, name, contactNumber, addedBy ?? null, memberUserId ?? null)
    .run();
  return { id, name, contact_number: contactNumber, user_id: memberUserId ?? null };
}

export interface SiteAttentionRow {
  id: string;
  name: string;
  open_count: number;
  oldest_age_days: number;
}

/**
 * Tile 3 inclusion rule: a site has an item aged past its promise date, or
 * has something blocked. "Age" for a blocked-but-not-overdue item is
 * approximated as days since the call that raised it, since unresolved
 * items don't carry their own due date. Sorted oldest-first, capped.
 */
export async function getSitesNeedingAttention(db: D1Database, limit = 4): Promise<SiteAttentionRow[]> {
  const { results: siteCalls } = await db
    .prepare(
      `SELECT sites.id AS site_id, sites.name AS site_name, calls.id AS call_id,
              calls.recorded_at AS recorded_at, calls.unresolved AS unresolved
       FROM sites
       JOIN call_sites ON call_sites.site_id = sites.id
       JOIN calls ON calls.id = call_sites.call_id
       WHERE sites.is_confirmed IS NOT 'N'`
    )
    .all<{ site_id: string; site_name: string; call_id: string; recorded_at: string | null; unresolved: string | null }>();
  if (siteCalls.length === 0) return [];

  const callIds = [...new Set(siteCalls.map((r) => r.call_id))];
  const openTodos = await queryAllByIdChunks<{ call_id: string; due_date: string | null }>(
    db,
    callIds,
    (ph) => `SELECT call_id, due_date FROM todos WHERE status = 'open' AND call_id IN (${ph})`
  );

  const openTodosByCall = new Map<string, Array<string | null>>();
  for (const t of openTodos) {
    const list = openTodosByCall.get(t.call_id) ?? [];
    list.push(t.due_date);
    openTodosByCall.set(t.call_id, list);
  }

  const DAY_MS = 86400000;
  const todayMs = Date.now();

  interface Agg {
    name: string;
    openCount: number;
    oldestAgeDays: number;
    qualifies: boolean;
  }
  const bySite = new Map<string, Agg>();

  for (const row of siteCalls) {
    const agg = bySite.get(row.site_id) ?? { name: row.site_name, openCount: 0, oldestAgeDays: 0, qualifies: false };

    const dueDates = openTodosByCall.get(row.call_id) ?? [];
    agg.openCount += dueDates.length;
    for (const due of dueDates) {
      if (!due) continue;
      const ageDays = Math.floor((todayMs - new Date(due).getTime()) / DAY_MS);
      if (ageDays > 0) {
        agg.qualifies = true;
        agg.oldestAgeDays = Math.max(agg.oldestAgeDays, ageDays);
      }
    }

    let blockedCount = 0;
    try {
      const parsed = row.unresolved ? JSON.parse(row.unresolved) : [];
      if (Array.isArray(parsed)) {
        blockedCount = parsed.filter((u) => typeof u === "object" && u !== null && u.blocked_on).length;
      }
    } catch {
      // malformed JSON on an old row — treat as no blocked items rather than failing the whole tile
    }
    if (blockedCount > 0) {
      agg.qualifies = true;
      if (row.recorded_at) {
        const ageDays = Math.floor((todayMs - new Date(row.recorded_at).getTime()) / DAY_MS);
        agg.oldestAgeDays = Math.max(agg.oldestAgeDays, ageDays);
      }
    }

    bySite.set(row.site_id, agg);
  }

  return [...bySite.entries()]
    .filter(([, a]) => a.qualifies)
    .map(([id, a]) => ({ id, name: a.name, open_count: a.openCount, oldest_age_days: a.oldestAgeDays }))
    .sort((a, b) => b.oldest_age_days - a.oldest_age_days)
    .slice(0, limit);
}

export interface ConfirmedSiteRow {
  id: string;
  name: string;
  open_count: number;
  target_closure_date: string | null;
  /** Count of the other role's timeline entries since the viewer's own last one on this site — see getUnreadActivityCounts. Merged in by the handler, not this query. */
  unread_count?: number;
}

/**
 * Every confirmed (is_confirmed = 'Y') site with its current open-item
 * count — the directory reached from the sites tile's "N confirmed sites"
 * rollup, distinct from getSitesNeedingAttention: this lists ALL confirmed
 * sites regardless of whether anything's overdue or blocked, sites with
 * zero calls included. Alphabetical — it's a reference list, not a triage
 * queue.
 */
/**
 * `forUserId` (a `staff` session — see listSites above) drops the
 * is_confirmed = 'Y' requirement down to "not explicitly rejected": a site
 * they're assigned to should show up the moment it's assigned, not only
 * once an admin has separately run it through the confirmation workflow —
 * that workflow is an admin curation concept staff have no visibility into
 * or need for. admin/superadmin keep the stricter confirmed-only list.
 */
export async function getConfirmedSitesSummary(db: D1Database, forUserId?: string | null): Promise<ConfirmedSiteRow[]> {
  const confirmedClause = forUserId ? `sites.is_confirmed IS NOT 'N'` : `sites.is_confirmed = 'Y'`;
  // Same "team roster OR holds a site_task" rule as isUserAssignedToSite —
  // otherwise "All my sites" wouldn't list a site the workflow tiles already
  // let this staff member open.
  const scoped = forUserId
    ? `AND sites.id IN (
         SELECT site_id FROM site_team_members WHERE user_id = ?
         UNION
         SELECT site_id FROM site_tasks WHERE assigned_to_user_id = ?
       )`
    : "";
  const stmt = db.prepare(
    `SELECT sites.id AS id, sites.name AS name, sites.target_closure_date AS target_closure_date,
            COALESCE(SUM(CASE WHEN todos.status = 'open' THEN 1 ELSE 0 END), 0) AS open_count
     FROM sites
     LEFT JOIN call_sites ON call_sites.site_id = sites.id
     LEFT JOIN todos ON todos.call_id = call_sites.call_id
     WHERE ${confirmedClause} ${scoped}
     GROUP BY sites.id, sites.name, sites.target_closure_date
     ORDER BY sites.name ASC`
  );
  const { results } = await (forUserId ? stmt.bind(forUserId, forUserId) : stmt).all<ConfirmedSiteRow>();
  return results;
}

/**
 * Powers the glowing unread-count badge on each site row in the Sites list.
 * "Unread" = the other role's (staff vs admin/superadmin) timeline entries
 * on that site since the viewer's own most recent one there — not since the
 * viewer last *opened* the site, per the "clears when you respond" spec.
 * Reads the same four sources getSiteTimeline composes (calls linked via
 * call_sites, site_media, site_team_members, site_edits), each reduced to
 * (site_id, actor_id, created_at) and unioned so "my last activity" and
 * "their activity since" can be computed in one pass instead of one query
 * per site.
 */
export async function getUnreadActivityCounts(
  db: D1Database,
  viewerId: string,
  viewerRole: UserRole
): Promise<Map<string, number>> {
  const otherRoleClause = viewerRole === "staff" ? `users.role IN ('admin', 'superadmin')` : `users.role = 'staff'`;
  const { results } = await db
    .prepare(
      `WITH activity AS (
         SELECT call_sites.site_id AS site_id, calls.uploaded_by_user_id AS actor_id, calls.recorded_at AS created_at
         FROM call_sites JOIN calls ON calls.id = call_sites.call_id
         WHERE calls.uploaded_by_user_id IS NOT NULL
         UNION ALL
         SELECT site_id, uploaded_by AS actor_id, created_at FROM site_media
         UNION ALL
         SELECT site_id, added_by AS actor_id, created_at FROM site_team_members WHERE added_by IS NOT NULL
         UNION ALL
         SELECT site_id, actor_user_id AS actor_id, created_at FROM site_edits WHERE actor_user_id IS NOT NULL
       ),
       my_last AS (
         SELECT site_id, MAX(created_at) AS last_at FROM activity WHERE actor_id = ? GROUP BY site_id
       )
       SELECT activity.site_id AS site_id, COUNT(*) AS unread_count
       FROM activity
       JOIN users ON users.id = activity.actor_id
       LEFT JOIN my_last ON my_last.site_id = activity.site_id
       WHERE ${otherRoleClause}
         AND (my_last.last_at IS NULL OR activity.created_at > my_last.last_at)
       GROUP BY activity.site_id`
    )
    .bind(viewerId)
    .all<{ site_id: string; unread_count: number }>();
  return new Map(results.map((r) => [r.site_id, r.unread_count]));
}

export interface EscalationRow {
  id: string;
  text: string;
  site_id: string | null;
  site_name: string | null;
  status: EscalationStatus;
  created_at: string;
  closed_at: string | null;
  source: EscalationSource;
  created_by_name: string | null;
}

/** Staff-filed complaints (`source = staff_field`) with site + assignee joins. */
export interface ComplaintRow extends EscalationRow {
  site_address: string | null;
  site_poc_name: string | null;
  assigned_to_user_id: string | null;
  assignee_name: string | null;
}

const COMPLAINT_LIST_SELECT = `SELECT escalations.id, escalations.text, escalations.site_id, sites.name AS site_name,
              sites.address AS site_address, sites.poc_name AS site_poc_name,
              escalations.status, escalations.created_at, escalations.closed_at,
              escalations.source, creator.name AS created_by_name,
              escalations.assigned_to_user_id, assignee.name AS assignee_name
       FROM escalations
       LEFT JOIN sites ON sites.id = escalations.site_id
       LEFT JOIN users AS creator ON creator.id = escalations.created_by_user_id
       LEFT JOIN users AS assignee ON assignee.id = escalations.assigned_to_user_id
       WHERE escalations.source = 'staff_field'`;

export interface CallForSiteScan {
  id: string;
  diarized_transcript: string;
}

/**
 * Calls with a transcript but no site scan result yet — for backfilling
 * `sites` from real historical calls that predate the Haiku site scan
 * (packages/core/prompts/site-scan.ts), which only runs automatically on
 * new calls going forward. `force` rescans every transcribed call instead,
 * including ones already linked to a site.
 */
export async function listCallsForSiteScan(db: D1Database, force = false): Promise<CallForSiteScan[]> {
  const scoped = force ? "" : "AND calls.id NOT IN (SELECT call_id FROM call_sites)";
  const { results } = await db
    .prepare(
      `SELECT calls.id AS id, transcripts.diarized_transcript AS diarized_transcript
       FROM calls
       JOIN transcripts ON transcripts.r2_key = calls.r2_key
       WHERE transcripts.diarized_transcript IS NOT NULL ${scoped}`
    )
    .all<CallForSiteScan>();
  return results;
}

export async function listOpenEscalations(db: D1Database): Promise<EscalationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT escalations.id, escalations.text, escalations.site_id, sites.name AS site_name,
              escalations.status, escalations.created_at, escalations.closed_at,
              escalations.source, creator.name AS created_by_name
       FROM escalations
       LEFT JOIN sites ON sites.id = escalations.site_id
       LEFT JOIN users AS creator ON creator.id = escalations.created_by_user_id
       WHERE escalations.status = 'open'
       ORDER BY escalations.created_at ASC`
    )
    .all<EscalationRow>();
  return results;
}

/** All staff-filed complaints — admin view; newest first. */
export async function listComplaints(db: D1Database, forUserId?: string | null): Promise<ComplaintRow[]> {
  let sql = COMPLAINT_LIST_SELECT;
  const binds: string[] = [];
  if (forUserId) {
    sql += ` AND (
         escalations.created_by_user_id = ?
         OR escalations.site_id IN (SELECT site_id FROM site_team_members WHERE user_id = ?)
       )`;
    binds.push(forUserId, forUserId);
  }
  sql += ` ORDER BY escalations.created_at DESC`;
  const stmt = db.prepare(sql);
  const bound = binds.length ? stmt.bind(...binds) : stmt;
  const { results } = await bound.all<ComplaintRow>();
  return results;
}

/** Open staff-filed complaints count — home tile. */
export async function countOpenComplaints(db: D1Database, forUserId?: string | null): Promise<number> {
  let sql = `SELECT COUNT(*) AS n FROM escalations
             WHERE source = 'staff_field' AND status = 'open'`;
  const binds: string[] = [];
  if (forUserId) {
    sql += ` AND (
         created_by_user_id = ?
         OR site_id IN (SELECT site_id FROM site_team_members WHERE user_id = ?)
       )`;
    binds.push(forUserId, forUserId);
  }
  const stmt = db.prepare(sql);
  const bound = binds.length ? stmt.bind(...binds) : stmt;
  const row = await bound.first<{ n: number }>();
  return row?.n ?? 0;
}

export async function assignComplaint(
  db: D1Database,
  id: string,
  assignedToUserId: string,
  assignedByUserId: string
): Promise<ComplaintRow | null> {
  await db
    .prepare(
      `UPDATE escalations
       SET assigned_to_user_id = ?, assigned_by_user_id = ?, assigned_at = datetime('now')
       WHERE id = ? AND source = 'staff_field'`
    )
    .bind(assignedToUserId, assignedByUserId, id)
    .run();
  const { results } = await db
    .prepare(`${COMPLAINT_LIST_SELECT} AND escalations.id = ?`)
    .bind(id)
    .all<ComplaintRow>();
  return results[0] ?? null;
}

/** @deprecated Use listComplaints(db, userId) — kept for callers migrating gradually. */
export async function listStaffComplaints(db: D1Database, userId: string): Promise<ComplaintRow[]> {
  return listComplaints(db, userId);
}

export interface NewEscalationInput {
  text: string;
  siteId?: string | null;
  /** migration 0016: attribution for a staff-filed complaint. Omitted for admin-typed entries. */
  createdByUserId?: string | null;
  source?: EscalationSource;
  installationUpdateId?: string | null;
}

/** Manual only — see schema.sql comment on `escalations`. Never called from the extraction path. */
export async function createEscalation(db: D1Database, input: NewEscalationInput): Promise<Escalation> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO escalations (id, text, site_id, created_by_user_id, source, installation_update_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.text,
      input.siteId ?? null,
      input.createdByUserId ?? null,
      input.source ?? "admin",
      input.installationUpdateId ?? null
    )
    .run();
  const row = await db.prepare(`SELECT * FROM escalations WHERE id = ?`).bind(id).first<Escalation>();
  return row!;
}

export async function closeEscalation(db: D1Database, id: string): Promise<Escalation | null> {
  await db
    .prepare(`UPDATE escalations SET status = 'done', closed_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();
  return db.prepare(`SELECT * FROM escalations WHERE id = ?`).bind(id).first<Escalation>();
}

// ---------------------------------------------------------------------------
// Users & sessions — admin-seeded accounts, name + PIN login. See
// src/lib/auth.ts for hashing/token mechanics; this file only ever sees
// hashes, never a raw PIN or session token.
// ---------------------------------------------------------------------------

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

export async function createUser(
  db: D1Database,
  name: string,
  pinHash: string,
  pinSalt: string,
  role: UserRole = "staff",
  phone: string | null = null,
  pinEncrypted: string | null = null
): Promise<User> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, name, pin_hash, pin_salt, role, phone, pin_encrypted) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, pinHash, pinSalt, role, phone, pinEncrypted)
    .run();
  return (await getUserById(db, id))!;
}

/** Staff page — every `staff` account, plus the requesting admin/superadmin's own row (view/reset your own PIN too, not other admins'). */
export async function listStaffAndSelf(db: D1Database, requesterId: string): Promise<User[]> {
  const { results } = await db
    .prepare(`SELECT * FROM users WHERE role = 'staff' OR id = ? ORDER BY (id = ?) DESC, name ASC`)
    .bind(requesterId, requesterId)
    .all<User>();
  return results;
}

export interface StaffRosterRow {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * The "assign team member" dropdown's data source — `staff` accounts only
 * (never admin/superadmin, and never the requester's own row the way
 * listStaffAndSelf includes it), and only the three fields the dropdown
 * needs. Deliberately not listStaffAndSelf: that query also decrypts every
 * row's PIN, which the dropdown never shows and which was making it slow
 * to open for no reason.
 */
export async function listStaffRoster(db: D1Database): Promise<StaffRosterRow[]> {
  const { results } = await db
    .prepare(`SELECT id, name, phone FROM users WHERE role = 'staff' ORDER BY name ASC`)
    .all<StaffRosterRow>();
  return results;
}

export async function updateUserPhone(db: D1Database, userId: string, phone: string | null): Promise<void> {
  await db.prepare(`UPDATE users SET phone = ? WHERE id = ?`).bind(phone, userId).run();
}

export async function getUserByName(db: D1Database, name: string): Promise<User | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE name = ?`).bind(name).first<User>();
  return row ?? null;
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(id).first<User>();
  return row ?? null;
}

/**
 * PIN reset (self-service POST /api/me/pin, admin-create, or admin
 * POST /api/staff/:id/reset-pin) — a fresh salt is generated for every
 * reset, not reused. `pinEncrypted` keeps the reversible copy (see
 * src/lib/auth.ts encryptPin) in sync with the hash so the Staff page never
 * shows a stale PIN.
 */
export async function updateUserPin(
  db: D1Database,
  userId: string,
  pinHash: string,
  pinSalt: string,
  pinEncrypted: string | null
): Promise<void> {
  await db
    .prepare(`UPDATE users SET pin_hash = ?, pin_salt = ?, pin_encrypted = ? WHERE id = ?`)
    .bind(pinHash, pinSalt, pinEncrypted, userId)
    .run();
}

/** Login failure — locks the account for LOCKOUT_MINUTES once LOCKOUT_THRESHOLD consecutive failures are hit. */
export async function incrementFailedLogin(db: D1Database, userId: string): Promise<void> {
  const user = await getUserById(db, userId);
  if (!user) return;
  const attempts = user.failed_attempts + 1;
  const lockedUntil =
    attempts >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : user.locked_until;
  await db
    .prepare(`UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`)
    .bind(attempts, lockedUntil, userId)
    .run();
}

export async function resetFailedLogin(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`).bind(userId).run();
}

export async function createSession(db: D1Database, userId: string, tokenHash: string, expiresAt: string): Promise<void> {
  await db
    .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`)
    .bind(tokenHash, userId, expiresAt)
    .run();
}

export interface SessionWithUser {
  user_id: string;
  user_name: string;
  user_role: UserRole;
  user_phone: string | null;
  last_seen_at: string;
}

/** Joins sessions+users and filters revoked/expired — a row back means "valid session." */
export async function getSessionWithUser(db: D1Database, tokenHash: string): Promise<SessionWithUser | null> {
  const row = await db
    .prepare(
      `SELECT users.id AS user_id, users.name AS user_name, users.role AS user_role,
              users.phone AS user_phone, sessions.last_seen_at AS last_seen_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?
         AND sessions.revoked_at IS NULL
         AND sessions.expires_at > datetime('now')
         AND users.disabled_at IS NULL`
    )
    .bind(tokenHash)
    .first<SessionWithUser>();
  return row ?? null;
}

/** Sliding expiry — see SESSION_REFRESH_THRESHOLD_MS in src/lib/auth.ts for why this isn't called on every request. */
export async function touchSession(db: D1Database, tokenHash: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare(`UPDATE sessions SET last_seen_at = datetime('now'), expires_at = ? WHERE token_hash = ?`)
    .bind(expiresAt, tokenHash)
    .run();
}

export async function revokeSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ?`).bind(tokenHash).run();
}

/** Lost/compromised device — the admin-only escape hatch, see POST /api/admin/users/:id/revoke-sessions. */
export async function revokeAllSessionsForUser(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`)
    .bind(userId)
    .run();
}

// ---------------------------------------------------------------------------
// Site media (photos/videos) — voice notes are calls, not site_media rows;
// see NewCallInput.recordedForSiteId.
// ---------------------------------------------------------------------------

export interface NewSiteMediaInput {
  siteId: string;
  mediaType: SiteMediaType;
  r2Key: string;
  contentType: string;
  fileSize: number | null;
  caption: string | null;
  uploadedBy: string;
  /** Set when this documents a specific installation checklist row — see src/handlers/installation.ts. */
  installationUpdateId?: string | null;
}

export async function addSiteMedia(db: D1Database, input: NewSiteMediaInput): Promise<SiteMedia> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO site_media (id, site_id, media_type, r2_key, content_type, file_size, caption, uploaded_by, installation_update_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.siteId,
      input.mediaType,
      input.r2Key,
      input.contentType,
      input.fileSize,
      input.caption,
      input.uploadedBy,
      input.installationUpdateId ?? null
    )
    .run();
  return (await getSiteMediaById(db, id))!;
}

export async function getSiteMediaById(db: D1Database, id: string): Promise<SiteMedia | null> {
  const row = await db.prepare(`SELECT * FROM site_media WHERE id = ?`).bind(id).first<SiteMedia>();
  return row ?? null;
}

export async function listSiteMedia(db: D1Database, siteId: string): Promise<SiteMedia[]> {
  const { results } = await db
    .prepare(`SELECT * FROM site_media WHERE site_id = ? ORDER BY created_at DESC`)
    .bind(siteId)
    .all<SiteMedia>();
  return results;
}

// ---------------------------------------------------------------------------
// Unified site timeline — composed at read time from calls (incl. voice
// memos), site_media, site_team_members, and site_edits, rather than a
// generic write-time activity log. See the plan's "Timeline read strategy"
// note for why.
// ---------------------------------------------------------------------------

export type SiteTimelineEntryType = "call" | "media" | "team_added" | "site_edit";

export interface SiteTimelineEntry {
  type: SiteTimelineEntryType;
  id: string;
  created_at: string;
  actor_name: string | null;
  summary: string;
  /** call: call id. media: site_media row (id/media_type/r2_key/content_type/caption). team_added: name/contact_number. */
  ref: unknown;
}

/**
 * `includeCallDetails` attaches the full transcript and todo list to each
 * voice-memo entry's `ref` — gated by the caller to admin/superadmin only
 * (see handleGetSiteTimeline), since transcripts and todos extracted from a
 * site voice note are not staff-visible. Kept out of the shape by default so
 * a staff response never carries the data at all, not just hides it in UI.
 */
export async function getSiteTimeline(
  db: D1Database,
  siteId: string,
  includeCallDetails = false
): Promise<SiteTimelineEntry[]> {
  const [{ results: callRows }, { results: mediaRows }, { results: teamRows }, { results: editRows }] =
    await Promise.all([
      db
        .prepare(
          `SELECT calls.id AS id, calls.recorded_at AS created_at, calls.summary AS summary,
                  calls.call_type AS call_type, calls.recorded_for_site_id AS recorded_for_site_id,
                  calls.installation_update_id AS installation_update_id,
                  transcripts.transcript AS transcript,
                  users.name AS actor_name
           FROM call_sites
           JOIN calls ON calls.id = call_sites.call_id
           LEFT JOIN users ON users.id = calls.uploaded_by_user_id
           LEFT JOIN transcripts ON transcripts.r2_key = calls.r2_key
           WHERE call_sites.site_id = ?`
        )
        .bind(siteId)
        .all<{
          id: string;
          created_at: string | null;
          summary: string | null;
          call_type: CallType | null;
          recorded_for_site_id: string | null;
          installation_update_id: string | null;
          transcript: string | null;
          actor_name: string | null;
        }>(),
      db
        .prepare(
          `SELECT site_media.id AS id, site_media.created_at AS created_at, site_media.media_type AS media_type,
                  site_media.r2_key AS r2_key, site_media.content_type AS content_type, site_media.caption AS caption,
                  site_media.installation_update_id AS installation_update_id,
                  users.name AS actor_name
           FROM site_media
           JOIN users ON users.id = site_media.uploaded_by
           WHERE site_media.site_id = ?`
        )
        .bind(siteId)
        .all<{
          id: string;
          created_at: string;
          media_type: SiteMediaType;
          r2_key: string;
          content_type: string;
          caption: string | null;
          installation_update_id: string | null;
          actor_name: string;
        }>(),
      db
        .prepare(
          `SELECT site_team_members.id AS id, site_team_members.created_at AS created_at,
                  site_team_members.name AS member_name, site_team_members.contact_number AS contact_number,
                  users.name AS actor_name
           FROM site_team_members
           LEFT JOIN users ON users.id = site_team_members.added_by
           WHERE site_team_members.site_id = ?`
        )
        .bind(siteId)
        .all<{ id: string; created_at: string; member_name: string; contact_number: string; actor_name: string | null }>(),
      db
        .prepare(
          `SELECT site_edits.id AS id, site_edits.created_at AS created_at, site_edits.summary AS summary,
                  users.name AS actor_name
           FROM site_edits
           LEFT JOIN users ON users.id = site_edits.actor_user_id
           WHERE site_edits.site_id = ?`
        )
        .bind(siteId)
        .all<{ id: string; created_at: string; summary: string; actor_name: string | null }>(),
    ]);

  const entries: SiteTimelineEntry[] = [];

  const voiceMemoCallIds = includeCallDetails
    ? callRows.filter((c) => c.recorded_for_site_id === siteId).map((c) => c.id)
    : [];
  const todosByVoiceMemoCall = new Map<string, TodoRow[]>();
  if (voiceMemoCallIds.length > 0) {
    const rawTodos = await queryAllByIdChunks<RawTodoRow>(db, voiceMemoCallIds, (ph) =>
      `${TODO_SELECT} WHERE call_id IN (${ph}) ORDER BY created_at ASC`
    );
    const rows = rawTodos.map(toTodoRow);
    await hydrateTodoAssignees(db, rows);
    rawTodos.forEach((rt, i) => {
      const list = todosByVoiceMemoCall.get(rt.call_id) ?? [];
      list.push(rows[i]);
      todosByVoiceMemoCall.set(rt.call_id, list);
    });
  }

  for (const c of callRows) {
    const isVoiceMemo = c.recorded_for_site_id === siteId;
    entries.push({
      type: "call",
      id: c.id,
      created_at: c.created_at ?? "",
      actor_name: c.actor_name,
      summary: c.summary ?? (isVoiceMemo ? "Voice note — transcribing…" : "Call recorded"),
      ref: {
        call_id: c.id,
        is_voice_memo: isVoiceMemo,
        installation_update_id: c.installation_update_id,
        ...(includeCallDetails && isVoiceMemo
          ? { transcript: c.transcript ?? null, todos: todosByVoiceMemoCall.get(c.id) ?? [] }
          : {}),
      },
    });
  }

  for (const m of mediaRows) {
    entries.push({
      type: "media",
      id: m.id,
      created_at: m.created_at,
      actor_name: m.actor_name,
      summary: m.caption ?? (m.media_type === "photo" ? "Photo added" : "Video added"),
      ref: {
        media_id: m.id,
        media_type: m.media_type,
        content_type: m.content_type,
        installation_update_id: m.installation_update_id,
      },
    });
  }

  for (const tm of teamRows) {
    entries.push({
      type: "team_added",
      id: tm.id,
      created_at: tm.created_at,
      actor_name: tm.actor_name,
      summary: `${tm.member_name} added to the team`,
      ref: { name: tm.member_name, contact_number: tm.contact_number },
    });
  }

  for (const e of editRows) {
    entries.push({
      type: "site_edit",
      id: e.id,
      created_at: e.created_at,
      actor_name: e.actor_name,
      summary: e.summary,
      ref: null,
    });
  }

  return entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/* ------------------------------------------------------------------
   Site-task workflow system — migration 0013. workflow_stages is a fixed,
   pre-seeded catalog (no write path); site_tasks is the per-site instance
   of each stage. Deliberately no ordering between stages — see the
   migration header — so "what's next" is always a human choice, never
   computed.
   ------------------------------------------------------------------ */

/** Seeds every catalog stage for one site, unassigned. Called once from createSite; the 0013 migration backfills existing sites the same way. */
export async function seedSiteTasks(db: D1Database, siteId: string): Promise<void> {
  const { results: stages } = await db.prepare(`SELECT id FROM workflow_stages`).all<{ id: string }>();
  if (stages.length === 0) return;
  await db.batch(
    stages.map((s) =>
      db
        .prepare(`INSERT INTO site_tasks (id, site_id, stage_id, status) VALUES (?, ?, ?, 'unassigned')`)
        .bind(crypto.randomUUID(), siteId, s.id)
    )
  );
}

export interface SiteTaskRow {
  id: string;
  site_id: string;
  site_name: string;
  stage_id: string;
  stage_label: string;
  category: WorkflowCategory;
  status: SiteTaskStatus;
  assigned_to_user_id: string | null;
  assignee_name: string | null;
  assigned_at: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
}

const SITE_TASK_ROW_SELECT = `
  SELECT site_tasks.id AS id,
         site_tasks.site_id AS site_id,
         sites.name AS site_name,
         site_tasks.stage_id AS stage_id,
         workflow_stages.label AS stage_label,
         workflow_stages.category AS category,
         site_tasks.status AS status,
         site_tasks.assigned_to_user_id AS assigned_to_user_id,
         assignee.name AS assignee_name,
         site_tasks.assigned_at AS assigned_at,
         site_tasks.due_date AS due_date,
         site_tasks.completed_at AS completed_at,
         completer.name AS completed_by_name
  FROM site_tasks
  JOIN sites ON sites.id = site_tasks.site_id
  JOIN workflow_stages ON workflow_stages.id = site_tasks.stage_id
  LEFT JOIN users AS assignee ON assignee.id = site_tasks.assigned_to_user_id
  LEFT JOIN users AS completer ON completer.id = site_tasks.completed_by_user_id
`;

/** All 23 stages for one site — backs the admin "View work timeline" popup. */
export async function listSiteTasks(db: D1Database, siteId: string): Promise<SiteTaskRow[]> {
  const { results } = await db.prepare(`${SITE_TASK_ROW_SELECT} WHERE site_tasks.site_id = ?`).bind(siteId).all<SiteTaskRow>();
  return results;
}

/**
 * Open (status = 'assigned') tasks, scoped by role: `forUserId` set → just
 * that person's own assignments (staff home tiles); omitted/null → every
 * open assignment business-wide (admin home tiles). Same query backs both,
 * per docs — the dashboard groups the flat list into category tiles client-side.
 */
export async function listOpenSiteTasks(db: D1Database, forUserId?: string | null): Promise<SiteTaskRow[]> {
  const scoped = forUserId ? `AND site_tasks.assigned_to_user_id = ?` : "";
  const hidden = forUserId ? staffHiddenCategorySql() : { clause: "", binds: [] as string[] };
  const stmt = db.prepare(
    `${SITE_TASK_ROW_SELECT} WHERE site_tasks.status = 'assigned' ${scoped} ${hidden.clause}
     ORDER BY (site_tasks.due_date IS NULL) ASC, site_tasks.due_date ASC`
  );
  const binds = forUserId ? [forUserId, ...hidden.binds] : hidden.binds;
  const bound = binds.length ? stmt.bind(...binds) : stmt;
  const { results } = await bound.all<SiteTaskRow>();
  return results;
}

/** Every still-unassigned stage at one site — the handoff picker shown after marking a stage done. */
export async function listUnassignedSiteTasksForSite(
  db: D1Database,
  siteId: string,
  excludeStaffHidden = false
): Promise<SiteTaskRow[]> {
  const hidden = excludeStaffHidden ? staffHiddenCategorySql() : { clause: "", binds: [] as string[] };
  const stmt = db.prepare(
    `${SITE_TASK_ROW_SELECT} WHERE site_tasks.site_id = ? AND site_tasks.status = 'unassigned' ${hidden.clause}`
  );
  const bound = stmt.bind(siteId, ...hidden.binds);
  const { results } = await bound.all<SiteTaskRow>();
  return results;
}

export async function getSiteTaskById(db: D1Database, id: string): Promise<SiteTaskRow | null> {
  const row = await db.prepare(`${SITE_TASK_ROW_SELECT} WHERE site_tasks.id = ?`).bind(id).first<SiteTaskRow>();
  return row ?? null;
}

/**
 * True if `userId` currently holds (or has completed) another task on
 * `siteId` — the narrow permission that lets a staff member hand a stage
 * off to a teammate without an admin, but only on a site they're already
 * actively working. See docs conversation on the assign-next flow.
 */
export async function isUserActiveOnSiteTasks(db: D1Database, userId: string, siteId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM site_tasks
       WHERE site_id = ? AND assigned_to_user_id = ? AND status IN ('assigned', 'done')
       LIMIT 1`
    )
    .bind(siteId, userId)
    .first();
  return row !== null;
}

/** Assign or reassign one stage. `dueDate` is optional and cleared with null. */
export async function assignSiteTask(
  db: D1Database,
  id: string,
  input: { assignedToUserId: string; assignedByUserId: string; dueDate?: string | null }
): Promise<SiteTaskRow | null> {
  // `dueDate` is genuinely tri-state: undefined ("not touched by this
  // patch") must leave the existing value alone, which COALESCE(?, due_date)
  // cannot do — it treats a bound NULL (an explicit clear) as "keep the old
  // value" too, so a clear would silently never apply.
  const touchesDueDate = input.dueDate !== undefined;
  const dueDateClause = touchesDueDate ? `, due_date = ?` : "";
  const stmt = db.prepare(
    `UPDATE site_tasks
     SET status = 'assigned', assigned_to_user_id = ?, assigned_by_user_id = ?,
         assigned_at = datetime('now') ${dueDateClause}
     WHERE id = ?`
  );
  const bound = touchesDueDate
    ? stmt.bind(input.assignedToUserId, input.assignedByUserId, input.dueDate, id)
    : stmt.bind(input.assignedToUserId, input.assignedByUserId, id);
  await bound.run();
  return getSiteTaskById(db, id);
}

export async function completeSiteTask(db: D1Database, id: string, completedByUserId: string): Promise<SiteTaskRow | null> {
  await db
    .prepare(`UPDATE site_tasks SET status = 'done', completed_at = datetime('now'), completed_by_user_id = ? WHERE id = ?`)
    .bind(completedByUserId, id)
    .run();
  return getSiteTaskById(db, id);
}

// ---------------------------------------------------------------------------
// Staff field workflow — migration 0016. "Installations" (physical
// windows/openings at a site) each accumulate a repeatable 6-category
// checklist ("installation_updates") over visits. See the schema.sql
// comment on `installations` for how this differs from workflow_stages/
// site_tasks above.
// ---------------------------------------------------------------------------

export async function createInstallation(
  db: D1Database,
  siteId: string,
  label: string,
  createdBy: string,
  category: InstallationCategory
): Promise<Installation> {
  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO installations (id, site_id, label, created_by, category) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, siteId, label, createdBy, category)
    .run();
  const row = await db.prepare(`SELECT * FROM installations WHERE id = ?`).bind(id).first<Installation>();
  return row!;
}

/** `category` scopes to one of the three site-visit categories sharing this table — see migration 0017. */
export async function listInstallations(db: D1Database, siteId: string, category: InstallationCategory): Promise<Installation[]> {
  const { results } = await db
    .prepare(`SELECT * FROM installations WHERE site_id = ? AND category = ? ORDER BY created_at ASC`)
    .bind(siteId, category)
    .all<Installation>();
  return results;
}

export async function getInstallationById(db: D1Database, id: string): Promise<Installation | null> {
  const row = await db.prepare(`SELECT * FROM installations WHERE id = ?`).bind(id).first<Installation>();
  return row ?? null;
}

export interface InstallationUpdateRow {
  id: string;
  installation_id: string;
  site_id: string;
  category: InstallationUpdateCategory;
  voice_note_call_id: string | null;
  reported_by_user_id: string;
  reported_by_name: string | null;
  created_at: string;
  /** Read-time computation — a row is "complete" once a voice note exists AND media_count > 0. */
  media_count: number;
}

const INSTALLATION_UPDATE_ROW_SELECT = `
  SELECT installation_updates.id AS id,
         installation_updates.installation_id AS installation_id,
         installations.site_id AS site_id,
         installation_updates.category AS category,
         installation_updates.voice_note_call_id AS voice_note_call_id,
         installation_updates.reported_by_user_id AS reported_by_user_id,
         reporter.name AS reported_by_name,
         installation_updates.created_at AS created_at,
         (SELECT COUNT(*) FROM site_media WHERE site_media.installation_update_id = installation_updates.id) AS media_count
  FROM installation_updates
  JOIN installations ON installations.id = installation_updates.installation_id
  LEFT JOIN users AS reporter ON reporter.id = installation_updates.reported_by_user_id
`;

/** Full history for one installation, oldest first — the frontend groups by category and shows the latest per category on the checklist. */
export async function listInstallationUpdates(db: D1Database, installationId: string): Promise<InstallationUpdateRow[]> {
  const { results } = await db
    .prepare(`${INSTALLATION_UPDATE_ROW_SELECT} WHERE installation_updates.installation_id = ? ORDER BY installation_updates.created_at ASC`)
    .bind(installationId)
    .all<InstallationUpdateRow>();
  return results;
}

export async function getInstallationUpdateById(db: D1Database, id: string): Promise<InstallationUpdateRow | null> {
  const row = await db
    .prepare(`${INSTALLATION_UPDATE_ROW_SELECT} WHERE installation_updates.id = ?`)
    .bind(id)
    .first<InstallationUpdateRow>();
  return row ?? null;
}

export interface NewInstallationUpdateInput {
  /** Caller-generated (matches insertCall's `id` convention) so the handler can also stamp it onto the call it wraps as `installation_update_id` before this row exists. */
  id: string;
  installationId: string;
  category: InstallationUpdateCategory;
  voiceNoteCallId: string;
  reportedByUserId: string;
}

/** Created once the required voice note has been submitted — see src/handlers/installation.ts. */
export async function createInstallationUpdate(db: D1Database, input: NewInstallationUpdateInput): Promise<InstallationUpdateRow> {
  await db
    .prepare(
      `INSERT INTO installation_updates (id, installation_id, category, voice_note_call_id, reported_by_user_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(input.id, input.installationId, input.category, input.voiceNoteCallId, input.reportedByUserId)
    .run();
  return (await getInstallationUpdateById(db, input.id))!;
}

export interface NewMaterialShortageInput {
  siteId: string;
  installationId?: string | null;
  installationUpdateId?: string | null;
  reportedByUserId: string;
  description?: string | null;
}

/** Real ledger (open/fulfilled) — see schema.sql comment on `material_shortages`. */
export async function createMaterialShortage(db: D1Database, input: NewMaterialShortageInput): Promise<MaterialShortage> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO material_shortages (id, site_id, installation_id, installation_update_id, description, reported_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.siteId, input.installationId ?? null, input.installationUpdateId ?? null, input.description ?? null, input.reportedByUserId)
    .run();
  const row = await db.prepare(`SELECT * FROM material_shortages WHERE id = ?`).bind(id).first<MaterialShortage>();
  return row!;
}

export interface MaterialShortageRow extends MaterialShortage {
  site_name: string;
  reported_by_name: string | null;
}

/** Admin ledger view — `status` omitted returns every row, open first. */
export async function listMaterialShortages(db: D1Database, status?: MaterialShortageStatus): Promise<MaterialShortageRow[]> {
  const scoped = status ? `WHERE material_shortages.status = ?` : "";
  const stmt = db.prepare(
    `SELECT material_shortages.*, sites.name AS site_name, reporter.name AS reported_by_name
     FROM material_shortages
     JOIN sites ON sites.id = material_shortages.site_id
     LEFT JOIN users AS reporter ON reporter.id = material_shortages.reported_by_user_id
     ${scoped}
     ORDER BY (material_shortages.status = 'open') DESC, material_shortages.reported_at DESC`
  );
  const { results } = await (status ? stmt.bind(status) : stmt).all<MaterialShortageRow>();
  return results;
}

export async function resolveMaterialShortage(db: D1Database, id: string, resolvedByUserId: string): Promise<MaterialShortage | null> {
  await db
    .prepare(`UPDATE material_shortages SET status = 'fulfilled', resolved_by_user_id = ?, resolved_at = datetime('now') WHERE id = ?`)
    .bind(resolvedByUserId, id)
    .run();
  return db.prepare(`SELECT * FROM material_shortages WHERE id = ?`).bind(id).first<MaterialShortage>();
}

/**
 * Total row count in `calls`, including low_signal — the home-page "Calls
 * logged" tile. Excludes soft-deleted spam and skipped Family/repeat-Spam
 * rows (migration 0021) — those were never actually processed, so counting
 * them would inflate a stat that means "calls we did work on".
 */
export async function getCallsCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM calls WHERE deleted_at IS NULL AND stt_status != 'skipped'`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Transcript bodies for the lean call list — same call set as listCallsWithTodos
 * (excludes low_signal, soft-deleted spam, and skipped rows).
 * Keyed by call id; null when no transcripts row yet.
 */
export async function listCallTranscripts(db: D1Database): Promise<Record<string, string | null>> {
  const { results } = await db
    .prepare(
      `SELECT calls.id AS id, transcripts.transcript AS transcript
       FROM calls
       LEFT JOIN transcripts ON transcripts.r2_key = calls.r2_key
       WHERE (calls.call_type IS NULL OR calls.call_type != 'low_signal')
         AND calls.deleted_at IS NULL
         AND calls.stt_status != 'skipped'`
    )
    .all<{ id: string; transcript: string | null }>();
  const out: Record<string, string | null> = {};
  for (const row of results) out[row.id] = row.transcript;
  return out;
}

/**
 * "Today" for closed_today — Asia/Kolkata, matching the office locale the
 * dashboard formats dates in (en-IN). Compared against substr(completed_at,1,10)
 * the same way the client compared dayKey(completed_at) to local today.
 */
function todayKeyKolkata(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface DashboardSummary {
  open_today: number;
  closed_today: number;
  parked_count: number;
  calls_count: number;
  sites_attention: SiteAttentionRow[];
  escalations: EscalationRow[];
  sites: SiteRow[];
  staff_roster: StaffRosterRow[];
  open_site_tasks: SiteTaskRow[];
  /** Open call todos assigned to this user — staff home tile; empty for admin summary. */
  my_open_todos: AssignedTodoRow[];
  confirmed_count: number;
  unconfirmed_count: number;
  /** Callers Directory tile count — admin/superadmin only; 0 on the staff-scoped summary. */
  callers_count: number;
  /** Calls Needing Action tile count (migration 0025) — admin/superadmin only; 0 on the staff-scoped summary. */
  calls_needing_action_count: number;
}

export interface AssignedTodoRow {
  id: string;
  call_id: string;
  owner: TodoOwner;
  text: string;
  due_date: string | null;
  status: Todo["status"];
  client_name: string;
  recorded_at: string | null;
}

/** Open call todos assigned to a staff user — personal work queue. */
export async function listMyOpenTodos(db: D1Database, userId: string): Promise<AssignedTodoRow[]> {
  const { results } = await db
    .prepare(
      `SELECT todos.id AS id,
              todos.call_id AS call_id,
              todos.owner AS owner,
              todos.text AS text,
              todos.due_date AS due_date,
              todos.status AS status,
              COALESCE(callers.name, 'Unknown caller') AS client_name,
              calls.recorded_at AS recorded_at
       FROM todos
       JOIN calls ON calls.id = todos.call_id
       LEFT JOIN callers ON callers.id = calls.client_id
       WHERE todos.status = 'open'
         AND EXISTS (SELECT 1 FROM todo_assignees WHERE todo_assignees.todo_id = todos.id AND todo_assignees.user_id = ?)
       ORDER BY (todos.due_date IS NULL), todos.due_date ASC, calls.recorded_at DESC`
    )
    .bind(userId)
    .all<AssignedTodoRow>();
  return results ?? [];
}

/**
 * Home-page read model — live aggregates + small lists, no call transcripts.
 * `forUserId` set (staff) → only sites + open_site_tasks + my_open_todos scoped to that user;
 * admin fields are zero/empty. Omitted/null → full admin/superadmin payload.
 */
export async function getDashboardSummary(
  db: D1Database,
  forUserId?: string | null
): Promise<DashboardSummary> {
  if (forUserId) {
    const [sites, open_site_tasks, my_open_todos] = await Promise.all([
      listSites(db, forUserId),
      listOpenSiteTasks(db, forUserId),
      listMyOpenTodos(db, forUserId),
    ]);
    return {
      open_today: 0,
      closed_today: 0,
      parked_count: 0,
      calls_count: 0,
      sites_attention: [],
      escalations: [],
      sites,
      staff_roster: [],
      open_site_tasks,
      my_open_todos,
      confirmed_count: sites.filter((s) => s.is_confirmed === "Y").length,
      unconfirmed_count: sites.filter((s) => s.is_confirmed === null).length,
      callers_count: 0,
      calls_needing_action_count: 0,
    };
  }

  const todayKey = todayKeyKolkata();
  const [
    openRow,
    closedRow,
    parkedRow,
    calls_count,
    callersRow,
    sites_attention,
    escalations,
    sites,
    staff_roster,
    open_site_tasks,
    callsNeedingActionCount,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM todos WHERE status = 'open'`).first<{ n: number }>(),
    db
      .prepare(`SELECT COUNT(*) AS n FROM todos WHERE status = 'done' AND substr(completed_at, 1, 10) = ?`)
      .bind(todayKey)
      .first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n FROM todos WHERE status = 'snoozed'`).first<{ n: number }>(),
    getCallsCount(db),
    db.prepare(`SELECT COUNT(*) AS n FROM callers`).first<{ n: number }>(),
    getSitesNeedingAttention(db),
    listOpenEscalations(db),
    listSites(db),
    listStaffRoster(db),
    listOpenSiteTasks(db),
    countCallsNeedingAction(db),
  ]);

  return {
    open_today: openRow?.n ?? 0,
    closed_today: closedRow?.n ?? 0,
    parked_count: parkedRow?.n ?? 0,
    calls_count,
    sites_attention,
    escalations,
    sites,
    staff_roster,
    open_site_tasks,
    my_open_todos: [],
    confirmed_count: sites.filter((s) => s.is_confirmed === "Y").length,
    unconfirmed_count: sites.filter((s) => s.is_confirmed === null).length,
    callers_count: callersRow?.n ?? 0,
    calls_needing_action_count: callsNeedingActionCount,
  };
}

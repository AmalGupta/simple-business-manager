// All D1 access lives here — see docs/SCAFFOLDING.md §1 ("no SQL outside queries.ts").

import type { Call, CallExtraction, CallSource, CallType, Escalation, EscalationStatus, Todo, TodoOwner } from "./types";

export interface NewCallInput {
  id: string;
  r2Key: string;
  source: CallSource;
  recordedAt: string;
  recordingDate: string | null;
  durationS: number | null;
}

export async function insertCall(db: D1Database, input: NewCallInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO calls (id, r2_key, source, recorded_at, recording_date, duration_s, stt_status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`
    )
    .bind(input.id, input.r2Key, input.source, input.recordedAt, input.recordingDate, input.durationS)
    .run();
}

export async function getCallById(db: D1Database, id: string): Promise<Call | null> {
  const row = await db.prepare(`SELECT * FROM calls WHERE id = ?`).bind(id).first<Call>();
  return row ?? null;
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
 * via ON CONFLICT rather than erroring.
 */
async function upsertSite(db: D1Database, name: string): Promise<string> {
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

/** Task 5 — extraction landed. Writes the extracted fields, prompt_version, sites, todos, and commitments. */
export async function saveExtraction(
  db: D1Database,
  callId: string,
  extraction: CallExtraction,
  promptVersion: string
): Promise<void> {
  const siteNames = [...new Set(extraction.sites.map((s) => s.trim()).filter(Boolean))];
  const siteIds = await Promise.all(siteNames.map((name) => upsertSite(db, name)));

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
    statements.push(
      db
        .prepare(`INSERT INTO todos (id, call_id, owner, text, due_date, origin) VALUES (?, ?, ?, ?, ?, 'llm')`)
        .bind(crypto.randomUUID(), callId, todo.owner, todo.text, todo.due_date || null)
    );
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
  sites: string[];
  deadline: string | null;
  summary: string | null;
  key_takeaways: string[];
  commitments: CommitmentRow[];
  unresolved: UnresolvedRow[];
  material_needs: string[];
  transcript: string | null;
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
  summary: string | null;
  key_takeaways: string | null;
  unresolved: string | null;
  material_needs: string | null;
  deadline: string | null;
  transcript: string | null;
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
         calls.call_type, calls.summary, calls.key_takeaways, calls.unresolved, calls.material_needs,
         calls.deadline,
         transcripts.transcript AS transcript,
         COALESCE(clients.name, 'Unknown caller') AS client_name,
         clients.phone AS client_phone
  FROM calls
  LEFT JOIN clients ON calls.client_id = clients.id
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

const SITE_SELECT = `
  SELECT call_sites.call_id AS call_id, sites.name AS name
  FROM call_sites
  JOIN sites ON sites.id = call_sites.site_id
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
  };
}

function toCallRow(
  c: RawCallJoinRow,
  todos: TodoRow[],
  customerWaiting: 0 | 1,
  sites: string[],
  commitments: CommitmentRow[]
): CallRow {
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
    sites,
    deadline: c.deadline,
    summary: c.summary,
    key_takeaways: parseJsonArray(c.key_takeaways),
    commitments,
    unresolved: parseUnresolvedArray(c.unresolved),
    material_needs: parseJsonArray(c.material_needs),
    transcript: c.transcript,
    todos,
  };
}

/**
 * `customer_waiting` lives per-todo in the schema (§4) but the dashboard
 * treats it as a call-level flag (the "customer waiting" badge, and the
 * sort rule). Reconciled here: a call is waiting if any of its still-open
 * todos are marked customer_waiting.
 *
 * `low_signal` calls are excluded — see docs/ADDITIONAL_FEATURES_M0.md
 * "call_type = low_signal": they get no dashboard card by design. Rows from
 * before this column existed (call_type IS NULL) still show, since NULL
 * means "not classified yet," not "known to be low signal."
 */
export async function listCallsWithTodos(db: D1Database): Promise<CallRow[]> {
  const { results: calls } = await db
    .prepare(`${CALL_SELECT} WHERE calls.call_type IS NULL OR calls.call_type != 'low_signal' ORDER BY calls.recorded_at DESC`)
    .all<RawCallJoinRow>();
  if (calls.length === 0) return [];

  const placeholders = calls.map(() => "?").join(",");
  const callIds = calls.map((c) => c.id);
  const [{ results: todos }, { results: commitments }, { results: siteRows }] = await Promise.all([
    db.prepare(`${TODO_SELECT} WHERE call_id IN (${placeholders}) ORDER BY created_at ASC`).bind(...callIds).all<RawTodoRow>(),
    db.prepare(`${COMMITMENT_SELECT} WHERE call_id IN (${placeholders}) ORDER BY created_at ASC`).bind(...callIds).all<RawCommitmentRow>(),
    db.prepare(`${SITE_SELECT} WHERE call_sites.call_id IN (${placeholders})`).bind(...callIds).all<RawSiteRow>(),
  ]);

  const todosByCall = new Map<string, TodoRow[]>();
  const waitingByCall = new Map<string, boolean>();
  for (const t of todos) {
    const list = todosByCall.get(t.call_id) ?? [];
    list.push(toTodoRow(t));
    todosByCall.set(t.call_id, list);
    if (t.status !== "done" && t.customer_waiting) waitingByCall.set(t.call_id, true);
  }

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

export async function getCallWithTodos(db: D1Database, id: string): Promise<CallRow | null> {
  const c = await db.prepare(`${CALL_SELECT} WHERE calls.id = ?`).bind(id).first<RawCallJoinRow>();
  if (!c) return null;

  const [{ results: rawTodos }, { results: rawCommitments }, { results: rawSites }] = await Promise.all([
    db.prepare(`${TODO_SELECT} WHERE call_id = ? ORDER BY created_at ASC`).bind(id).all<RawTodoRow>(),
    db.prepare(`${COMMITMENT_SELECT} WHERE call_id = ? ORDER BY created_at ASC`).bind(id).all<RawCommitmentRow>(),
    db.prepare(`${SITE_SELECT} WHERE call_sites.call_id = ?`).bind(id).all<RawSiteRow>(),
  ]);

  let customerWaiting: 0 | 1 = 0;
  const todos = rawTodos.map((t) => {
    if (t.status !== "done" && t.customer_waiting) customerWaiting = 1;
    return toTodoRow(t);
  });
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

const TODO_PATCH_FIELDS = ["status", "completed_at", "snoozed_until"] as const;
type TodoPatchField = (typeof TODO_PATCH_FIELDS)[number];

/** Task 7 — the only fields the dashboard's optimistic update ever sends. */
export async function updateTodo(
  db: D1Database,
  id: string,
  patch: Partial<Record<TodoPatchField, string | null>>
): Promise<Todo | null> {
  const fields = TODO_PATCH_FIELDS.filter((f) => f in patch);
  if (fields.length === 0) return getTodoById(db, id);

  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => patch[f] ?? null);
  await db
    .prepare(`UPDATE todos SET ${setClause} WHERE id = ?`)
    .bind(...values, id)
    .run();
  return getTodoById(db, id);
}

// ---------------------------------------------------------------------------
// Sites, escalations — docs/ADDITIONAL_FEATURES_M0.md "Phase 1 home page".
// ---------------------------------------------------------------------------

export async function listSites(db: D1Database): Promise<Array<{ id: string; name: string }>> {
  const { results } = await db.prepare(`SELECT id, name FROM sites ORDER BY name ASC`).all<{ id: string; name: string }>();
  return results;
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
       JOIN calls ON calls.id = call_sites.call_id`
    )
    .all<{ site_id: string; site_name: string; call_id: string; recorded_at: string | null; unresolved: string | null }>();
  if (siteCalls.length === 0) return [];

  const callIds = [...new Set(siteCalls.map((r) => r.call_id))];
  const placeholders = callIds.map(() => "?").join(",");
  const { results: openTodos } = await db
    .prepare(`SELECT call_id, due_date FROM todos WHERE status = 'open' AND call_id IN (${placeholders})`)
    .bind(...callIds)
    .all<{ call_id: string; due_date: string | null }>();

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

export interface EscalationRow {
  id: string;
  text: string;
  site_id: string | null;
  site_name: string | null;
  status: EscalationStatus;
  created_at: string;
  closed_at: string | null;
}

export async function listOpenEscalations(db: D1Database): Promise<EscalationRow[]> {
  const { results } = await db
    .prepare(
      `SELECT escalations.id, escalations.text, escalations.site_id, sites.name AS site_name,
              escalations.status, escalations.created_at, escalations.closed_at
       FROM escalations
       LEFT JOIN sites ON sites.id = escalations.site_id
       WHERE escalations.status = 'open'
       ORDER BY escalations.created_at ASC`
    )
    .all<EscalationRow>();
  return results;
}

export interface NewEscalationInput {
  text: string;
  siteId?: string | null;
}

/** Manual only — see schema.sql comment on `escalations`. Never called from the extraction path. */
export async function createEscalation(db: D1Database, input: NewEscalationInput): Promise<Escalation> {
  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO escalations (id, text, site_id) VALUES (?, ?, ?)`)
    .bind(id, input.text, input.siteId ?? null)
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

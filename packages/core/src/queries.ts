// All D1 access lives here — see docs/SCAFFOLDING.md §1 ("no SQL outside queries.ts").

import type { Call, CallExtraction, CallSource, Todo, TodoOwner } from "./types";

export interface NewCallInput {
  id: string;
  r2Key: string;
  source: CallSource;
  recordedAt: string | null;
  durationS: number | null;
}

export async function insertCall(db: D1Database, input: NewCallInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO calls (id, r2_key, source, recorded_at, duration_s, stt_status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    )
    .bind(input.id, input.r2Key, input.source, input.recordedAt, input.durationS)
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

/** Task 5 — extraction landed. Writes the six fields, prompt_version, and the todos rows. */
export async function saveExtraction(
  db: D1Database,
  callId: string,
  extraction: CallExtraction,
  promptVersion: string
): Promise<void> {
  const statements = [
    db
      .prepare(
        `UPDATE calls
         SET stt_status = 'extracted', summary = ?, key_takeaways = ?, unresolved = ?,
             deadline = ?, prompt_version = ?
         WHERE id = ?`
      )
      .bind(
        extraction.summary,
        JSON.stringify(extraction.key_takeaways),
        JSON.stringify(extraction.unresolved),
        extraction.deadline || null,
        promptVersion,
        callId
      ),
  ];

  const insertTodo = (owner: TodoOwner, text: string, dueDate: string | undefined) =>
    db
      .prepare(
        `INSERT INTO todos (id, call_id, owner, text, due_date, origin) VALUES (?, ?, ?, ?, ?, 'llm')`
      )
      .bind(crypto.randomUUID(), callId, owner, text, dueDate || null);

  for (const todo of extraction.todos_self) statements.push(insertTodo("self", todo.text, todo.due_date));
  for (const todo of extraction.todos_customer) statements.push(insertTodo("customer", todo.text, todo.due_date));

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

export interface CallRow {
  id: string;
  client_name: string;
  client_phone: string | null;
  recorded_at: string | null;
  duration_s: number | null;
  source: CallSource;
  customer_waiting: 0 | 1;
  deadline: string | null;
  summary: string | null;
  key_takeaways: string[];
  unresolved: string[];
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

interface RawCallJoinRow {
  id: string;
  duration_s: number | null;
  recorded_at: string | null;
  source: CallSource;
  summary: string | null;
  key_takeaways: string | null;
  unresolved: string | null;
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

const CALL_SELECT = `
  SELECT calls.id, calls.duration_s, calls.recorded_at, calls.source,
         calls.summary, calls.key_takeaways, calls.unresolved, calls.deadline,
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

function toCallRow(c: RawCallJoinRow, todos: TodoRow[], customerWaiting: 0 | 1): CallRow {
  return {
    id: c.id,
    client_name: c.client_name,
    client_phone: c.client_phone,
    recorded_at: c.recorded_at,
    duration_s: c.duration_s,
    source: c.source,
    customer_waiting: customerWaiting,
    deadline: c.deadline,
    summary: c.summary,
    key_takeaways: parseJsonArray(c.key_takeaways),
    unresolved: parseJsonArray(c.unresolved),
    transcript: c.transcript,
    todos,
  };
}

/**
 * `customer_waiting` lives per-todo in the schema (§4) but the dashboard
 * treats it as a call-level flag (the "customer waiting" badge, and the
 * sort rule). Reconciled here: a call is waiting if any of its still-open
 * todos are marked customer_waiting.
 */
export async function listCallsWithTodos(db: D1Database): Promise<CallRow[]> {
  const { results: calls } = await db
    .prepare(`${CALL_SELECT} ORDER BY calls.recorded_at DESC`)
    .all<RawCallJoinRow>();
  if (calls.length === 0) return [];

  const placeholders = calls.map(() => "?").join(",");
  const { results: todos } = await db
    .prepare(`${TODO_SELECT} WHERE call_id IN (${placeholders}) ORDER BY created_at ASC`)
    .bind(...calls.map((c) => c.id))
    .all<RawTodoRow>();

  const todosByCall = new Map<string, TodoRow[]>();
  const waitingByCall = new Map<string, boolean>();
  for (const t of todos) {
    const list = todosByCall.get(t.call_id) ?? [];
    list.push(toTodoRow(t));
    todosByCall.set(t.call_id, list);
    if (t.status !== "done" && t.customer_waiting) waitingByCall.set(t.call_id, true);
  }

  return calls.map((c) => toCallRow(c, todosByCall.get(c.id) ?? [], waitingByCall.get(c.id) ? 1 : 0));
}

export async function getCallWithTodos(db: D1Database, id: string): Promise<CallRow | null> {
  const c = await db.prepare(`${CALL_SELECT} WHERE calls.id = ?`).bind(id).first<RawCallJoinRow>();
  if (!c) return null;

  const { results: rawTodos } = await db
    .prepare(`${TODO_SELECT} WHERE call_id = ? ORDER BY created_at ASC`)
    .bind(id)
    .all<RawTodoRow>();

  let customerWaiting: 0 | 1 = 0;
  const todos = rawTodos.map((t) => {
    if (t.status !== "done" && t.customer_waiting) customerWaiting = 1;
    return toTodoRow(t);
  });

  return toCallRow(c, todos, customerWaiting);
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

// All D1 access lives here — see docs/SCAFFOLDING.md §1 ("no SQL outside queries.ts").

import type {
  Call,
  CallExtraction,
  CallSource,
  CallType,
  Escalation,
  EscalationStatus,
  SiteMedia,
  SiteMediaType,
  Todo,
  TodoOwner,
  User,
  UserRole,
} from "./types";

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
}

export async function insertCall(db: D1Database, input: NewCallInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO calls (id, r2_key, source, recorded_at, recording_date, duration_s, stt_status, recorded_for_site_id, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .bind(
      input.id,
      input.r2Key,
      input.source,
      input.recordedAt,
      input.recordingDate,
      input.durationS,
      input.recordedForSiteId ?? null,
      input.uploadedByUserId ?? null
    )
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
    db.prepare(`${SITE_SELECT} AND call_sites.call_id IN (${placeholders})`).bind(...callIds).all<RawSiteRow>(),
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
    db.prepare(`${SITE_SELECT} AND call_sites.call_id = ?`).bind(id).all<RawSiteRow>(),
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

export interface SiteRow {
  id: string;
  name: string;
  is_confirmed: "Y" | "N" | null;
  address: string | null;
  poc_name: string | null;
}

const SITE_ROW_SELECT = `SELECT id, name, is_confirmed, address, poc_name FROM sites`;

/** All sites regardless of confirmation state — the review screen needs to see everything. */
/**
 * `forUserId` restricts to sites that user is on the team roster for — used
 * for a `staff` session (see migration 0011); omitted for admin/superadmin,
 * who see everything, same as before roles existed.
 */
export async function listSites(db: D1Database, forUserId?: string | null): Promise<SiteRow[]> {
  const scoped = forUserId ? `AND id IN (SELECT site_id FROM site_team_members WHERE user_id = ?)` : "";
  const stmt = db.prepare(`${SITE_ROW_SELECT} WHERE 1=1 ${scoped} ORDER BY (is_confirmed IS NOT NULL), name ASC`);
  const { results } = await (forUserId ? stmt.bind(forUserId) : stmt).all<SiteRow>();
  return results;
}

const SITE_PATCH_FIELDS = ["is_confirmed", "address", "poc_name"] as const;
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

    const detailFields = fields.filter((f) => f === "address" || f === "poc_name");
    if (detailFields.length > 0) {
      const labels = detailFields.map((f) => (f === "poc_name" ? "point of contact" : f)).join(", ");
      statements.push(
        db
          .prepare(`INSERT INTO site_edits (id, site_id, actor_user_id, summary) VALUES (?, ?, ?, ?)`)
          .bind(crypto.randomUUID(), id, actorUserId ?? null, `${labels[0].toUpperCase()}${labels.slice(1)} updated`)
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
export async function createSite(
  db: D1Database,
  name: string,
  address: string | null,
  pocName: string | null,
  actorUserId?: string | null
): Promise<SiteRow> {
  const trimmed = name.trim();
  const existing = await db.prepare(`${SITE_ROW_SELECT} WHERE name = ?`).bind(trimmed).first<SiteRow>();
  if (existing) {
    const updated = await updateSite(db, existing.id, { is_confirmed: "Y", address, poc_name: pocName }, actorUserId ?? null);
    return updated ?? existing;
  }

  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(`INSERT INTO sites (id, name, is_confirmed, address, poc_name) VALUES (?, ?, 'Y', ?, ?)`)
      .bind(id, trimmed, address, pocName),
    db
      .prepare(`INSERT INTO site_edits (id, site_id, actor_user_id, summary) VALUES (?, ?, ?, 'Site added')`)
      .bind(crypto.randomUUID(), id, actorUserId ?? null),
  ]);
  const row = await db.prepare(`${SITE_ROW_SELECT} WHERE id = ?`).bind(id).first<SiteRow>();
  return row!;
}

export interface SiteTeamMemberRow {
  id: string;
  name: string;
  contact_number: string;
  user_id: string | null;
}

export async function listSiteTeamMembers(db: D1Database, siteId: string): Promise<SiteTeamMemberRow[]> {
  const { results } = await db
    .prepare(`SELECT id, name, contact_number, user_id FROM site_team_members WHERE site_id = ? ORDER BY created_at ASC`)
    .bind(siteId)
    .all<SiteTeamMemberRow>();
  return results;
}

/** True if `userId` is on `siteId`'s team roster — backs assertSiteMembership in src/lib/auth.ts. */
export async function isUserAssignedToSite(db: D1Database, userId: string, siteId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM site_team_members WHERE site_id = ? AND user_id = ? LIMIT 1`)
    .bind(siteId, userId)
    .first();
  return row !== null;
}

/** True if `callId` is linked (call_sites) to any site `userId` is on the team roster for — lets a `staff` session open a call's transcript from their site's timeline. */
export async function isCallAccessibleToUser(db: D1Database, userId: string, callId: string): Promise<boolean> {
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

export interface ConfirmedSiteRow {
  id: string;
  name: string;
  open_count: number;
}

/**
 * Every confirmed (is_confirmed = 'Y') site with its current open-item
 * count — the directory reached from the sites tile's "N confirmed sites"
 * rollup, distinct from getSitesNeedingAttention: this lists ALL confirmed
 * sites regardless of whether anything's overdue or blocked, sites with
 * zero calls included. Alphabetical — it's a reference list, not a triage
 * queue.
 */
/** `forUserId` — see listSites above; same staff-vs-admin scoping. */
export async function getConfirmedSitesSummary(db: D1Database, forUserId?: string | null): Promise<ConfirmedSiteRow[]> {
  const scoped = forUserId
    ? `AND sites.id IN (SELECT site_id FROM site_team_members WHERE user_id = ?)`
    : "";
  const stmt = db.prepare(
    `SELECT sites.id AS id, sites.name AS name,
            COALESCE(SUM(CASE WHEN todos.status = 'open' THEN 1 ELSE 0 END), 0) AS open_count
     FROM sites
     LEFT JOIN call_sites ON call_sites.site_id = sites.id
     LEFT JOIN todos ON todos.call_id = call_sites.call_id
     WHERE sites.is_confirmed = 'Y' ${scoped}
     GROUP BY sites.id, sites.name
     ORDER BY sites.name ASC`
  );
  const { results } = await (forUserId ? stmt.bind(forUserId) : stmt).all<ConfirmedSiteRow>();
  return results;
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
  last_seen_at: string;
}

/** Joins sessions+users and filters revoked/expired — a row back means "valid session." */
export async function getSessionWithUser(db: D1Database, tokenHash: string): Promise<SessionWithUser | null> {
  const row = await db
    .prepare(
      `SELECT users.id AS user_id, users.name AS user_name, users.role AS user_role, sessions.last_seen_at AS last_seen_at
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
}

export async function addSiteMedia(db: D1Database, input: NewSiteMediaInput): Promise<SiteMedia> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO site_media (id, site_id, media_type, r2_key, content_type, file_size, caption, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.siteId, input.mediaType, input.r2Key, input.contentType, input.fileSize, input.caption, input.uploadedBy)
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

export async function getSiteTimeline(db: D1Database, siteId: string): Promise<SiteTimelineEntry[]> {
  const [{ results: callRows }, { results: mediaRows }, { results: teamRows }, { results: editRows }] =
    await Promise.all([
      db
        .prepare(
          `SELECT calls.id AS id, calls.recorded_at AS created_at, calls.summary AS summary,
                  calls.call_type AS call_type, calls.recorded_for_site_id AS recorded_for_site_id,
                  users.name AS actor_name
           FROM call_sites
           JOIN calls ON calls.id = call_sites.call_id
           LEFT JOIN users ON users.id = calls.uploaded_by_user_id
           WHERE call_sites.site_id = ?`
        )
        .bind(siteId)
        .all<{
          id: string;
          created_at: string | null;
          summary: string | null;
          call_type: CallType | null;
          recorded_for_site_id: string | null;
          actor_name: string | null;
        }>(),
      db
        .prepare(
          `SELECT site_media.id AS id, site_media.created_at AS created_at, site_media.media_type AS media_type,
                  site_media.r2_key AS r2_key, site_media.content_type AS content_type, site_media.caption AS caption,
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

  for (const c of callRows) {
    const isVoiceMemo = c.recorded_for_site_id === siteId;
    entries.push({
      type: "call",
      id: c.id,
      created_at: c.created_at ?? "",
      actor_name: c.actor_name,
      summary: c.summary ?? (isVoiceMemo ? "Voice note — transcribing…" : "Call recorded"),
      ref: { call_id: c.id, is_voice_memo: isVoiceMemo },
    });
  }

  for (const m of mediaRows) {
    entries.push({
      type: "media",
      id: m.id,
      created_at: m.created_at,
      actor_name: m.actor_name,
      summary: m.caption ?? (m.media_type === "photo" ? "Photo added" : "Video added"),
      ref: { media_id: m.id, media_type: m.media_type, content_type: m.content_type },
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

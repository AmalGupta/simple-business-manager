import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Circle,
  Check,
  CircleDashed,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Clock,
  Download,
  Phone,
  Image,
  Video,
  Mic,
  Square,
  User,
  Users,
  Plus,
} from "lucide-react";
import { t } from "./theme.js";
import {
  today,
  dayKey,
  isoDate,
  daysUntil,
  fmtDate,
  fmtShort,
  fmtLong,
  isUrgent,
  isTaskDueDateUrgent,
} from "./lib/dates.js";
import { WORKFLOW_CATEGORIES, WORKFLOW_CATEGORY_LABEL, sortCalls } from "./lib/constants.js";
import { CSV_COLUMNS, csvCell, buildReportRows, downloadReport } from "./lib/csv.js";

/* Same-origin API, gated by the X-SBM-Key shared secret — see
   docs/BUILD_BRIEF.md "No Cloudflare Access on this worker". Baked in at
   build time (web/.env, gitignored) since this is a static SPA with no
   login step. */
const SBM_KEY = import.meta.env.VITE_SBM_API_KEY ?? "";

/* ------------------------------------------------------------------
   API.
   ------------------------------------------------------------------ */
async function fetchJSON(path) {
  const res = await fetch(path, { headers: { "X-SBM-Key": SBM_KEY } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function fetchCalls() {
  return fetchJSON("/api/calls");
}

/* Single-call fetch, on demand — the bulk fetchCalls() list is never loaded
   for a `staff` session (no office dashboard for them), so opening a call
   from their site's timeline needs its own fetch. Same endpoint the admin
   dashboard would resolve from its already-loaded list. */
async function fetchCall(id) {
  return fetchJSON(`/api/calls/${id}`);
}

async function fetchEscalations() {
  return fetchJSON("/api/escalations");
}

async function fetchSitesAttention() {
  return fetchJSON("/api/sites/attention");
}

async function fetchSites() {
  return fetchJSON("/api/sites");
}

async function fetchConfirmedSites() {
  return fetchJSON("/api/sites/confirmed");
}

async function postCreateSite(name, address, pocName) {
  const res = await fetch("/api/sites", {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ name, address: address || null, poc_name: pocName || null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/sites → ${res.status}`);
  }
  return res.json();
}

async function patchSite(id, patch) {
  const res = await fetch(`/api/sites/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH /api/sites/${id} → ${res.status}`);
  return res.json();
}

async function fetchSiteTeam(siteId) {
  return fetchJSON(`/api/sites/${siteId}/team`);
}

/* `userId` set = the "choose from dropdown" path (name/phone come from the
   account server-side); omitted = legacy free-text entry. */
async function postSiteTeamMember(siteId, userId) {
  const res = await fetch(`/api/sites/${siteId}/team`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/sites/${siteId}/team → ${res.status}`);
  }
  return res.json();
}

/* Backfill — scans calls that already have a transcript but predate the
   automatic per-call site scan. Manual only; see src/handlers/api.ts. */
async function postSitesBackfill() {
  const res = await fetch("/api/sites/backfill", {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`POST /api/sites/backfill → ${res.status}`);
  return res.json();
}

async function postEscalation(text, siteId) {
  const res = await fetch("/api/escalations", {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ text, site_id: siteId || null }),
  });
  if (!res.ok) throw new Error(`POST /api/escalations → ${res.status}`);
  return res.json();
}

async function closeEscalationApi(id) {
  const res = await fetch(`/api/escalations/${id}`, {
    method: "PATCH",
    headers: { "X-SBM-Key": SBM_KEY },
  });
  if (!res.ok) throw new Error(`PATCH /api/escalations/${id} → ${res.status}`);
  return res.json();
}

async function patchTodo(id, patch) {
  try {
    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`PATCH /api/todos/${id} → ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[sbm] todo update failed", err);
    throw err;
  }
}

/* Session-cookie auth (login gate + site media/timeline) — additive to the
   X-SBM-Key mechanism above, not a replacement. See src/lib/auth.ts. */
async function fetchMe() {
  const res = await fetch("/api/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/me → ${res.status}`);
  return res.json();
}

async function postLogin(name, pin) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, pin }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/login → ${res.status}`);
  }
  return res.json();
}

async function postLogout() {
  await fetch("/api/logout", { method: "POST" });
}

async function postResetPin(currentPin, newPin) {
  const res = await fetch("/api/me/pin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/me/pin → ${res.status}`);
  }
  return res.json();
}

/* Self-service phone update — any role, no current-value confirmation (a
   phone number isn't a credential). Writes straight to users.phone, which
   the assign-team roster and a site's Team card both read live, so nothing
   else needs to know this happened. */
async function postUpdateMyPhone(phone) {
  const res = await fetch("/api/me/phone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/me/phone → ${res.status}`);
  }
  return res.json();
}

/* Staff management (migration 0011) — session-cookie only, admin/superadmin
   gated server-side, no X-SBM-Key involved (same pattern as /api/me/pin). */
async function fetchStaff() {
  const res = await fetch("/api/staff");
  if (!res.ok) throw new Error(`GET /api/staff → ${res.status}`);
  return res.json();
}

/* Lean roster (id/name/phone, staff role only, no PIN decryption) — the
   "assign team member" dropdown's data source. Deliberately not fetchStaff()
   above: that endpoint decrypts every row's PIN and includes the viewer's
   own row, neither of which the dropdown wants, and the decryption was
   making it slow to open for no reason. */
async function fetchStaffRoster() {
  const res = await fetch("/api/staff/roster");
  if (!res.ok) throw new Error(`GET /api/staff/roster → ${res.status}`);
  return res.json();
}

async function postCreateStaff(name, phone) {
  const res = await fetch("/api/staff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, phone: phone || null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/staff → ${res.status}`);
  }
  return res.json();
}

async function patchStaffPhone(id, phone) {
  const res = await fetch(`/api/staff/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: phone || null }),
  });
  if (!res.ok) throw new Error(`PATCH /api/staff/${id} → ${res.status}`);
  return res.json();
}

async function postResetStaffPin(id) {
  const res = await fetch(`/api/staff/${id}/reset-pin`, { method: "POST" });
  if (!res.ok) throw new Error(`POST /api/staff/${id}/reset-pin → ${res.status}`);
  return res.json();
}

async function fetchSiteMedia(siteId) {
  const res = await fetch(`/api/sites/${siteId}/media`);
  if (!res.ok) throw new Error(`GET /api/sites/${siteId}/media → ${res.status}`);
  return res.json();
}

async function postSiteMedia(siteId, file, caption) {
  const fd = new FormData();
  fd.append("file", file);
  if (caption) fd.append("caption", caption);
  const res = await fetch(`/api/sites/${siteId}/media`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`POST /api/sites/${siteId}/media → ${res.status}`);
  return res.json();
}

async function postSiteVoiceNote(siteId, blob, fileName) {
  const fd = new FormData();
  fd.append("recording", blob, fileName);
  const res = await fetch(`/api/sites/${siteId}/voice-note`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`POST /api/sites/${siteId}/voice-note → ${res.status}`);
  return res.json();
}

async function fetchSiteTimeline(siteId) {
  const res = await fetch(`/api/sites/${siteId}/timeline`);
  if (!res.ok) throw new Error(`GET /api/sites/${siteId}/timeline → ${res.status}`);
  return res.json();
}

/* Site-task workflow system — migration 0013. See WORKFLOW_CATEGORIES below
   for the tile grouping; these fetchers back the home-page workflow tiles,
   the admin "View work timeline" popup, and the staff mark-done/handoff flow. */

/** Home-page "Calls logged" tile — total count, including low_signal. */
async function fetchCallsCount() {
  return fetchJSON("/api/calls/count");
}

/** Open (assigned, not done) site tasks — `staff` gets their own only, admin/superadmin get every one, scoped server-side. */
async function fetchOpenSiteTasks() {
  return fetchJSON("/api/site-tasks/open");
}

/** All 23 stages for one site — the admin "View work timeline" popup. */
async function fetchSiteTasks(siteId) {
  return fetchJSON(`/api/sites/${siteId}/tasks`);
}

/** Every still-unassigned stage at one site — the handoff picker shown after marking a stage done. */
async function fetchUnassignedSiteTasks(siteId) {
  return fetchJSON(`/api/sites/${siteId}/tasks/unassigned`);
}

async function patchSiteTask(id, patch) {
  const res = await fetch(`/api/site-tasks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/site-tasks/${id} → ${res.status}`);
  }
  return res.json();
}

function DownloadButton({ calls, label, children }) {
  const empty = calls.length === 0;
  return (
    <button
      onClick={() => downloadReport(calls, label)}
      disabled={empty}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 13,
        padding: "6px 12px",
        border: `1px solid ${t.frost}`,
        borderRadius: t.radiusButton,
        background: t.white,
        color: empty ? t.edge2 : t.edge,
        cursor: empty ? "not-allowed" : "pointer",
        opacity: empty ? 0.5 : 1,
      }}
    >
      <Download size={15} />
      {children}
    </button>
  );
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function iconButtonStyle(disabled) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    flexShrink: 0,
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: t.radiusButton,
    background: "rgba(255,255,255,0.07)",
    color: disabled ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)",
    cursor: disabled ? "default" : "pointer",
    padding: 0,
  };
}

const selectStyle = {
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 10px",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: t.radiusButton,
  background: "rgba(255,255,255,0.07)",
  color: t.white,
};

/* ------------------------------------------------------------------
   Calendar — the signature element, now the entry point to a day.
   Shows a full month at a time (not a rolling 28-day window), with
   controls to jump to any month/year. A held day is a clear pane; a
   missed day is etched. Days after today in the displayed month have
   no data yet and render as empty, unclickable cells.
   ------------------------------------------------------------------ */
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/* Horizontal, scrollable — one row for the whole month, day-of-week
   stacked above the date so a column no longer has to line up visually.
   Each day carries a hover/focus tooltip with the date and call count. */
function StreakWall({ days, onSelectDay, selected, year, month, onChangeYear, onChangeMonth, onPrevMonth, onNextMonth, yearOptions, todayIso }) {
  const todayRef = useRef(null);

  /* Auto-scroll today into view — a horizontal bar that opens scrolled to
     day 1 with today off-screen defeats "the focus date should be today." */
  useEffect(() => {
    todayRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [year, month, days]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <button aria-label="Previous month" onClick={onPrevMonth} style={iconButtonStyle(false)}>
          <ChevronLeft size={16} />
        </button>

        <div style={{ display: "flex", gap: 6 }}>
          <select
            aria-label="Month"
            value={month}
            onChange={(e) => onChangeMonth(Number(e.target.value))}
            style={selectStyle}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            value={year}
            onChange={(e) => onChangeYear(Number(e.target.value))}
            style={selectStyle}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button aria-label="Next month" onClick={onNextMonth} style={iconButtonStyle(false)}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div
        role="group"
        aria-label="Daily record. Select a day to see its calls."
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingTop: 26,
          paddingBottom: 4,
        }}
      >
        {days.map((d, i) => {
          const dayNum = Number(d.date.slice(8, 10));
          const dow = new Date(year, month, dayNum).getDay();

          if (d.future) {
            return (
              <span
                key={d.date}
                aria-hidden="true"
                style={{
                  flex: "0 0 40px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  minHeight: 52,
                  color: "rgba(255,255,255,0.25)",
                }}
              >
                <span style={{ fontSize: 10 }}>{WEEKDAY_LABELS[dow]}</span>
                <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{dayNum}</span>
              </span>
            );
          }

          const isToday = d.date === todayIso;

          return (
            <button
              key={d.date}
              ref={isToday ? todayRef : undefined}
              className="sbm-pane sbm-day sbm-tip"
              onClick={() => onSelectDay(d.date)}
              aria-label={`${fmtLong(d.date)}${isToday ? ", today" : ""}, ${d.held ? "held" : "missed"}, ${d.calls} calls`}
              aria-current={isToday ? "date" : undefined}
              style={{
                animationDelay: `${Math.min(i, 27) * 12}ms`,
                position: "relative",
                flex: "0 0 40px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                minHeight: 52,
                padding: 0,
                borderRadius: t.radius,
                cursor: "pointer",
                fontVariantNumeric: "tabular-nums",
                fontWeight: isToday ? 700 : 400,
                color: isToday ? t.edge : d.held ? "rgba(255,255,255,0.85)" : t.white,
                border: `1px solid ${d.date === selected ? t.white : isToday ? t.white : "rgba(255,255,255,0.15)"}`,
                background: isToday ? t.white : d.held ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.16)",
              }}
            >
              <span style={{ fontSize: 10, color: isToday ? t.edge2 : "rgba(255,255,255,0.5)" }}>
                {WEEKDAY_LABELS[dow]}
              </span>
              <span style={{ fontSize: 14 }}>{dayNum}</span>
              {d.calls > 0 && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 4,
                    width: 4,
                    height: 4,
                    marginLeft: -2,
                    borderRadius: "50%",
                    background: isToday ? t.edge2 : "rgba(255,255,255,0.85)",
                  }}
                />
              )}
              <span className="sbm-tooltip" role="tooltip">
                {fmtShort(d.date)} · {d.calls} {d.calls === 1 ? "call" : "calls"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sentence-format rendering of a structured todo — same {owner, text,
   due_date} the extraction pipeline already produces via forced tool-use
   (TodoRow below renders it as a checklist row); this just phrases it as a
   sentence for the admin Recordings review panel. No change to extraction
   itself — see docs/SCAFFOLDING.md §6. */
function formatTodoSentence(todo) {
  const owner = todo.owner === "self" ? "He" : todo.owner;
  const due = todo.due_date ? fmtShort(todo.due_date) : "date not mentioned";
  return `${owner} is assigned ${todo.text}, to be done by ${due}`;
}

function TodoRow({ todo, onToggle, onPark, busy, readOnly = false }) {
  const done = todo.status === "done";
  const parked = todo.status === "snoozed";
  const urgent = isUrgent(todo);
  const Icon = done ? Check : parked ? Clock : Circle;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        margin: "0 -10px",
        borderTop: `1px solid ${t.frost}`,
        background: done ? t.frost : "transparent",
        opacity: busy ? 0.5 : 1,
        transition: "background 400ms ease, opacity 150ms ease",
      }}
    >
      <button
        onClick={readOnly ? undefined : () => onToggle(todo)}
        disabled={busy || readOnly}
        aria-pressed={done}
        aria-label={done ? `Reopen: ${todo.text}` : `Mark done: ${todo.text}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          margin: "-11px 0 -11px -11px",
          flexShrink: 0,
          padding: 0,
          border: "none",
          background: "none",
          cursor: busy ? "wait" : "pointer",
          color: done ? t.edge2 : parked ? t.putty : t.edge2,
        }}
      >
        <Icon size={17} strokeWidth={done ? 2.5 : 1.75} />
      </button>

      <span
        style={{
          flex: 1,
          fontSize: 14,
          lineHeight: 1.5,
          color: done || parked ? t.edge2 : t.edge,
          textDecoration: done ? "line-through" : "none",
        }}
      >
        {todo.text}
      </span>

      <span
        style={{
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: t.radius,
          background: t.frostSoft,
          color: t.edge2,
          whiteSpace: "nowrap",
        }}
      >
        {todo.owner === "self" ? "him" : todo.owner}
      </span>

      {!done && todo.due_date && (
        <span
          style={{
            fontSize: 12,
            padding: "3px 9px",
            borderRadius: t.radius,
            whiteSpace: "nowrap",
            color: urgent ? t.white : t.edge2,
            background: urgent ? t.signal : t.frost,
          }}
        >
          {fmtShort(todo.due_date)}
        </span>
      )}

      {!done && !readOnly && (
        <button
          onClick={() => onPark(todo)}
          disabled={busy}
          aria-label={parked ? `Unpark: ${todo.text}` : `Park: ${todo.text}`}
          style={{
            fontSize: 12,
            padding: "13px 10px",
            margin: "-13px -10px",
            border: `1px solid ${parked ? t.putty : "transparent"}`,
            borderRadius: t.radius,
            background: "none",
            cursor: busy ? "wait" : "pointer",
            color: parked ? t.putty : t.edge2,
            whiteSpace: "nowrap",
          }}
        >
          {parked ? "parked" : "park"}
        </button>
      )}
    </div>
  );
}

function WaitingTag() {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        padding: "4px 10px",
        borderRadius: t.radius,
        background: t.puttyBg,
        color: t.putty,
        whiteSpace: "nowrap",
      }}
    >
      customer waiting
    </span>
  );
}

/* Flat white surface, hairline border, one shared radius — every Card
   usage renders the same skin now (see docs/DESIGN_LANGUAGE.md "Surface").
   `tile` no longer changes the skin; it only fixes the card to
   --tile-height and lays it out as a column flexbox, so the home-grid
   tiles stay symmetrical regardless of content — a tile with a
   variable-length list (SitesAttentionTile, EscalationsTile) scrolls
   internally rather than growing taller than its neighbours. See those
   components for the `flex: 1; overflowY: auto` content wrapper that
   makes that scrolling work. */
function Card({ children, style, className, tile = false }) {
  return (
    <div
      className={className}
      style={{
        background: t.white,
        border: `1px solid ${t.frost}`,
        borderRadius: t.radiusCard,
        padding: "1rem 1.25rem",
        ...(tile ? { height: "var(--tile-height)", display: "flex", flexDirection: "column" } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function BackLink({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 0,
        marginBottom: "1rem",
        border: "none",
        background: "none",
        cursor: "pointer",
        color: t.edge2,
        fontSize: 13,
      }}
    >
      <ChevronLeft size={16} /> {children}
    </button>
  );
}

function PhoneLink({ phone }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone.replace(/\s/g, "")}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        fontWeight: 700,
        padding: "7px 12px",
        borderRadius: t.radiusButton,
        background: t.accent,
        color: t.white,
        textDecoration: "none",
      }}
    >
      <Phone size={14} />
      Call {phone}
    </a>
  );
}

/* Site chips for internal calls, client name for client calls — the
   organising unit in speech is the site, not the client, for the 9-of-11
   internal-ops majority. Falls back to client_name for legacy rows
   recorded before call_type existed. See docs/ADDITIONAL_FEATURES_M0.md. */
function CallHeading({ call }) {
  const showSites = call.call_type === "internal" && call.sites?.length > 0;
  if (!showSites) {
    return (
      <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
        {call.client_name}
      </span>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {call.sites.map((site) => (
        <span
          key={site}
          style={{
            fontFamily: t.display,
            fontSize: 14,
            fontWeight: 500,
            padding: "3px 9px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radius,
            color: t.edge,
          }}
        >
          {site}
        </span>
      ))}
    </div>
  );
}

function CommitmentsList({ commitments }) {
  if (!commitments || commitments.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {commitments.map((c) => (
        <div key={c.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
          <span style={{ color: t.edge2, fontStyle: "italic" }}>{c.raw_phrase}</span>
          {c.resolved_datetime && (
            <>
              <span style={{ color: t.edge2 }}>→</span>
              <span style={{ color: t.edge }}>{fmtShort(c.resolved_datetime)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "Important" = call_type client/internal (already got a card on the old
   home feed); "Regular" = low_signal (never surfaced anywhere before the
   Calls Transcripts page existed). Neutral colours, not urgency-red — this
   is a classification, not a warning. */
function CallTypeBadge({ callType }) {
  const isImportant = callType !== "low_signal";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: t.radius,
        color: isImportant ? t.accent : t.edge2,
        background: isImportant ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : t.frostSoft,
        whiteSpace: "nowrap",
      }}
    >
      {isImportant ? "Important" : "Regular"}
    </span>
  );
}

function CallCard({ call, onOpen, onToggle, onPark, busyIds, index = 0, showTypeBadge = false }) {
  const visible = call.todos.filter((td) => td.status !== "done");
  const done = call.todos.filter((td) => td.status === "done");
  const [openTranscript, setOpenTranscript] = useState(false);

  return (
    <Card
      className="sbm-rise"
      style={{ marginBottom: 12, animationDelay: `${index * 40}ms` }}
    >
      <button
        onClick={() => onOpen(call.id)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <CallHeading call={call} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {showTypeBadge && <CallTypeBadge callType={call.call_type} />}
            {call.customer_waiting ? <WaitingTag /> : null}
          </div>
        </div>
        <div style={{ fontSize: 13, color: t.edge2, marginTop: 2 }}>
          {fmtDate(call.recorded_at)} · {Math.round(call.duration_s / 60)} min
        </div>
      </button>

      {call.summary && <p style={{ fontSize: 13, lineHeight: 1.6, color: t.edge2, margin: "0 0 10px" }}>{call.summary}</p>}

      {[...visible, ...done].map((todo) => (
        <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onPark={onPark} busy={busyIds.has(todo.id)} />
      ))}

      {call.commitments?.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.frost}` }}>
          <CommitmentsList commitments={call.commitments} />
        </div>
      )}

      {call.transcript != null && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.frost}` }}>
          <button
            onClick={() => setOpenTranscript((v) => !v)}
            aria-expanded={openTranscript}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: t.edge2,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <FileText size={14} />
            {openTranscript ? "Hide transcript" : "Show transcript"}
          </button>
          {openTranscript && (
            <p style={{ fontSize: 13, lineHeight: 1.8, color: t.edge2, marginTop: 8, whiteSpace: "pre-wrap" }}>
              {call.transcript}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------
   Day view — calls recorded that day, plus everything closed that day
   regardless of which call it came from.
   ------------------------------------------------------------------ */
function DayView({ date, calls, onBack, onOpen, onToggle, onPark, busyIds }) {
  const dayCalls = useMemo(
    () => sortCalls(calls.filter((c) => dayKey(c.recorded_at) === date)),
    [calls, date]
  );

  const closures = useMemo(() => {
    const out = [];
    for (const c of calls)
      for (const td of c.todos)
        if (td.status === "done" && dayKey(td.completed_at) === date)
          out.push({ ...td, client_name: c.client_name });
    return out;
  }, [calls, date]);

  const minutes = dayCalls.reduce((n, c) => n + c.duration_s, 0) / 60;

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: "1.25rem" }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>
          {fmtLong(date)}
        </h1>
        <DownloadButton calls={dayCalls} label={date}>
          Day report
        </DownloadButton>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          paddingBottom: "1.5rem",
          marginBottom: "1.5rem",
          borderBottom: `1px solid ${t.frost}`,
        }}
      >
        {[
          [dayCalls.length, dayCalls.length === 1 ? "call" : "calls"],
          [closures.length, closures.length === 1 ? "item closed" : "items closed"],
          [Math.round(minutes), "minutes on calls"],
        ].map(([n, label]) => (
          <div key={label}>
            <div style={{ fontFamily: t.display, fontSize: 32, fontWeight: 500, lineHeight: 1, color: t.edge }}>
              {n}
            </div>
            <div style={{ fontSize: 13, color: t.edge2, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {closures.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: t.edge2, marginBottom: 4 }}>Closed on this day</div>
          {closures.map((td) => (
            <div
              key={td.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 0",
                borderTop: `1px solid ${t.frost}`,
                fontSize: 14,
              }}
            >
              <Check size={17} strokeWidth={2.5} color={t.edge2} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, color: t.edge2, textDecoration: "line-through" }}>{td.text}</span>
              <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>{td.client_name}</span>
            </div>
          ))}
        </Card>
      )}

      {dayCalls.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No calls recorded on this day.</p>
        </Card>
      ) : (
        dayCalls.map((call, i) => (
          <CallCard
            key={call.id}
            index={i}
            call={call}
            onOpen={onOpen}
            onToggle={onToggle}
            onPark={onPark}
            busyIds={busyIds}
          />
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function CallDetail({ call, onBack, onToggle, onPark, busyIds, canManage = true }) {
  const openTodos = call.todos.filter((td) => td.status !== "done");
  const doneTodos = call.todos.filter((td) => td.status === "done");
  const [openTranscript, setOpenTranscript] = useState(false);
  const [openTodosPanel, setOpenTodosPanel] = useState(false);

  const Section = ({ label, children }) => (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ fontSize: 12, color: t.edge2, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ paddingBottom: "1rem", borderBottom: `1px solid ${t.frost}`, marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {call.call_type === "internal" && call.sites?.length > 0 ? (
            <CallHeading call={call} />
          ) : (
            <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>
              {call.client_name}
            </h1>
          )}
          {call.customer_waiting ? <WaitingTag /> : null}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            marginTop: 6,
            fontSize: 13,
            color: t.edge2,
          }}
        >
          <span>
            {fmtDate(call.recorded_at)} · {Math.round(call.duration_s / 60)} min · {call.source}
          </span>
          <PhoneLink phone={call.client_phone} />
        </div>
      </div>

      <Section label="Summary">
        <p style={{ fontSize: 14, lineHeight: 1.7, color: t.edge, margin: 0 }}>{call.summary}</p>
      </Section>

      <Section label="Key takeaways">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.9, color: t.edge }}>
          {call.key_takeaways.map((k, i) => (
            <li key={i}>{k}</li>
          ))}
        </ul>
      </Section>

      {call.todos.length > 0 && (
        <Card style={{ marginBottom: "1.5rem" }}>
          <button
            onClick={() => setOpenTodosPanel((v) => !v)}
            aria-expanded={openTodosPanel}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: t.edge2,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <Check size={14} />
            {openTodosPanel ? "Hide todos" : `Show todos (${call.todos.length})`}
          </button>
          {openTodosPanel &&
            [...openTodos, ...doneTodos].map((td) => (
              <TodoRow
                key={td.id}
                todo={td}
                onToggle={onToggle}
                onPark={onPark}
                busy={busyIds.has(td.id)}
                readOnly={!canManage}
              />
            ))}
        </Card>
      )}

      {call.commitments?.length > 0 && (
        <Section label="Commitments">
          <CommitmentsList commitments={call.commitments} />
        </Section>
      )}

      {/* Unresolved is LLM output, never actionable — deliberately not checkboxes */}
      {call.unresolved.length > 0 && (
        <div style={{ borderLeft: `2px solid ${t.frost}`, paddingLeft: 14, marginBottom: "1.5rem" }}>
          <div style={{ fontSize: 12, color: t.edge2, marginBottom: 6 }}>Left unresolved on the call</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: t.edge2, display: "flex", flexDirection: "column", gap: 6 }}>
            {call.unresolved.map((u, i) => (
              <li key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <span>{u.item}</span>
                {u.blocked_on && (
                  <span style={{ fontSize: 11, color: t.putty, whiteSpace: "nowrap" }}>blocked on {u.blocked_on}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {call.material_needs?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "1.5rem" }}>
          {call.material_needs.map((m, i) => (
            <span
              key={i}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                border: `1px solid ${t.frost}`,
                borderRadius: t.radius,
                color: t.edge2,
              }}
            >
              {m}
            </span>
          ))}
        </div>
      )}

      {call.deadline && (
        <Card
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
          }}
        >
          <span style={{ fontSize: 13, color: t.edge2 }}>Deadline</span>
          <span
            style={{
              fontSize: 13,
              padding: "3px 10px",
              borderRadius: t.radius,
              color: daysUntil(call.deadline) <= 1 ? t.white : t.edge2,
              background: daysUntil(call.deadline) <= 1 ? t.signal : t.frost,
            }}
          >
            {fmtDate(call.deadline)}
          </span>
        </Card>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          borderTop: `1px solid ${t.frost}`,
          paddingTop: "1rem",
        }}
      >
        {call.transcript == null ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: t.edge2, fontSize: 13 }}>
            <FileText size={16} />
            Transcription in progress
          </span>
        ) : (
          <button
            onClick={() => setOpenTranscript((v) => !v)}
            aria-expanded={openTranscript}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: t.edge2,
              fontSize: 13,
            }}
          >
            <FileText size={16} />
            {openTranscript ? "Hide transcript" : "Read full transcript"}
          </button>
        )}
        <DownloadButton calls={[call]} label={`${call.client_name.toLowerCase().replace(/\s+/g, "-")}-${dayKey(call.recorded_at)}`}>
          Call report
        </DownloadButton>
      </div>

      {call.transcript != null && openTranscript && (
        <p style={{ fontSize: 13, lineHeight: 1.8, color: t.edge2, marginTop: 12, whiteSpace: "pre-wrap" }}>
          {call.transcript}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function EmptyState() {
  return (
    <Card style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
      <CircleDashed size={28} strokeWidth={1.25} color={t.edge2} />
      <p style={{ fontFamily: t.display, fontSize: 18, color: t.edge, margin: "1rem 0 6px" }}>
        Nothing recorded yet
      </p>
      <p style={{ fontSize: 14, color: t.edge2, margin: 0, lineHeight: 1.7 }}>
        The first call you record will show up here within fifteen minutes.
      </p>
    </Card>
  );
}

/* ================================================================== */
/* Tiles 1 & 2 — a plain number readout, same card language as tiles 3 & 4. */
/* Shared header row for all four home-panel tiles — one label style, one
   optional right-aligned action, so the tiles read as one family rather
   than four separately-styled cards. */
function TileLabel({ children, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span
        style={{
          fontFamily: t.label,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: t.edge,
        }}
      >
        {children}
      </span>
      {action}
    </div>
  );
}

/* Same row rhythm as the list tiles (10px vertical padding, hairline top
   border) so a stat card sitting next to a list card doesn't feel like a
   different template. */
const TILE_ROW_STYLE = {
  padding: "10px 0",
  borderTop: `1px solid ${t.frost}`,
};

/* The value row in a fixed-height number tile (StatCard, StaffTile,
   WorkflowTilesRow, "calls logged", "recordings") — grows to fill the
   tile's remaining --tile-height below the label and centers the number
   in it, so every number tile looks the same regardless of row position. */
const TILE_VALUE_ROW_STYLE = {
  flex: 1,
  display: "flex",
  alignItems: "center",
};

/* The numeral itself, inside TILE_VALUE_ROW_STYLE — accent-blue and bold
   rather than ink-black, so color reads as a deliberate signal on the one
   thing worth it, not decoration applied everywhere. See
   docs/DESIGN_LANGUAGE.md "Color". */
const TILE_NUMBER_STYLE = {
  fontFamily: t.display,
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1,
  color: t.accent,
};

const TEXT_INPUT_STYLE = {
  minHeight: 40,
  padding: "0 10px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  fontFamily: t.body,
  fontSize: 14,
  color: t.edge,
  background: t.white,
};

const PRIMARY_BUTTON_STYLE = {
  minHeight: 40,
  padding: "0 16px",
  border: "none",
  borderRadius: t.radiusButton,
  background: t.accent,
  color: t.white,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

function StatCard({ value, label }) {
  return (
    <Card tile>
      <TileLabel>{label}</TileLabel>
      <div style={TILE_VALUE_ROW_STYLE}>
        <span style={TILE_NUMBER_STYLE}>{value}</span>
      </div>
    </Card>
  );
}

/* Home-panel entry point into StaffDirectoryView — admin/superadmin only
   (migration 0011), same tile template as StatCard but clickable, matching
   the other tiles' Card+TileLabel shape rather than a bespoke look. */
function StaffTile({ count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Staff — ${count} people`}
    >
      <Card tile>
        <TileLabel action={<Users size={14} color={t.edge2} />}>staff</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

/* ------------------------------------------------------------------
   Workflow-category tiles — migration 0013. Same template as StaffTile:
   count + label, clickable. `tasks` is the flat open-site-tasks list (see
   fetchOpenSiteTasks) already scoped server-side to "mine" for a staff
   session or "everyone" for admin — this component just groups it by
   category and renders one tile per non-empty category, hidden at zero
   rather than shown as a permanent 0 (same rule as the escalations tile).
   ------------------------------------------------------------------ */
function WorkflowTilesRow({ tasks, onOpenCategory }) {
  const counts = useMemo(() => {
    const m = new Map();
    for (const task of tasks) m.set(task.category, (m.get(task.category) ?? 0) + 1);
    return m;
  }, [tasks]);

  return WORKFLOW_CATEGORIES.filter((c) => counts.get(c.key) > 0).map((c) => (
    <button
      key={c.key}
      onClick={() => onOpenCategory(c.key)}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`${c.label} — ${counts.get(c.key)} open`}
    >
      <Card tile>
        <TileLabel>{c.label}</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{counts.get(c.key)}</span>
        </div>
      </Card>
    </button>
  ));
}

/* Drilldown from a workflow tile — every site with an open task in this one
   category, showing which stage, who has it, and the due date (same
   urgency-red rule as everywhere else). */
function WorkflowCategorySiteList({ tasks, category, onBack, onOpenSite }) {
  const rows = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.category === category)
        .sort((a, b) => {
          const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return ad - bd;
        }),
    [tasks, category]
  );

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {WORKFLOW_CATEGORY_LABEL[category] ?? category}
      </h1>
      {rows.length === 0 ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Nothing open in this category right now.</p>
      ) : (
        rows.map((task) => {
          const urgent = isTaskDueDateUrgent(task.due_date);
          return (
            <Card key={task.id} style={{ marginBottom: 10 }}>
              <button
                onClick={() => onOpenSite(task.site_name)}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 500, color: t.edge }}>{task.site_name}</span>
                  {task.due_date && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: urgent ? t.signal : t.edge2 }}>
                      {fmtShort(task.due_date)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: t.edge2, marginTop: 2 }}>{task.stage_label}</div>
                <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
                  {task.assignee_name ? `Assigned to ${task.assignee_name}` : "Unassigned"}
                </div>
              </button>
            </Card>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Tile 3 — sites needing attention. See docs/ADDITIONAL_FEATURES_M0.md
   "Phase 1 home page". Inclusion/sort/age is computed server-side
   (packages/core/src/queries.ts getSitesNeedingAttention). Always
   rendered, with an empty state — a tile that disappears when there's
   nothing to show made the 4-card panel jump around; "nothing needs
   attention" is itself useful information, same principle as the
   escalations empty state.
   ------------------------------------------------------------------ */
function SitesAttentionTile({ sites, onOpenSite, onReviewSites, onViewDirectory, hasAnySites, unconfirmedCount, confirmedCount }) {
  /* "Nothing needs attention" means the triage list is empty AND there's no
     site data at all elsewhere — showing it next to a confirmed-sites or
     unconfirmed-sites link (both proof there IS site data) read as a
     contradiction. */
  const showEmptyState = sites.length === 0 && !hasAnySites;

  return (
    <Card tile>
      <TileLabel>Sites needing attention</TileLabel>
      {/* Scrolls internally past --tile-height rather than growing the tile
          — see the Card `tile` comment. The two footer links below stay
          pinned outside this region so they're always reachable. */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {showEmptyState && <p style={{ fontSize: 13, color: t.edge2, margin: "10px 0 0" }}>Nothing needs attention.</p>}
        {sites.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpenSite(s.name)}
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              ...TILE_ROW_STYLE,
              margin: 0,
              border: "none",
              borderTop: `1px solid ${t.frost}`,
              background: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: t.body,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: t.edgeStrong }}>{s.name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.edge2 }}>
              <span>
                {s.open_count} open · {s.oldest_age_days}d
              </span>
            </span>
          </button>
        ))}
      </div>
      {confirmedCount > 0 && (
        <button
          onClick={onViewDirectory}
          style={{
            display: "block",
            flexShrink: 0,
            width: "100%",
            textAlign: "left",
            padding: "10px 0 0",
            margin: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontFamily: t.body,
            fontSize: 12,
            fontWeight: 600,
            color: t.edge,
          }}
        >
          {confirmedCount} confirmed site{confirmedCount === 1 ? "" : "s"} →
        </button>
      )}
      <button
        onClick={onReviewSites}
        style={{
          display: "block",
          flexShrink: 0,
          width: "100%",
          textAlign: "left",
          padding: "10px 0 0",
          margin: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          fontFamily: t.body,
          fontSize: 12,
          fontWeight: 600,
          color: t.accent,
        }}
      >
        Show unconfirmed sites{unconfirmedCount > 0 ? ` (${unconfirmedCount})` : ""}
      </button>
    </Card>
  );
}

/* ------------------------------------------------------------------
   Tile 4 — escalations. Manual only, the pipeline never writes here —
   see docs/ADDITIONAL_FEATURES_M0.md "Tile 4 — Escalations".
   ------------------------------------------------------------------ */
function EscalationsTile({ escalations, onAdd, onClose, busyIds }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setText("");
      setAdding(false);
    } catch (err) {
      console.error("[sbm] failed to add escalation", err);
    } finally {
      setSaving(false);
    }
  };

  const addButton = (
    <button
      onClick={() => setAdding((v) => !v)}
      aria-label={adding ? "Cancel" : "Add escalation"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        border: `1px solid ${t.frost}`,
        borderRadius: t.radiusButton,
        background: t.white,
        color: t.edge,
        cursor: "pointer",
        padding: 0,
      }}
    >
      {adding ? <span style={{ fontSize: 16, lineHeight: 1 }}>×</span> : <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
    </button>
  );

  return (
    <Card tile>
      <TileLabel action={addButton}>Escalations</TileLabel>

      {adding && (
        <div style={{ display: "flex", gap: 8, flexShrink: 0, ...TILE_ROW_STYLE }}>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="What needs attention?"
            style={{ ...TEXT_INPUT_STYLE, flex: 1 }}
          />
          <button
            onClick={submit}
            disabled={saving || !text.trim()}
            style={{ ...PRIMARY_BUTTON_STYLE, cursor: saving ? "wait" : "pointer", opacity: saving || !text.trim() ? 0.6 : 1 }}
          >
            Add
          </button>
        </div>
      )}

      {/* Scrolls internally past --tile-height rather than growing the tile
          — see the Card `tile` comment. */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {escalations.length === 0 ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: "10px 0 0" }}>Nothing escalated.</p>
        ) : (
          escalations.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, ...TILE_ROW_STYLE }}>
              <button
                onClick={() => onClose(e.id)}
                disabled={busyIds.has(e.id)}
                aria-label={`Close: ${e.text}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 44,
                  height: 44,
                  margin: "-11px 0 -11px -11px",
                  flexShrink: 0,
                  padding: 0,
                  border: "none",
                  background: "none",
                  cursor: busyIds.has(e.id) ? "wait" : "pointer",
                  color: t.edge2,
                }}
              >
                <Circle size={17} strokeWidth={1.75} />
              </button>
              <div style={{ flex: 1, fontSize: 14, lineHeight: 1.5, color: t.edge }}>
                {e.text}
                {e.site_name && <span style={{ display: "block", fontSize: 11, color: t.edge2, marginTop: 2 }}>{e.site_name}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/* Popup for "Assign team" — see docs/ADDITIONAL_FEATURES_M0.md follow-up.
   Two fields, add-or-cancel — deliberately not a full contact form. */
/* Assigns a real staff account (dropdown, phone auto-filled from their
   profile) rather than free text — migration 0011. Staff with no phone on
   file yet are shown but disabled, since the backend rejects those. */
function AssignTeamModal({ onClose, onAdd }) {
  const [staff, setStaff] = useState(null);
  const [staffId, setStaffId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchStaffRoster()
      .then((data) => {
        if (cancelled) return;
        setStaff(data);
        setStaffId(data[0]?.id ?? "");
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = staff?.find((s) => s.id === staffId) ?? null;

  const submit = async () => {
    if (!staffId) {
      setError("Choose a staff member.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAdd(staffId);
      onClose();
    } catch (err) {
      console.error("[sbm] failed to add team member", err);
      setError(err.message || "Failed to add — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Assign team member"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Assign team member</span>
        {staff === null ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Loading staff…</p>
        ) : staff.length === 0 ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>No staff yet — add one from the Staff page first.</p>
        ) : (
          <>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={TEXT_INPUT_STYLE}>
              {/* A real, always-present option for the "" default — without
                  it, if the roster ever loads empty before staff is set, the
                  select's value matches no <option> at all, which leaves it
                  stuck showing the first entry and unresponsive to taps on
                  some mobile browsers. Every staff member is selectable
                  regardless of phone — it's addable later from the Staff
                  page without re-doing the assignment. */}
              <option value="" disabled>
                Choose a staff member…
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 13, color: t.edge2 }}>
              Phone: {selected?.phone || "not on file yet"}
            </div>
          </>
        )}
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: "0 16px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !staff?.length}
            style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !staff?.length ? 0.6 : 1 }}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SMALL_SECONDARY_BUTTON_STYLE = {
  padding: "6px 12px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/* One stage row inside WorkTimelinePopup — status/assignee/timestamps, plus
   an inline assign-or-reassign control. Kept as its own component so each
   row manages its own "editing" state independently. */
function StageAssignRow({ task, onAssign }) {
  const [editing, setEditing] = useState(false);
  const [staff, setStaff] = useState(null);
  const [staffId, setStaffId] = useState(task.assigned_to_user_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing || staff !== null) return;
    fetchStaffRoster()
      .then((data) => {
        setStaff(data);
        setStaffId((current) => current || task.assigned_to_user_id || data[0]?.id || "");
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        setStaff([]);
      });
  }, [editing, staff, task.assigned_to_user_id]);

  const submit = async () => {
    if (!staffId) {
      setError("Choose a staff member.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAssign(task.id, { assigned_to_user_id: staffId, due_date: dueDate || null });
      setEditing(false);
    } catch (err) {
      console.error("[sbm] failed to assign stage", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const dueUrgent = task.status !== "done" && isTaskDueDateUrgent(task.due_date);

  let statusLine;
  if (task.status === "done") {
    statusLine = `Done by ${task.completed_by_name ?? task.assignee_name ?? "—"}${task.completed_at ? ` · ${fmtShort(task.completed_at)}` : ""}`;
  } else if (task.assignee_name) {
    statusLine = (
      <>
        Assigned to {task.assignee_name}
        {task.assigned_at ? ` · ${fmtShort(task.assigned_at)}` : ""}
        {task.due_date && (
          <span style={{ color: dueUrgent ? t.signal : "inherit", fontWeight: dueUrgent ? 700 : 400 }}>
            {" "}
            · due {fmtShort(task.due_date)}
          </span>
        )}
      </>
    );
  } else {
    statusLine = "Unassigned";
  }

  return (
    <div style={TILE_ROW_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, color: t.edge }}>{task.stage_label}</div>
          <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>{statusLine}</div>
        </div>
        <button onClick={() => setEditing((v) => !v)} style={SMALL_SECONDARY_BUTTON_STYLE}>
          {editing ? "Cancel" : task.assignee_name ? "Reassign" : "Assign"}
        </button>
      </div>
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {staff === null ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Loading staff…</p>
          ) : staff.length === 0 ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>No staff yet — add one from the Staff page first.</p>
          ) : (
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={TEXT_INPUT_STYLE}>
              <option value="" disabled>
                Choose a staff member…
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 }}>
            Due date (optional)
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={TEXT_INPUT_STYLE} />
          </label>
          {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
          <button
            onClick={submit}
            disabled={saving || !staff?.length}
            style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !staff?.length ? 0.6 : 1, alignSelf: "flex-start" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

/* Admin/superadmin-only popup from SiteView's "View work timeline" button —
   all 23 stages for this site, grouped by category (display order only, not
   a pipeline — see migration 0013), each with status/assignee/timestamps
   and an inline assign control. */
function WorkTimelinePopup({ site, onClose, onAssigned = () => {} }) {
  const [tasks, setTasks] = useState(null);

  const reload = useCallback(() => {
    if (!site?.id) return Promise.resolve();
    return fetchSiteTasks(site.id)
      .then(setTasks)
      .catch((err) => {
        console.error("[sbm] failed to load site tasks", err);
        setTasks([]);
      });
  }, [site?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const assign = async (taskId, patch) => {
    await patchSiteTask(taskId, patch);
    // Refreshes this popup's own list AND the app-level open-tasks cache the
    // home-page workflow tiles read from — without the second call, an
    // assignment made here doesn't show up on home until a full reload.
    await Promise.all([reload(), onAssigned()]);
  };

  const doneCount = tasks?.filter((tk) => tk.status === "done").length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="View work timeline"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "85vh",
          overflowY: "auto",
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Work timeline</span>
          {tasks && (
            <span style={{ fontSize: 12, color: t.edge2 }}>
              {doneCount}/{tasks.length} done
            </span>
          )}
        </div>
        {tasks === null ? (
          <p style={{ fontSize: 13, color: t.edge2 }}>Loading…</p>
        ) : (
          WORKFLOW_CATEGORIES.map((cat) => {
            const rows = tasks.filter((tk) => tk.category === cat.key);
            if (rows.length === 0) return null;
            return (
              <div key={cat.key}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: t.edge2,
                    margin: "10px 0 0",
                  }}
                >
                  {cat.label}
                </div>
                {rows.map((task) => (
                  <StageAssignRow key={task.id} task={task} onAssign={assign} />
                ))}
              </div>
            );
          })
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={onClose} style={SMALL_SECONDARY_BUTTON_STYLE}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* Staff-facing banner on their own SiteView — their open task(s) at this
   site, with a one-tap "Mark done" that then offers an immediate handoff to
   any other still-unassigned stage at the same site (no admin required for
   this specific handoff — see the narrow permission in
   isUserActiveOnSiteTasks). Stages carry no order, so the handoff picker
   lists every unassigned stage, not a system-computed "next" one. */
function MyTaskBanner({ siteId, myTasks, onChanged }) {
  const [completingId, setCompletingId] = useState(null);
  const [handoffFor, setHandoffFor] = useState(null); // the just-completed task, while picking a handoff
  const [unassigned, setUnassigned] = useState(null);
  const [pickedStageId, setPickedStageId] = useState("");
  const [staff, setStaff] = useState(null);
  const [staffId, setStaffId] = useState("");
  const [saving, setSaving] = useState(false);

  const markDone = async (task) => {
    setCompletingId(task.id);
    try {
      await patchSiteTask(task.id, { status: "done" });
      // Completion itself is done regardless of what follows — refresh
      // immediately so the app-level tile counts and this banner reflect it
      // even if the handoff picker below can't be offered for some reason.
      await onChanged();
      try {
        const [openStages, staffRoster] = await Promise.all([fetchUnassignedSiteTasks(siteId), fetchStaffRoster()]);
        if (openStages.length > 0) {
          setUnassigned(openStages);
          setStaff(staffRoster);
          setPickedStageId(openStages[0].id);
          setStaffId("");
          setHandoffFor(task);
        }
      } catch (err) {
        console.error("[sbm] failed to load handoff options — completion still succeeded", err);
      }
    } catch (err) {
      console.error("[sbm] failed to mark task done", err);
    } finally {
      setCompletingId(null);
    }
  };

  const submitHandoff = async () => {
    if (!pickedStageId || !staffId) return;
    setSaving(true);
    try {
      await patchSiteTask(pickedStageId, { assigned_to_user_id: staffId });
      await onChanged();
      setHandoffFor(null);
    } catch (err) {
      console.error("[sbm] failed to hand off stage", err);
    } finally {
      setSaving(false);
    }
  };

  const hasTasks = myTasks && myTasks.length > 0;

  return (
    <>
      {hasTasks && (
      <Card style={{ marginBottom: 12, borderColor: t.accent }}>
        <TileLabel>Your task{myTasks.length > 1 ? "s" : ""} here</TileLabel>
        {myTasks.map((task) => (
          <div key={task.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...TILE_ROW_STYLE }}>
            <div>
              <div style={{ fontSize: 14, color: t.edge }}>{task.stage_label}</div>
              {task.due_date && (
                <div style={{ fontSize: 12, color: isTaskDueDateUrgent(task.due_date) ? t.signal : t.edge2, marginTop: 2 }}>
                  Due {fmtShort(task.due_date)}
                </div>
              )}
            </div>
            <button
              onClick={() => markDone(task)}
              disabled={completingId === task.id}
              style={{ ...PRIMARY_BUTTON_STYLE, opacity: completingId === task.id ? 0.6 : 1, minHeight: 34, padding: "0 12px" }}
            >
              {completingId === task.id ? "Saving…" : "Mark done"}
            </button>
          </div>
        ))}
      </Card>
      )}

      {handoffFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hand off next stage"
          onClick={() => setHandoffFor(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,24,31,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: t.white,
              borderRadius: t.radiusCard,
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
              {handoffFor.stage_label} — done. Hand off the next stage?
            </span>
            <select value={pickedStageId} onChange={(e) => setPickedStageId(e.target.value)} style={TEXT_INPUT_STYLE}>
              {unassigned.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.stage_label}
                </option>
              ))}
            </select>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={TEXT_INPUT_STYLE}>
              <option value="" disabled>
                Choose a staff member…
              </option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={() => setHandoffFor(null)} style={SMALL_SECONDARY_BUTTON_STYLE}>
                Skip
              </button>
              <button
                onClick={submitHandoff}
                disabled={saving || !staffId}
                style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !staffId ? 0.6 : 1 }}
              >
                {saving ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------
   Audio playback — voice notes and site memos. Thin native <audio>
   wrapper, no custom scrubber; the browser issues Range requests against
   the streaming endpoint (see src/lib/r2-stream.ts) for seeking.
   ------------------------------------------------------------------ */
function AudioPlayer({ src }) {
  return (
    <audio controls src={src} style={{ width: "100%", height: 36, marginTop: 6 }}>
      Your browser can't play this audio.
    </audio>
  );
}

function pickRecorderMimeType() {
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const c of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(c)) return c;
  }
  return "";
}

function extensionForMimeType(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  return "m4a";
}

/* Popup for recording a voice note in-browser via MediaRecorder — record,
   stop, preview, save. No waveform — matches the app's "no new UI kit"
   restraint, same as AssignTeamModal above. */
function VoiceNoteModal({ onClose, onSave }) {
  const [status, setStatus] = useState("idle"); // idle | recording | recorded | saving
  const [elapsedS, setElapsedS] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const blobRef = useRef(null);
  const previewUrlRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/mp4" });
        blobRef.current = blob;
        previewUrlRef.current = URL.createObjectURL(blob);
        setStatus("recorded");
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus("recording");
      setElapsedS(0);
      timerRef.current = setInterval(() => setElapsedS((s) => s + 1), 1000);
    } catch (err) {
      console.error("[sbm] mic access failed", err);
      setError("Couldn't access the microphone — check permissions.");
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
  };

  const save = async () => {
    if (!blobRef.current) return;
    setStatus("saving");
    setError("");
    try {
      const ext = extensionForMimeType(blobRef.current.type);
      await onSave(blobRef.current, `voice-note.${ext}`);
      onClose();
    } catch (err) {
      console.error("[sbm] voice note upload failed", err);
      setError("Failed to save — try again.");
      setStatus("recorded");
    }
  };

  const mm = String(Math.floor(elapsedS / 60)).padStart(2, "0");
  const ss = String(elapsedS % 60).padStart(2, "0");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Record voice note"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Record voice note</span>

        {status === "idle" && (
          <button onClick={startRecording} style={{ ...PRIMARY_BUTTON_STYLE, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Mic size={16} /> Start recording
          </button>
        )}

        {status === "recording" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: t.display, fontSize: 22, color: t.signal }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.signal }} />
              {mm}:{ss}
            </div>
            <button
              onClick={stopRecording}
              style={{ ...PRIMARY_BUTTON_STYLE, background: t.edge, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <Square size={14} /> Stop
            </button>
          </>
        )}

        {status === "recorded" && previewUrlRef.current && (
          <>
            <AudioPlayer src={previewUrlRef.current} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{ minHeight: 40, padding: "0 16px", border: `1px solid ${t.frost}`, borderRadius: t.radiusButton, background: t.white, color: t.edge2, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Discard
              </button>
              <button onClick={save} style={PRIMARY_BUTTON_STYLE}>
                Save
              </button>
            </div>
          </>
        )}

        {status === "saving" && <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Saving…</p>}
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
      </div>
    </div>
  );
}

/* Add photo / video / voice note — sits at the top of SiteView. Photo/video
   upload immediately on file selection; voice note opens VoiceNoteModal. */
function SiteMediaUploadRow({ siteId, onUploaded, onVoiceNote }) {
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await postSiteMedia(siteId, file);
      await onUploaded?.();
    } catch (err) {
      console.error("[sbm] media upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const actionButtonStyle = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    minHeight: 40,
    border: `1px solid ${t.frost}`,
    borderRadius: t.radiusButton,
    background: t.white,
    color: t.edge,
    fontSize: 13,
    fontWeight: 600,
    cursor: uploading ? "wait" : "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button disabled={uploading} onClick={() => photoInputRef.current?.click()} style={actionButtonStyle}>
        <Image size={15} /> Add photo
      </button>
      <button disabled={uploading} onClick={() => videoInputRef.current?.click()} style={actionButtonStyle}>
        <Video size={15} /> Add video
      </button>
      <button disabled={uploading} onClick={() => setShowVoiceModal(true)} style={actionButtonStyle}>
        <Mic size={15} /> Add voice note
      </button>
      {showVoiceModal && (
        <VoiceNoteModal
          onClose={() => setShowVoiceModal(false)}
          onSave={async (blob, fileName) => {
            await onVoiceNote(blob, fileName);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Site timeline — unified activity feed (calls incl. voice notes, media
   uploads, team changes, site-detail edits), newest first. Extends the
   borderLeft rail idiom already used for CallDetail's unresolved-items
   block, with a dot marker per entry.
   ------------------------------------------------------------------ */
function timelineEntryIcon(entry) {
  if (entry.type === "call") return entry.ref?.is_voice_memo ? <Mic size={13} /> : <FileText size={13} />;
  if (entry.type === "media") return entry.ref?.media_type === "video" ? <Video size={13} /> : <Image size={13} />;
  if (entry.type === "team_added") return <Users size={13} />;
  return <FileText size={13} />;
}

function VoiceMemoDetail({ entryRef }) {
  if (entryRef.transcript === undefined) return null; // not sent to this session (staff) — nothing to show
  if (entryRef.transcript === null) return null; // still transcribing
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.edge2, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Transcript
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: t.edge2,
          background: t.frostSoft,
          border: `1px solid ${t.frost}`,
          borderRadius: t.radiusButton,
          padding: "10px 12px",
          maxHeight: 220,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {entryRef.transcript}
      </div>
      {entryRef.todos?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.edge2, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Todos
          </div>
          {entryRef.todos.map((td) => (
            <TodoRow key={td.id} todo={td} readOnly />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteTimelineEntry({ entry, onOpenCall, canManage }) {
  const content = () => {
    if (entry.type === "call") {
      // A site voice memo's transcript/todos are admin-only (see
      // isCallAccessibleToUser) — staff get the plain summary line, not a
      // link into a call detail the API would 403 on anyway.
      if (entry.ref?.is_voice_memo && !canManage) {
        return <span style={{ fontSize: 14, color: t.edge, lineHeight: 1.6 }}>{entry.summary}</span>;
      }
      return (
        <button
          onClick={() => onOpenCall(entry.ref.call_id)}
          style={{ display: "block", textAlign: "left", padding: 0, border: "none", background: "none", cursor: "pointer", color: t.edge, fontSize: 14, lineHeight: 1.6 }}
        >
          {entry.summary}
        </button>
      );
    }
    if (entry.type === "media") {
      return (
        <>
          <span style={{ fontSize: 14, color: t.edge }}>{entry.summary}</span>
          {entry.ref?.media_type === "photo" ? (
            <img
              src={`/api/media/${entry.ref.media_id}`}
              alt=""
              style={{ display: "block", marginTop: 6, maxWidth: "100%", maxHeight: 220, borderRadius: t.radiusButton, border: `1px solid ${t.frost}` }}
            />
          ) : (
            <video
              src={`/api/media/${entry.ref.media_id}`}
              controls
              style={{ display: "block", marginTop: 6, maxWidth: "100%", maxHeight: 220, borderRadius: t.radiusButton }}
            />
          )}
        </>
      );
    }
    return <span style={{ fontSize: 14, color: t.edge }}>{entry.summary}</span>;
  };

  return (
    <div style={{ position: "relative", paddingLeft: 20, paddingBottom: 18 }}>
      <span
        style={{
          position: "absolute",
          left: -4.5,
          top: 4,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: t.accent,
          border: `2px solid ${t.white}`,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.edge2, marginBottom: 3 }}>
        {timelineEntryIcon(entry)}
        <span>{fmtDate(entry.created_at)}</span>
        {entry.actor_name && <span>· {entry.actor_name}</span>}
      </div>
      {content()}
      {entry.type === "call" && entry.ref?.is_voice_memo && <AudioPlayer src={`/api/calls/${entry.ref.call_id}/recording`} />}
      {entry.type === "call" && entry.ref?.is_voice_memo && canManage && <VoiceMemoDetail entryRef={entry.ref} />}
    </div>
  );
}

function SiteTimeline({ entries, onOpenCall, canManage }) {
  if (entries === null) return <p style={{ fontSize: 13, color: t.edge2 }}>Loading…</p>;
  if (entries.length === 0) {
    return (
      <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing recorded for this site yet.</p>
      </Card>
    );
  }
  return (
    <div style={{ borderLeft: `2px solid ${t.frost}`, marginLeft: 4 }}>
      {entries.map((entry) => (
        <SiteTimelineEntry key={`${entry.type}-${entry.id}`} entry={entry} onOpenCall={onOpenCall} canManage={canManage} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   Site view — drilldown from Tile 3, the sites directory, or the
   review screen. Calls tagged to this site (same shape as DayView,
   filtered by site instead of date), plus always-editable site details
   and an always-editable team roster — see the conversation that added
   this: "Always available, not conditional" on call/item count.
   ------------------------------------------------------------------ */
function SiteView({
  site,
  siteRecord,
  calls,
  onBack,
  onOpen,
  onSiteUpdated,
  autoEditDetails = false,
  canManage = true,
  myOpenTasks = [],
  onTasksChanged = () => {},
}) {
  const [showWorkTimeline, setShowWorkTimeline] = useState(false);
  const siteCalls = useMemo(
    () => sortCalls(calls.filter((c) => c.sites?.includes(site))),
    [calls, site]
  );

  /* "Assign new site" only for a genuinely blank site — no details AND no
     call history yet. Anything with either already shows "Add more site
     details" instead, since it's not really a fresh/untouched site. */
  const hasDetails = Boolean(siteRecord?.address?.trim() || siteRecord?.poc_name?.trim());
  const isBlankSite = !hasDetails && siteCalls.length === 0;
  const daysMissed = siteRecord?.target_closure_date ? -daysUntil(siteRecord.target_closure_date) : 0;
  const targetMissed = daysMissed > 0;

  const [address, setAddress] = useState(siteRecord?.address ?? "");
  const [pocName, setPocName] = useState(siteRecord?.poc_name ?? "");
  const [targetDate, setTargetDate] = useState(siteRecord?.target_closure_date ?? "");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  // Landing here straight from "Add new site" (see onSiteCreated) opens the
  // details form immediately rather than requiring an extra tap, since the
  // whole point of that flow was to keep filling this site in.
  const [editingDetails, setEditingDetails] = useState(autoEditDetails && !hasDetails);

  const [team, setTeam] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [timeline, setTimeline] = useState(null);

  useEffect(() => {
    if (!siteRecord?.id) {
      setTeam([]);
      return;
    }
    let cancelled = false;
    fetchSiteTeam(siteRecord.id)
      .then((data) => {
        if (!cancelled) setTeam(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load site team", err);
        if (!cancelled) setTeam([]);
      });
    return () => {
      cancelled = true;
    };
  }, [siteRecord?.id]);

  const loadTimeline = useCallback(() => {
    if (!siteRecord?.id) {
      setTimeline([]);
      return Promise.resolve();
    }
    return fetchSiteTimeline(siteRecord.id)
      .then((data) => setTimeline(data))
      .catch((err) => {
        console.error("[sbm] failed to load site timeline", err);
        setTimeline([]);
      });
  }, [siteRecord?.id]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const saveDetails = async () => {
    if (!siteRecord?.id) return;
    setSavingDetails(true);
    setDetailsSaved(false);
    try {
      await patchSite(siteRecord.id, { address, poc_name: pocName, target_closure_date: targetDate || null });
      await onSiteUpdated?.();
      setDetailsSaved(true);
      setEditingDetails(false);
    } catch (err) {
      console.error("[sbm] failed to save site details", err);
    } finally {
      setSavingDetails(false);
    }
  };

  const addTeamMember = async (userId) => {
    const member = await postSiteTeamMember(siteRecord.id, userId);
    setTeam((current) => [...(current ?? []), member]);
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {site}
      </h1>

      {/* Staff have no visibility into the Sites-list red highlight (that's
          their own home page, not a management view) — this is their only
          signal that a target closure date has passed. Admin/superadmin get
          the list highlight instead; this banner would be redundant for
          them since they're the ones who set the date. */}
      {!canManage && targetMissed && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            marginBottom: "1.25rem",
            borderRadius: t.radiusCard,
            background: t.signalBg,
            color: t.signal,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          You've missed the target closure date by {daysMissed} day{daysMissed === 1 ? "" : "s"}.
        </div>
      )}

      {siteRecord?.id && (
        <SiteMediaUploadRow
          siteId={siteRecord.id}
          onUploaded={loadTimeline}
          onVoiceNote={async (blob, fileName) => {
            await postSiteVoiceNote(siteRecord.id, blob, fileName);
            await loadTimeline();
          }}
        />
      )}

      {siteRecord?.id && (
        <Card style={{ marginBottom: 12 }}>
          <TileLabel
            action={
              canManage ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {detailsSaved && !editingDetails && <span style={{ fontSize: 12, color: t.edge2 }}>Saved.</span>}
                  <button
                    onClick={() => {
                      setDetailsSaved(false);
                      setEditingDetails((v) => !v);
                    }}
                    style={{
                      padding: "6px 12px",
                      border: `1px solid ${t.frost}`,
                      borderRadius: t.radiusButton,
                      background: t.white,
                      color: t.edge,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {editingDetails ? "Cancel" : isBlankSite ? "Assign new site" : "Add more site details"}
                  </button>
                </div>
              ) : undefined
            }
          >
            Site details
          </TileLabel>

          {canManage && editingDetails ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                <input
                  placeholder="Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={TEXT_INPUT_STYLE}
                />
                <input
                  placeholder="Point of contact name"
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                  style={TEXT_INPUT_STYLE}
                />
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 }}>
                  Target closure date
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    style={TEXT_INPUT_STYLE}
                  />
                </label>
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={saveDetails} disabled={savingDetails} style={{ ...PRIMARY_BUTTON_STYLE, opacity: savingDetails ? 0.6 : 1 }}>
                  {savingDetails ? "Saving…" : "Save details"}
                </button>
              </div>
            </>
          ) : (
            // Read-only summary of whatever's currently saved — shown for
            // everyone, not just staff, and not only while the edit form
            // happens to be open. Previously an admin had no way to see a
            // site's saved address/point-of-contact without re-opening the
            // edit form every visit, which read as "the details I added
            // aren't there when I come back."
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, color: t.edge }}>{siteRecord?.address?.trim() || "No address on file."}</span>
              {siteRecord?.poc_name?.trim() && (
                <span style={{ fontSize: 13, color: t.edge2 }}>Point of contact: {siteRecord.poc_name}</span>
              )}
              <span style={{ fontSize: 13, color: targetMissed ? t.signal : t.edge2, fontWeight: targetMissed ? 700 : 400 }}>
                {siteRecord?.target_closure_date
                  ? `Target closure date: ${fmtDate(siteRecord.target_closure_date)}${targetMissed ? ` — missed by ${daysMissed}d` : ""}`
                  : "No target closure date set."}
              </span>
            </div>
          )}
        </Card>
      )}

      {siteRecord?.id && (
        <Card style={{ marginBottom: 12 }}>
          <TileLabel
            action={
              canManage ? (
                <button
                  onClick={() => setShowAssignModal(true)}
                  style={{
                    padding: "6px 12px",
                    border: `1px solid ${t.frost}`,
                    borderRadius: t.radiusButton,
                    background: t.white,
                    color: t.edge,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {team && team.length > 0 ? "Add more members" : "Assign team"}
                </button>
              ) : undefined
            }
          >
            Team
          </TileLabel>
          {team === null ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: "6px 0 0" }}>Loading…</p>
          ) : team.length === 0 ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: "6px 0 0" }}>No one assigned yet.</p>
          ) : (
            team.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", ...TILE_ROW_STYLE }}>
                <span style={{ fontSize: 14, color: t.edge }}>{m.name}</span>
                <span style={{ fontSize: 13, color: t.edge2 }}>{m.contact_number || "no phone on file"}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {siteRecord?.id && canManage && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowWorkTimeline(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
            View work timeline
          </button>
        </div>
      )}

      {siteRecord?.id && !canManage && (
        <MyTaskBanner siteId={siteRecord.id} myTasks={myOpenTasks} onChanged={onTasksChanged} />
      )}

      <TileLabel>Timeline</TileLabel>
      <div style={{ marginTop: 8 }}>
        <SiteTimeline entries={timeline} onOpenCall={onOpen} canManage={canManage} />
      </div>

      {showAssignModal && <AssignTeamModal onClose={() => setShowAssignModal(false)} onAdd={addTeamMember} />}
      {showWorkTimeline && (
        <WorkTimelinePopup site={siteRecord} onClose={() => setShowWorkTimeline(false)} onAssigned={onTasksChanged} />
      )}
    </div>
  );
}

/* Popup for "Add new site" — name plus the same optional address/POC
   fields SiteView's own details form uses (identical placeholders), so a
   site created here looks no different from one filled in afterward.
   Team assignment and photo/video/voice-note upload aren't collected here
   — creating the site hands off straight into SiteView, where that flow
   already exists, rather than duplicating it in this modal. */
function AddSiteModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [pocName, setPocName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a site name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate(trimmedName, address.trim(), pocName.trim());
    } catch (err) {
      console.error("[sbm] failed to create site", err);
      setError("Failed to create site — try again.");
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add new site"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Add new site</span>
        <input
          autoFocus
          placeholder="Site name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          placeholder="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          placeholder="Point of contact name"
          value={pocName}
          onChange={(e) => setPocName(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: "0 16px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Adding…" : "Add site"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Sites directory — reached via the "N confirmed sites" rollup on Tile 3.
   Every confirmed site with its current open-item count, alphabetical — a
   reference list, unlike Tile 3 itself which only shows sites that need
   triage. Tapping a row reuses the same per-site drilldown (SiteView) Tile
   3's own rows link to. Also the entry point for "Add new site".
   ------------------------------------------------------------------ */
function SitesDirectoryView({ onBack, onOpenSite, onSiteCreated, canManage = true, isHome = false }) {
  const [sites, setSites] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConfirmedSites()
      .then((data) => {
        if (!cancelled) setSites(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load confirmed sites", err);
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {!isHome && <BackLink onClick={onBack}>Back</BackLink>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Sites</h1>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={14} /> Add new site
          </button>
        )}
      </div>

      {sites === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : sites.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No confirmed sites yet.</p>
        </Card>
      ) : (
        <Card>
          {sites.map((s) => {
            const missed = s.target_closure_date && daysUntil(s.target_closure_date) < 0;
            return (
              <button
                key={s.id}
                onClick={() => onOpenSite(s.name)}
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: missed ? "12px 1.25rem" : "12px 0",
                  margin: missed ? "0 -1.25rem" : 0,
                  border: "none",
                  borderTop: `1px solid ${t.frost}`,
                  background: missed ? t.signalBg : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: t.body,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {s.unread_count > 0 && (
                    <span
                      className="sbm-unread-glow"
                      aria-label={`${s.unread_count} new since you last posted`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 20,
                        height: 20,
                        padding: "0 6px",
                        borderRadius: 999,
                        background: t.unread,
                        color: t.white,
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {s.unread_count}
                    </span>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 500, color: t.edgeStrong }}>{s.name}</span>
                  {s.target_closure_date && (
                    <span style={{ fontSize: 12, color: missed ? t.signal : t.edge2, fontWeight: missed ? 700 : 400 }}>
                      Due {fmtShort(s.target_closure_date)}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12, color: missed ? t.signal : t.edge2, fontWeight: missed ? 700 : 400 }}>
                  {missed ? `missed ${Math.abs(daysUntil(s.target_closure_date))}d` : `${s.open_count} open`}
                </span>
              </button>
            );
          })}
        </Card>
      )}

      {showAddModal && (
        <AddSiteModal
          onClose={() => setShowAddModal(false)}
          onCreate={async (name, address, pocName) => {
            const site = await onSiteCreated(name, address, pocName);
            setShowAddModal(false);
            return site;
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Staff — admin/superadmin only (migration 0011). Lists every `staff`
   account plus the viewer's own row ("or himself" — see docs). PINs come
   back decrypted from GET /api/staff and are masked client-side behind a
   per-row reveal toggle; a null pin means the account predates reversible
   storage and needs a reset before it's viewable.
   ------------------------------------------------------------------ */
function StaffDirectoryView({ onBack }) {
  const [staff, setStaff] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [revealed, setRevealed] = useState(new Set());
  const [phoneDrafts, setPhoneDrafts] = useState({});
  const [confirmingResetId, setConfirmingResetId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    return fetchStaff()
      .then((data) => setStaff(data))
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        setStaff([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleReveal = (id) =>
    setRevealed((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const savePhone = async (id) => {
    const phone = phoneDrafts[id] ?? "";
    setBusyId(id);
    setError("");
    try {
      await patchStaffPhone(id, phone.trim());
      setPhoneDrafts((d) => {
        const { [id]: _drop, ...rest } = d;
        return rest;
      });
      await load();
    } catch (err) {
      console.error("[sbm] failed to save phone", err);
      setError("Failed to save phone — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const resetPin = async (id) => {
    if (confirmingResetId !== id) {
      setConfirmingResetId(id);
      return;
    }
    setConfirmingResetId(null);
    setBusyId(id);
    setError("");
    try {
      await postResetStaffPin(id);
      setRevealed((s) => new Set(s).add(id));
      await load();
    } catch (err) {
      console.error("[sbm] failed to reset pin", err);
      setError("Failed to reset PIN — try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Staff</h1>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            background: t.white,
            color: t.edge,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <Plus size={14} /> Add staff
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: t.signal, marginTop: 0 }}>{error}</p>}

      {staff === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : staff.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No staff yet.</p>
        </Card>
      ) : (
        <Card>
          {staff.map((s) => {
            const draft = phoneDrafts[s.id] ?? s.phone ?? "";
            const dirty = draft !== (s.phone ?? "");
            const isRevealed = revealed.has(s.id);
            const busy = busyId === s.id;
            return (
              <div key={s.id} style={{ ...TILE_ROW_STYLE, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, color: t.edge, fontWeight: 600 }}>
                    {s.name}
                    {s.is_self && <span style={{ fontWeight: 400, color: t.edge2 }}> (you)</span>}
                  </span>
                  <span style={{ fontSize: 12, color: t.edge2, textTransform: "capitalize" }}>{s.role}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    placeholder="Phone"
                    value={draft}
                    onChange={(e) => setPhoneDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    style={{ ...TEXT_INPUT_STYLE, minHeight: 34, fontSize: 13, flex: 1 }}
                  />
                  {dirty && (
                    <button
                      onClick={() => savePhone(s.id)}
                      disabled={busy}
                      style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, opacity: busy ? 0.6 : 1 }}
                    >
                      Save
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: t.edge2, fontVariantNumeric: "tabular-nums" }}>
                    PIN: {s.pin ? (isRevealed ? s.pin : "••••") : "not recoverable"}
                  </span>
                  {s.pin && (
                    <button
                      onClick={() => toggleReveal(s.id)}
                      style={{ border: "none", background: "none", color: t.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
                    >
                      {isRevealed ? "Hide" : "Show"}
                    </button>
                  )}
                  <button
                    onClick={() => resetPin(s.id)}
                    disabled={busy}
                    style={{ border: "none", background: "none", color: t.edge2, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, opacity: busy ? 0.6 : 1 }}
                  >
                    {confirmingResetId === s.id ? "Click again to confirm" : "Reset PIN"}
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {showAddModal && (
        <AddStaffModal
          onClose={() => setShowAddModal(false)}
          onCreate={async (name, phone) => {
            const created = await postCreateStaff(name, phone);
            await load();
            setRevealed((s) => new Set(s).add(created.id));
            return created;
          }}
        />
      )}
    </div>
  );
}

/* "Add staff" — name + optional phone. The PIN is generated server-side and
   returned once here; it stays viewable afterward from the row's reveal
   toggle (see docs "PIN visibility" decision), so there's no separate
   one-time-only confirmation screen to build. */
function AddStaffModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await onCreate(trimmed, phone.trim());
      setCreated(result);
    } catch (err) {
      console.error("[sbm] failed to add staff", err);
      setError(err.message || "Failed to add — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add staff"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {created ? (
          <>
            <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
              {created.name} added
            </span>
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>
              Share this PIN with {created.name} to log in. You can view it again later from the Staff page.
            </p>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 2, color: t.edge, fontVariantNumeric: "tabular-nums" }}>
              {created.pin}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={onClose} style={PRIMARY_BUTTON_STYLE}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Add staff</span>
            <input
              autoFocus
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={TEXT_INPUT_STYLE}
            />
            <input
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={TEXT_INPUT_STYLE}
            />
            {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                onClick={onClose}
                style={{
                  minHeight: 40,
                  padding: "0 16px",
                  border: `1px solid ${t.frost}`,
                  borderRadius: t.radiusButton,
                  background: t.white,
                  color: t.edge2,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Site review — reached via "Show unconfirmed sites" below Tile 3.
   Every site (discovered by the main extraction or the Haiku site scan),
   with a Valid / Not valid toggle. Changes are local until "Update
   confirmed sites" — deliberately batched rather than saving per-toggle,
   so reviewing a dozen sites is a dozen taps, not a dozen round trips.
   ------------------------------------------------------------------ */
function SitesReviewView({ sites, onBack, onSaved }) {
  const [pending, setPending] = useState(() => Object.fromEntries(sites.map((s) => [s.id, s.is_confirmed])));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const runBackfill = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await postSitesBackfill();
      await onSaved();
      setScanResult(
        result.scanned === 0
          ? "No untouched calls to scan."
          : `Scanned ${result.scanned} call${result.scanned === 1 ? "" : "s"} — found ${result.sitesFound.length ? result.sitesFound.join(", ") : "no sites"}.`
      );
    } catch (err) {
      console.error("[sbm] site backfill failed", err);
      setScanResult("Scan failed — see console.");
    } finally {
      setScanning(false);
    }
  };

  const dirty = sites.some((s) => pending[s.id] !== s.is_confirmed);

  const setChoice = (id, value) => {
    setSaved(false);
    setPending((p) => ({ ...p, [id]: p[id] === value ? null : value }));
  };

  const update = async () => {
    setSaving(true);
    try {
      const changed = sites.filter((s) => pending[s.id] !== s.is_confirmed);
      await Promise.all(changed.map((s) => patchSite(s.id, { is_confirmed: pending[s.id] })));
      await onSaved();
      setSaved(true);
    } catch (err) {
      console.error("[sbm] failed to update site confirmations", err);
    } finally {
      setSaving(false);
    }
  };

  const choiceButtonStyle = (active, kind) => ({
    flex: 1,
    padding: "8px 0",
    border: `1px solid ${active ? (kind === "Y" ? t.accent : t.putty) : t.frost}`,
    borderRadius: t.radiusButton,
    background: active ? (kind === "Y" ? t.accent : t.puttyBg) : t.white,
    color: active ? (kind === "Y" ? t.white : t.putty) : t.edge2,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Review sites</h1>
        <button
          onClick={runBackfill}
          disabled={scanning}
          style={{
            flexShrink: 0,
            padding: "7px 12px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            background: t.white,
            color: t.edge2,
            fontSize: 12,
            fontWeight: 600,
            cursor: scanning ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {scanning ? "Scanning…" : "Scan existing calls"}
        </button>
      </div>
      {scanResult && <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1rem" }}>{scanResult}</p>}

      {sites.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No sites yet.</p>
        </Card>
      ) : (
        <Card style={{ marginBottom: 12 }}>
          {sites.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderTop: `1px solid ${t.frost}`,
              }}
            >
              <span style={{ flex: 1, fontSize: 14, color: t.edge }}>{s.name}</span>
              <div style={{ display: "flex", gap: 6, width: 160 }}>
                <button onClick={() => setChoice(s.id, "Y")} style={choiceButtonStyle(pending[s.id] === "Y", "Y")}>
                  Valid
                </button>
                <button onClick={() => setChoice(s.id, "N")} style={choiceButtonStyle(pending[s.id] === "N", "N")}>
                  Not valid
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={update}
          disabled={!dirty || saving}
          style={{
            padding: "10px 18px",
            border: "none",
            borderRadius: t.radiusButton,
            background: t.accent,
            color: t.white,
            fontSize: 14,
            fontWeight: 700,
            cursor: !dirty || saving ? "not-allowed" : "pointer",
            opacity: !dirty || saving ? 0.5 : 1,
          }}
        >
          {saving ? "Updating…" : "Update confirmed sites"}
        </button>
        {saved && !dirty && <span style={{ fontSize: 13, color: t.edge2 }}>Updated.</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Login gate — name + short PIN, session cookie set by POST /api/login.
   See src/lib/auth.ts. Shown in place of the whole dashboard until
   GET /api/me succeeds.
   ------------------------------------------------------------------ */
function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !pin.trim()) {
      setError("Enter your name and PIN.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const me = await postLogin(name.trim(), pin.trim());
      onLogin(me);
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: t.pane, minHeight: "100vh", fontFamily: t.body, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.25rem" }}>
      <form
        onSubmit={submit}
        style={{ width: "100%", maxWidth: 340, background: t.white, border: `1px solid ${t.frost}`, borderRadius: t.radiusCard, padding: "1.75rem 1.5rem", display: "flex", flexDirection: "column", gap: 12 }}
      >
        <span style={{ fontFamily: t.display, fontSize: 18, fontWeight: 500, color: t.edge, marginBottom: 4 }}>
          Simple Business Manager
        </span>
        <input
          autoFocus
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <button type="submit" disabled={submitting} style={{ ...PRIMARY_BUTTON_STYLE, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}

/* Popup for self-service PIN reset — requires the current PIN (not the
   admin X-SBM-Key), same modal idiom as AssignTeamModal/VoiceNoteModal. */
function ResetPinModal({ onClose, onReset }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!/^\d{4,6}$/.test(newPin)) {
      setError("New PIN must be 4-6 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PIN and confirmation don't match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onReset(currentPin, newPin);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to reset PIN.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reset PIN"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Reset PIN</span>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          placeholder="Current PIN"
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder="New PIN (4-6 digits)"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder="Confirm new PIN"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: "0 16px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Popup for self-service phone update — no current-value confirmation (a
   phone number isn't a credential, unlike the PIN reset above). Updates
   users.phone, which the assign-team roster and a site's Team card both
   read live. */
function UpdatePhoneModal({ currentPhone, onClose, onSave }) {
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(phone.trim());
      onClose();
    } catch (err) {
      setError(err.message || "Failed to update phone.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Update phone"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Update phone</span>
        <input
          autoFocus
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <p style={{ fontSize: 12, color: t.edge2, margin: 0 }}>
          Shown wherever you're listed as a site's assigned team member.
        </p>
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: "0 16px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Account menu — standard top-right "my account" pattern, in the blue
   header. Tap the name to open a small dropdown (Update phone, Reset PIN,
   Log out); click-outside or Escape closes it. Reset PIN opens the same
   ResetPinModal used before, just triggered from here now. */
function AccountMenu({ me, onLogout, onResetPin, onUpdatePhone }) {
  const [open, setOpen] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menuItemStyle = {
    display: "flex",
    alignItems: "center",
    width: "100%",
    padding: "10px 14px",
    border: "none",
    background: "none",
    color: t.edge,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: t.body,
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          border: "none",
          borderRadius: t.radiusButton,
          background: open ? "rgba(255,255,255,0.16)" : "none",
          color: t.white,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: t.body,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <User size={14} />
        {me?.name}
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease" }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 170,
            background: t.white,
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            boxShadow: "0 8px 24px rgba(20,24,31,0.22)",
            overflow: "hidden",
            zIndex: 50,
          }}
        >
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setShowPhoneModal(true);
            }}
            style={menuItemStyle}
          >
            Update phone
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setShowResetModal(true);
            }}
            style={{ ...menuItemStyle, borderTop: `1px solid ${t.frost}` }}
          >
            Reset PIN
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            style={{ ...menuItemStyle, borderTop: `1px solid ${t.frost}` }}
          >
            Log out
          </button>
        </div>
      )}

      {showResetModal && <ResetPinModal onClose={() => setShowResetModal(false)} onReset={onResetPin} />}
      {showPhoneModal && (
        <UpdatePhoneModal currentPhone={me?.phone} onClose={() => setShowPhoneModal(false)} onSave={onUpdatePhone} />
      )}
    </div>
  );
}

/* Calls Transcripts page — everything that used to sit directly on the
   admin home feed, relocated behind the "Calls logged" tile. Adds the two
   summary tiles (Important/Regular — see CallTypeBadge above for the same
   split) and per-card badges; todo toggling, park, and download are
   unchanged from the old home feed. */
function CallsPageView({ calls, onBack, onOpen, onToggle, onPark, busyIds }) {
  const [filter, setFilter] = useState(null); // null = all, "important", "regular"

  const importantCalls = useMemo(() => calls.filter((c) => c.call_type !== "low_signal"), [calls]);
  const regularCalls = useMemo(() => calls.filter((c) => c.call_type === "low_signal"), [calls]);
  const shown = filter === "important" ? importantCalls : filter === "regular" ? regularCalls : calls;
  const ordered = useMemo(() => sortCalls(shown), [shown]);

  const toggle = (key) => setFilter((current) => (current === key ? null : key));

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>Calls</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <button onClick={() => toggle("important")} style={{ all: "unset", cursor: "pointer", display: "block" }}>
          <Card style={{ borderColor: filter === "important" ? t.accent : t.frost }}>
            <TileLabel>Important calls</TileLabel>
            <div style={{ ...TILE_ROW_STYLE, borderTop: "none", padding: "6px 0 0" }}>
              <span style={TILE_NUMBER_STYLE}>{importantCalls.length}</span>
            </div>
          </Card>
        </button>
        <button onClick={() => toggle("regular")} style={{ all: "unset", cursor: "pointer", display: "block" }}>
          <Card style={{ borderColor: filter === "regular" ? t.accent : t.frost }}>
            <TileLabel>Regular calls</TileLabel>
            <div style={{ ...TILE_ROW_STYLE, borderTop: "none", padding: "6px 0 0" }}>
              <span style={TILE_NUMBER_STYLE}>{regularCalls.length}</span>
            </div>
          </Card>
        </button>
      </div>

      {calls.length === 0 ? (
        <EmptyState />
      ) : ordered.length === 0 ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>No {filter} calls.</p>
      ) : (
        <>
          {ordered.map((call, i) => (
            <CallCard
              key={call.id}
              index={i}
              call={call}
              showTypeBadge
              onOpen={onOpen}
              onToggle={onToggle}
              onPark={onPark}
              busyIds={busyIds}
            />
          ))}
          <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
            <DownloadButton calls={ordered} label={filter ?? "all"}>
              Download {filter ?? "everything"}
            </DownloadButton>
          </div>
        </>
      )}
    </div>
  );
}

/* Recordings — admin/superadmin-only control, separate from the Calls page
   above. Where Calls is day-to-day todo triage (checklist rows, park/close),
   this is a review surface over the raw recordings themselves: play the
   audio back, see each extracted todo phrased as a plain sentence
   (formatTodoSentence) rather than a checkbox. Reuses the same `calls` list
   already loaded for an admin session — no separate fetch. Recording
   playback itself is scoped server-side (GET /api/calls/:id/recording,
   src/handlers/site-media.ts); this view is only ever reachable by
   admin/superadmin in the first place, same as CallsPageView. */
function RecordingsPageView({ calls, onBack, onOpen }) {
  const ordered = useMemo(() => sortCalls(calls), [calls]);

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        Recordings
      </h1>

      {ordered.length === 0 ? (
        <EmptyState />
      ) : (
        ordered.map((call) => (
          <Card key={call.id} style={{ marginBottom: 12 }}>
            <button
              onClick={() => onOpen(call.id)}
              style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 500, color: t.edge }}>
                  {call.client_name}
                </span>
                <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>
                  {fmtDate(call.recorded_at)}
                  {call.duration_s ? ` · ${Math.round(call.duration_s / 60)} min` : ""}
                </span>
              </div>
            </button>

            {call.transcript == null ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, color: t.edge2, fontSize: 13, marginTop: 8 }}>
                <FileText size={16} />
                Transcription in progress
              </span>
            ) : (
              <AudioPlayer src={`/api/calls/${call.id}/recording`} />
            )}

            {call.todos.length > 0 && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: t.edge2 }}>
                {call.todos.map((td) => (
                  <li key={td.id}>{formatTodoSentence(td)}</li>
                ))}
              </ul>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

export default function SimpleBusinessManager() {
  const [calls, setCalls] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [sitesAttention, setSitesAttention] = useState([]);
  const [allSites, setAllSites] = useState([]);
  const [staffCount, setStaffCount] = useState(0);
  const [callsCount, setCallsCount] = useState(0);
  /* Open (assigned, not done) site tasks — scoped server-side to "mine" for
     a staff session, or every open assignment business-wide for admin/
     superadmin. See fetchOpenSiteTasks and migration 0013. */
  const [openSiteTasks, setOpenSiteTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState({ name: "home" });
  const [busyIds, setBusyIds] = useState(new Set());

  /* Fetched on demand when a `staff` session opens a call from their site's
     timeline — their bulk `calls` list is never loaded (see the `me` effect
     below), so this is the only path to a call's transcript for them. */
  const [fetchedCall, setFetchedCall] = useState(null);

  /* undefined = checking, null = logged out, object = logged in. See
     src/lib/auth.ts / LoginScreen above — additive session-cookie auth,
     the whole dashboard is now gated behind it. */
  const [me, setMe] = useState(undefined);

  /* `staff` lands on their personal workflow tiles instead of the office
     dashboard — migration 0011 (role split) plus migration 0013 (the
     workflow tiles themselves). admin/superadmin get the dashboard unchanged. */
  const homeView = me?.role === "staff" ? { name: "staff-home" } : { name: "home" };

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch((err) => {
        console.error("[sbm] session check failed", err);
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    if (me.role === "staff") {
      // No calls/escalations/attention tile for staff — they only ever see
      // their own assigned sites and their own open workflow tasks, both
      // already filtered server-side.
      setView({ name: "staff-home" });
      Promise.all([fetchSites(), fetchOpenSiteTasks()])
        .then(([sitesData, tasksData]) => {
          if (cancelled) return;
          setAllSites(sitesData);
          setOpenSiteTasks(tasksData);
        })
        .catch((err) => {
          console.error("[sbm] failed to load sites", err);
          if (!cancelled) setLoadError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    setView({ name: "home" });
    Promise.all([
      fetchCalls(),
      fetchEscalations(),
      fetchSitesAttention(),
      fetchSites(),
      fetchStaffRoster(),
      fetchCallsCount(),
      fetchOpenSiteTasks(),
    ])
      .then(([callsData, escalationsData, attentionData, sitesData, staffData, callsCountData, tasksData]) => {
        if (cancelled) return;
        setCalls(callsData);
        setEscalations(escalationsData);
        setSitesAttention(attentionData);
        setAllSites(sitesData);
        setStaffCount(staffData.length);
        setCallsCount(callsCountData.count);
        setOpenSiteTasks(tasksData);
      })
      .catch((err) => {
        console.error("[sbm] failed to load calls", err);
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  const refreshOpenSiteTasks = useCallback(async () => {
    const tasksData = await fetchOpenSiteTasks();
    setOpenSiteTasks(tasksData);
  }, []);

  const onLogout = useCallback(async () => {
    await postLogout();
    setMe(null);
    setView({ name: "home" });
  }, []);

  const onResetPin = useCallback(async (currentPin, newPin) => {
    await postResetPin(currentPin, newPin);
  }, []);

  const onUpdatePhone = useCallback(async (phone) => {
    const result = await postUpdateMyPhone(phone);
    setMe((m) => (m ? { ...m, phone: result.phone } : m));
  }, []);

  const refreshSites = useCallback(async () => {
    const [sitesData, attentionData] = await Promise.all([fetchSites(), fetchSitesAttention()]);
    setAllSites(sitesData);
    setSitesAttention(attentionData);
  }, []);

  /* "Add new site": create, refresh the site list so SiteView can find the
     new record, then hand off straight into SiteView — team assignment and
     photo/video/voice-note upload already exist there, no need to
     duplicate that flow in the creation modal itself. */
  const onSiteCreated = useCallback(
    async (name, address, pocName) => {
      const site = await postCreateSite(name, address, pocName);
      await refreshSites();
      setView({ name: "site", site: site.name, from: { name: "sites-directory" }, autoEdit: true });
      return site;
    },
    [refreshSites]
  );

  const onAddEscalation = useCallback(async (text) => {
    const created = await postEscalation(text, null);
    setEscalations((es) => [...es, created]);
  }, []);

  const onCloseEscalation = useCallback(async (id) => {
    setEscalations((es) => es.filter((e) => e.id !== id));
    try {
      await closeEscalationApi(id);
    } catch (err) {
      console.error("[sbm] failed to close escalation", err);
      fetchEscalations().then(setEscalations).catch(() => {});
    }
  }, []);

  /* Tiles 1 & 2 — docs/ADDITIONAL_FEATURES_M0.md "Phase 1 home page".
     "Open" is a live snapshot (open items don't have a single day); "closed"
     is scoped to today specifically, via completed_at. */
  const todayCounts = useMemo(() => {
    const all = calls.flatMap((c) => c.todos);
    const now = today();
    const todayKey = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      open: all.filter((td) => td.status === "open").length,
      closed: all.filter((td) => td.status === "done" && dayKey(td.completed_at) === todayKey).length,
    };
  }, [calls]);

  /* Calendar month currently browsed — defaults to this month. Full month,
     not a rolling window: a fixed 28-day window didn't show a complete
     month and gave no way to look at an earlier one. */
  const [calMonth, setCalMonth] = useState(() => {
    const d = today();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const monthDays = useMemo(() => {
    const byDay = {};
    for (const c of calls) {
      const k = dayKey(c.recorded_at);
      byDay[k] = (byDay[k] ?? 0) + 1;
    }
    const now = today();
    const todayIso = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    const { year, month } = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoDate(year, month, day);
      const future = iso > todayIso;
      days.push({ date: iso, held: future ? null : true, calls: byDay[iso] ?? 0, future });
    }
    return days;
  }, [calls, calMonth]);

  const yearOptions = useMemo(() => {
    const current = today().getFullYear();
    const earliest = calls.reduce((min, c) => {
      const y = c.recorded_at ? new Date(c.recorded_at).getFullYear() : current;
      return Math.min(min, y);
    }, current);
    const out = [];
    for (let y = Math.min(earliest, current - 1); y <= current + 1; y++) out.push(y);
    return out;
  }, [calls]);

  const goToMonth = useCallback((year, month) => {
    if (month < 0) {
      year -= 1;
      month = 11;
    } else if (month > 11) {
      year += 1;
      month = 0;
    }
    setCalMonth({ year, month });
  }, []);

  /* Optimistic write, rolled back if D1 rejects it. */
  const mutate = useCallback(async (todo, patch) => {
    const prev = { status: todo.status, completed_at: todo.completed_at };
    setBusyIds((s) => new Set(s).add(todo.id));
    setCalls((cs) =>
      cs.map((c) => ({ ...c, todos: c.todos.map((td) => (td.id === todo.id ? { ...td, ...patch } : td)) }))
    );
    try {
      await patchTodo(todo.id, patch);
    } catch {
      setCalls((cs) =>
        cs.map((c) => ({ ...c, todos: c.todos.map((td) => (td.id === todo.id ? { ...td, ...prev } : td)) }))
      );
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(todo.id);
        return n;
      });
    }
  }, []);

  const onToggle = useCallback(
    (todo) =>
      mutate(
        todo,
        todo.status === "done"
          ? { status: "open", completed_at: null }
          : { status: "done", completed_at: new Date().toISOString() }
      ),
    [mutate]
  );

  const onPark = useCallback(
    (todo) => mutate(todo, { status: todo.status === "snoozed" ? "open" : "snoozed" }),
    [mutate]
  );

  const bulkCall = view.name === "call" ? calls.find((c) => c.id === view.id) : null;

  useEffect(() => {
    if (view.name !== "call" || bulkCall) {
      setFetchedCall(null);
      return;
    }
    // undefined = fetch in flight, distinct from null ("fetched, not found /
    // not permitted") so the render below can tell the two apart.
    setFetchedCall(undefined);
    let cancelled = false;
    fetchCall(view.id)
      .then((data) => {
        if (!cancelled) setFetchedCall(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load call", err);
        if (!cancelled) setFetchedCall(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.name, view.id, bulkCall]);

  const openCall = bulkCall ?? (view.name === "call" ? fetchedCall : null);

  const shell = (children) => (
    <div style={{ background: t.pane, minHeight: "100vh", fontFamily: t.body, color: t.edge }}>
      <style>{`
        *{box-sizing:border-box}
        button:focus-visible,a:focus-visible{outline:2px solid ${t.edge};outline-offset:2px}

        /* Cards read top-to-bottom in urgency order; the stagger says so. */
        @keyframes sbm-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .sbm-rise{animation:sbm-rise 260ms cubic-bezier(.22,.61,.36,1) both}

        /* Calendar days drawing in, staggered left to right. */
        @keyframes sbm-pane{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}
        .sbm-pane{animation:sbm-pane 300ms cubic-bezier(.22,.61,.36,1) both}

        .sbm-day{transition:border-color 140ms ease,background 140ms ease}
        @media (hover:hover){.sbm-day:hover{border-color:rgba(255,255,255,0.4)}}

        .sbm-tooltip{
          position:absolute;bottom:100%;left:50%;
          transform:translateX(-50%) translateY(-4px);
          margin-bottom:2px;padding:4px 8px;border-radius:4px;
          background:${t.white};color:${t.edge};
          font-size:11px;font-weight:500;white-space:nowrap;
          opacity:0;pointer-events:none;transition:opacity 120ms ease;z-index:10;
          box-shadow:0 2px 8px rgba(0,0,0,0.25);
        }
        @media (hover:hover){
          .sbm-tip:hover .sbm-tooltip{opacity:1}
        }
        .sbm-tip:focus-visible .sbm-tooltip{opacity:1}

        /* Unread-activity badge — the one deliberate pulse the design
           allows (CLAUDE.md): flags the other side having posted since you
           last did, stops the moment it's resolved (the badge just doesn't
           render once the count is back to zero). */
        @keyframes sbm-unread-pulse{
          0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.55)}
          50%{box-shadow:0 0 0 6px rgba(34,197,94,0)}
        }
        .sbm-unread-glow{animation:sbm-unread-pulse 2s ease-in-out infinite}

        /* Not a blanket kill: the frost must still change instantly, or
           completion becomes ambiguous. Only entrances are dropped. */
        @media (prefers-reduced-motion: reduce){
          .sbm-rise,.sbm-pane{animation:none}
          .sbm-day{transition:none}
          .sbm-unread-glow{animation:none;box-shadow:0 0 0 3px rgba(34,197,94,0.35)}
        }
      `}</style>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>{children}</main>
    </div>
  );

  if (me === undefined) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  if (me === null) return <LoginScreen onLogin={setMe} />;

  if (loading) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  if (loadError) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Couldn't load calls: {loadError}</p>);

  if (view.name === "call" && !bulkCall && fetchedCall === undefined) {
    return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  }

  if (openCall)
    return shell(
      <CallDetail
        call={openCall}
        onBack={() => setView(view.from ?? homeView)}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
        canManage={me.role !== "staff"}
      />
    );

  if (view.name === "call") {
    return shell(
      <div>
        <BackLink onClick={() => setView(view.from ?? homeView)}>Back</BackLink>
        <p style={{ fontSize: 14, color: t.edge2 }}>Couldn't load that call.</p>
      </div>
    );
  }

  if (view.name === "day")
    return shell(
      <DayView
        date={view.date}
        calls={calls}
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "day", date: view.date } })}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
      />
    );

  if (view.name === "site")
    return shell(
      <SiteView
        site={view.site}
        siteRecord={allSites.find((s) => s.name === view.site)}
        calls={calls}
        onBack={() => setView(view.from ?? homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "site", site: view.site, from: view.from } })}
        onSiteUpdated={refreshSites}
        autoEditDetails={Boolean(view.autoEdit)}
        canManage={me.role !== "staff"}
        myOpenTasks={openSiteTasks.filter((tk) => tk.site_name === view.site)}
        onTasksChanged={refreshOpenSiteTasks}
      />
    );

  if (view.name === "workflow-site-list")
    return shell(
      <WorkflowCategorySiteList
        tasks={openSiteTasks}
        category={view.category}
        onBack={() => setView(view.from ?? homeView)}
        onOpenSite={(site) => setView({ name: "site", site, from: view })}
      />
    );

  if (view.name === "calls")
    return shell(
      <CallsPageView
        calls={calls}
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "calls" } })}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
      />
    );

  if (view.name === "recordings")
    return shell(
      <RecordingsPageView
        calls={calls}
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "recordings" } })}
      />
    );

  if (view.name === "sites-review")
    return shell(<SitesReviewView sites={allSites} onBack={() => setView(homeView)} onSaved={refreshSites} />);

  if (view.name === "sites-directory")
    return shell(
      <>
        {me.role === "staff" && (
          <div style={{ background: t.accent, margin: "-2rem -1.25rem 1.5rem", padding: "1.25rem 1.25rem 1.5rem" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 600, color: t.white }}>
                Simple Business Manager
              </span>
              <AccountMenu me={me} onLogout={onLogout} onResetPin={onResetPin} onUpdatePhone={onUpdatePhone} />
            </header>
          </div>
        )}
        <SitesDirectoryView
          onBack={() => setView(homeView)}
          onOpenSite={(site) => setView({ name: "site", site, from: { name: "sites-directory" } })}
          onSiteCreated={onSiteCreated}
          canManage={me.role !== "staff"}
          isHome={me.role === "staff"}
        />
      </>
    );

  if (view.name === "staff-directory") return shell(<StaffDirectoryView onBack={() => setView(homeView)} />);

  if (view.name === "staff-home")
    return shell(
      <>
        <div style={{ background: t.accent, margin: "-2rem -1.25rem 1.5rem", padding: "1.25rem 1.25rem 1.5rem" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 600, color: t.white }}>
              Simple Business Manager
            </span>
            <AccountMenu me={me} onLogout={onLogout} onResetPin={onResetPin} onUpdatePhone={onUpdatePhone} />
          </header>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            marginBottom: "1.5rem",
          }}
        >
          <WorkflowTilesRow
            tasks={openSiteTasks}
            onOpenCategory={(category) => setView({ name: "workflow-site-list", category, from: { name: "staff-home" } })}
          />
        </div>

        {openSiteTasks.length === 0 && (
          <p style={{ fontSize: 14, color: t.edge2, marginBottom: "1.5rem" }}>Nothing assigned right now.</p>
        )}

        <button
          onClick={() => setView({ name: "sites-directory" })}
          style={{ all: "unset", cursor: "pointer", fontSize: 13, fontWeight: 600, color: t.accent }}
        >
          All my sites →
        </button>
      </>
    );

  return shell(
    <>
      <div style={{ background: t.accent, margin: "-2rem -1.25rem 1.5rem", padding: "1.25rem 1.25rem 1.5rem" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "1.25rem",
          }}
        >
          <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 600, color: t.white }}>
            Simple Business Manager
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{fmtDate(new Date().toISOString())}</span>
            <AccountMenu me={me} onLogout={onLogout} onResetPin={onResetPin} onUpdatePhone={onUpdatePhone} />
          </div>
        </header>

        <StreakWall
          days={monthDays}
          onSelectDay={(date) => setView({ name: "day", date })}
          selected={null}
          year={calMonth.year}
          month={calMonth.month}
          yearOptions={yearOptions}
          onChangeYear={(y) => goToMonth(y, calMonth.month)}
          onChangeMonth={(m) => goToMonth(calMonth.year, m)}
          onPrevMonth={() => goToMonth(calMonth.year, calMonth.month - 1)}
          onNextMonth={() => goToMonth(calMonth.year, calMonth.month + 1)}
          todayIso={isoDate(today().getFullYear(), today().getMonth(), today().getDate())}
        />
      </div>

      {/* Home tile panel. Order (top to bottom): sites needing attention,
          escalations, staff, the dynamic workflow-category tiles (business-
          wide counts — see WorkflowTilesRow), then "open today" and "calls
          logged" at the very bottom. "Open today" moved off the top and the
          call-card feed moved to its own page (see "calls" view) — both per
          the admin-overview revision to this plan; "closed today" kept its
          original position. 2 columns on a phone; auto-widens toward one
          row as space allows. Every tile is fixed to --tile-height (see the
          Card `tile` variant) so the grid stays symmetrical regardless of
          content — list tiles (SitesAttentionTile, EscalationsTile) scroll
          internally instead of growing taller than their neighbours. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <StatCard value={todayCounts.closed} label="closed today" />
        <SitesAttentionTile
          sites={sitesAttention}
          onOpenSite={(site) => setView({ name: "site", site, from: { name: "home" } })}
          onReviewSites={() => setView({ name: "sites-review" })}
          onViewDirectory={() => setView({ name: "sites-directory" })}
          hasAnySites={allSites.length > 0}
          unconfirmedCount={allSites.filter((s) => s.is_confirmed === null).length}
          confirmedCount={allSites.filter((s) => s.is_confirmed === "Y").length}
        />
        <EscalationsTile
          escalations={escalations}
          onAdd={onAddEscalation}
          onClose={onCloseEscalation}
          busyIds={busyIds}
        />
        {(me.role === "admin" || me.role === "superadmin") && (
          <StaffTile count={staffCount} onOpen={() => setView({ name: "staff-directory" })} />
        )}
        <WorkflowTilesRow
          tasks={openSiteTasks}
          onOpenCategory={(category) => setView({ name: "workflow-site-list", category, from: { name: "home" } })}
        />
        <StatCard value={todayCounts.open} label="open today" />
        <button
          onClick={() => setView({ name: "calls" })}
          style={{ all: "unset", cursor: "pointer", display: "block" }}
          aria-label={`Calls logged — ${callsCount}`}
        >
          <Card tile>
            <TileLabel>calls logged</TileLabel>
            <div style={TILE_VALUE_ROW_STYLE}>
              <span style={TILE_NUMBER_STYLE}>{callsCount}</span>
            </div>
          </Card>
        </button>
        {/* Admin/superadmin only, same as "calls logged" — staff never load
            this home view at all (see homeView above). Separate control from
            Calls: recordings + sentence-format todos, not a todo checklist. */}
        <button
          onClick={() => setView({ name: "recordings" })}
          style={{ all: "unset", cursor: "pointer", display: "block" }}
          aria-label={`Recordings — ${callsCount}`}
        >
          <Card tile>
            <TileLabel>recordings</TileLabel>
            <div style={TILE_VALUE_ROW_STYLE}>
              <span style={TILE_NUMBER_STYLE}>{callsCount}</span>
            </div>
          </Card>
        </button>
      </div>
    </>
  );
}


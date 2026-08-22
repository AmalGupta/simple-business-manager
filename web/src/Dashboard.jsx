import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Circle,
  Check,
  CircleDashed,
  ChevronLeft,
  ChevronRight,
  FileText,
  Clock,
  Download,
  Phone,
} from "lucide-react";

/* ------------------------------------------------------------------
   Design tokens — see SCAFFOLDING.md §7 and web/src/theme.css.
   Values live in theme.css as CSS custom properties; this object is
   just the mapping inline styles read, so swapping the whole theme
   (see the retired [data-theme="float-glass"] block) touches one file.
   ------------------------------------------------------------------ */
const t = {
  pane: "var(--color-canvas)",
  edge: "var(--color-ink)",
  edge2: "var(--color-slate)",
  frost: "var(--color-line)",
  frostSoft: "var(--color-line-soft)",
  putty: "var(--color-warn)",
  puttyBg: "var(--color-warn-bg)",
  accent: "var(--color-accent)",
  signal: "var(--color-danger)",
  white: "var(--color-surface)",
  display: "var(--font-display)",
  body: "var(--font-body)",
  radius: "var(--radius-badge)",
  radiusCard: "var(--radius-card)",
  radiusButton: "var(--radius-button)",
};

/* Same-origin API, gated by the X-SBM-Key shared secret — see
   docs/BUILD_BRIEF.md "No Cloudflare Access on this worker". Baked in at
   build time (web/.env, gitignored) since this is a static SPA with no
   login step. */
const SBM_KEY = import.meta.env.VITE_SBM_API_KEY ?? "";

/* ------------------------------------------------------------------
   Dates. Everything is an ISO yyyy-mm-dd string, matching D1.
   ------------------------------------------------------------------ */
const DAY = 86400000;
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const dayKey = (iso) => (iso ? String(iso).slice(0, 10) : null);
/* Local Y/M/D -> "yyyy-mm-dd" without a toISOString() round trip — that
   round trip goes through UTC and silently shifts the date by a day in
   any timezone that isn't UTC itself (bit us for the calendar grid). */
const isoDate = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const daysUntil = (iso) => (iso ? Math.round((new Date(iso) - today()) / DAY) : null);
const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
    : "";
const fmtShort = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
const fmtLong = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

/* Urgency is the ONLY thing allowed to produce colour. */
const isUrgent = (todo) => {
  if (todo.status !== "open" || !todo.due_date) return false;
  const d = daysUntil(todo.due_date);
  return d !== null && d <= 1;
};

/* Sort rule — §4. Customer-waiting beats deadline proximity, beats recency. */
const sortCalls = (calls) =>
  [...calls].sort((a, b) => {
    if (a.customer_waiting !== b.customer_waiting) return b.customer_waiting - a.customer_waiting;
    const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    return new Date(b.recorded_at) - new Date(a.recorded_at);
  });

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

async function fetchEscalations() {
  return fetchJSON("/api/escalations");
}

async function fetchSitesAttention() {
  return fetchJSON("/api/sites/attention");
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

/* ------------------------------------------------------------------
   Report export. One row per todo, generated client-side.

   Two things that matter and are easy to get wrong:
   - Leading BOM, or Excel renders Devanagari as mojibake. Transcripts
     and todos are code-mixed, so this is not hypothetical.
   - Fields opening with = + - @ are escaped, or Excel treats them as
     formulas. A todo reading "-5mm undersized" is a live example.
   ------------------------------------------------------------------ */
const CSV_COLUMNS = [
  "call_date",
  "client",
  "phone",
  "owner",
  "todo",
  "due_date",
  "status",
  "completed_on",
  "customer_waiting",
];

function csvCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function buildReportRows(calls) {
  const rows = [];
  for (const call of calls) {
    for (const todo of call.todos) {
      rows.push([
        dayKey(call.recorded_at),
        call.client_name,
        call.client_phone ?? "",
        todo.owner === "self" ? "him" : todo.owner,
        todo.text,
        todo.due_date ?? "",
        todo.status,
        dayKey(todo.completed_at) ?? "",
        call.customer_waiting ? "yes" : "no",
      ]);
    }
  }
  return rows;
}

function downloadReport(calls, label) {
  const rows = buildReportRows(calls);
  const csv = [CSV_COLUMNS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sbm-${label}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
function StreakWall({ days, onSelectDay, selected, year, month, onChangeYear, onChangeMonth, onPrevMonth, onNextMonth, yearOptions }) {
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

          return (
            <button
              key={d.date}
              className="sbm-pane sbm-day sbm-tip"
              onClick={() => onSelectDay(d.date)}
              aria-label={`${fmtLong(d.date)}, ${d.held ? "held" : "missed"}, ${d.calls} calls`}
              aria-current={d.date === selected ? "date" : undefined}
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
                color: d.held ? "rgba(255,255,255,0.85)" : t.white,
                border: `1px solid ${d.date === selected ? t.accent : "rgba(255,255,255,0.15)"}`,
                background: d.held ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.16)",
              }}
            >
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{WEEKDAY_LABELS[dow]}</span>
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
                    background: "rgba(255,255,255,0.85)",
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
function TodoRow({ todo, onToggle, onPark, busy }) {
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
        onClick={() => onToggle(todo)}
        disabled={busy}
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

      {!done && (
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

function Card({ children, style, className }) {
  return (
    <div
      className={className}
      style={{
        background: t.white,
        border: `1px solid ${t.frost}`,
        borderRadius: t.radiusCard,
        padding: "1rem 1.25rem",
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
function CallCard({ call, onOpen, onToggle, onPark, busyIds, index = 0 }) {
  const visible = call.todos.filter((td) => td.status !== "done");
  const done = call.todos.filter((td) => td.status === "done");

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
          {call.customer_waiting ? <WaitingTag /> : null}
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
function CallDetail({ call, onBack, onToggle, onPark, busyIds }) {
  const openTodos = call.todos.filter((td) => td.status !== "done");
  const doneTodos = call.todos.filter((td) => td.status === "done");
  const [openTranscript, setOpenTranscript] = useState(false);

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

      <Card style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: 12, color: t.edge2, marginBottom: 4 }}>Todos</div>
        {[...openTodos, ...doneTodos].map((td) => (
          <TodoRow key={td.id} todo={td} onToggle={onToggle} onPark={onPark} busy={busyIds.has(td.id)} />
        ))}
      </Card>

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
function StatCard({ value, label }) {
  return (
    <Card>
      <div style={{ fontFamily: t.display, fontSize: 32, fontWeight: 500, lineHeight: 1, color: t.edge }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: t.edge2, marginTop: 6 }}>{label}</div>
    </Card>
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
function SitesAttentionTile({ sites, onOpenSite }) {
  return (
    <Card>
      <div style={{ fontSize: 12, color: t.edge2, marginBottom: 4 }}>Sites needing attention</div>
      {sites.length === 0 && <p style={{ fontSize: 13, color: t.edge2, margin: "10px 0 0" }}>Nothing needs attention.</p>}
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
            padding: "10px 0",
            margin: 0,
            border: "none",
            borderTop: `1px solid ${t.frost}`,
            background: "none",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: t.body,
          }}
        >
          <span style={{ fontSize: 14, color: t.edge }}>{s.name}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.edge2 }}>
            <span>
              {s.open_count} open · {s.oldest_age_days}d
            </span>
          </span>
        </button>
      ))}
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

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: t.edge2 }}>Escalations</span>
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
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 8, padding: "10px 0", borderTop: `1px solid ${t.frost}` }}>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="What needs attention?"
            style={{
              flex: 1,
              minHeight: 40,
              padding: "0 10px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              fontFamily: t.body,
              fontSize: 14,
              color: t.edge,
              background: t.white,
            }}
          />
          <button
            onClick={submit}
            disabled={saving || !text.trim()}
            style={{
              minHeight: 40,
              padding: "0 14px",
              border: "none",
              borderRadius: t.radiusButton,
              background: t.accent,
              color: t.white,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
              opacity: saving || !text.trim() ? 0.6 : 1,
            }}
          >
            Add
          </button>
        </div>
      )}

      {escalations.length === 0 ? (
        <p style={{ fontSize: 13, color: t.edge2, margin: "10px 0 0" }}>Nothing escalated.</p>
      ) : (
        escalations.map((e) => (
          <div
            key={e.id}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${t.frost}` }}
          >
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
    </Card>
  );
}

/* ------------------------------------------------------------------
   Site view — drilldown from Tile 3. Same shape as DayView, filtered by
   site instead of date.
   ------------------------------------------------------------------ */
function SiteView({ site, calls, onBack, onOpen, onToggle, onPark, busyIds }) {
  const siteCalls = useMemo(
    () => sortCalls(calls.filter((c) => c.sites?.includes(site))),
    [calls, site]
  );

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {site}
      </h1>

      {siteCalls.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No calls recorded for this site.</p>
        </Card>
      ) : (
        siteCalls.map((call, i) => (
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

export default function SimpleBusinessManager() {
  const [calls, setCalls] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [sitesAttention, setSitesAttention] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState({ name: "home" });
  const [busyIds, setBusyIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCalls(), fetchEscalations(), fetchSitesAttention()])
      .then(([callsData, escalationsData, attentionData]) => {
        if (cancelled) return;
        setCalls(callsData);
        setEscalations(escalationsData);
        setSitesAttention(attentionData);
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
  }, []);

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

  const openCall = view.name === "call" ? calls.find((c) => c.id === view.id) : null;
  const ordered = useMemo(() => sortCalls(calls), [calls]);

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

        /* Not a blanket kill: the frost must still change instantly, or
           completion becomes ambiguous. Only entrances are dropped. */
        @media (prefers-reduced-motion: reduce){
          .sbm-rise,.sbm-pane{animation:none}
          .sbm-day{transition:none}
        }
      `}</style>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>{children}</main>
    </div>
  );

  if (loading) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  if (loadError) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Couldn't load calls: {loadError}</p>);

  if (openCall)
    return shell(
      <CallDetail
        call={openCall}
        onBack={() => setView(view.from ?? { name: "home" })}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
      />
    );

  if (view.name === "day")
    return shell(
      <DayView
        date={view.date}
        calls={calls}
        onBack={() => setView({ name: "home" })}
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
        calls={calls}
        onBack={() => setView({ name: "home" })}
        onOpen={(id) => setView({ name: "call", id, from: { name: "site", site: view.site } })}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
      />
    );

  return shell(
    <>
      <div style={{ background: t.edge, margin: "-2rem -1.25rem 1.5rem", padding: "1.25rem 1.25rem 1.5rem" }}>
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
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{fmtDate(new Date().toISOString())}</span>
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
        />
      </div>

      {/* The 4-tile panel — docs/ADDITIONAL_FEATURES_M0.md "Phase 1 home page".
          2 columns on a phone; auto-widens toward one row as space allows,
          so desktop gets a single row without a separate breakpoint.
          align-items:start keeps each card its own natural height instead of
          stretching short stat cards to match the taller list cards. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          alignItems: "start",
          marginBottom: "1.5rem",
        }}
      >
        <StatCard value={todayCounts.open} label="open today" />
        <StatCard value={todayCounts.closed} label="closed today" />
        <SitesAttentionTile sites={sitesAttention} onOpenSite={(site) => setView({ name: "site", site })} />
        <EscalationsTile
          escalations={escalations}
          onAdd={onAddEscalation}
          onClose={onCloseEscalation}
          busyIds={busyIds}
        />
      </div>

      {ordered.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {ordered.map((call, i) => (
            <CallCard
              key={call.id}
              index={i}
              call={call}
              onOpen={(id) => setView({ name: "call", id, from: { name: "home" } })}
              onToggle={onToggle}
              onPark={onPark}
              busyIds={busyIds}
            />
          ))}
          <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
            <DownloadButton calls={ordered} label="all">
              Download everything
            </DownloadButton>
          </div>
        </>
      )}
    </>
  );
}


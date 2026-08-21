import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Circle,
  Check,
  CircleDashed,
  ChevronLeft,
  FileText,
  Clock,
  Download,
  Phone,
} from "lucide-react";

/* ------------------------------------------------------------------
   Design tokens — see SCAFFOLDING.md §7
   Inline styles rather than Tailwind: the palette is custom, and
   arbitrary-value classes need a compiler pass we don't have here.
   ------------------------------------------------------------------ */
const t = {
  pane: "#F4F7F6",
  edge: "#17443C",
  edge2: "#5F8A82",
  frost: "#DBE6E2",
  putty: "#A89880",
  signal: "#B3261E",
  white: "#FFFFFF",
  display: "'Bricolage Grotesque', system-ui, sans-serif",
  body: "'Mukta', system-ui, sans-serif",
  radius: 2,
};

const FONTS =
  "@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600&family=Mukta:wght@400;500;600&display=swap');";

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
async function fetchCalls() {
  const res = await fetch("/api/calls", { headers: { "X-SBM-Key": SBM_KEY } });
  if (!res.ok) throw new Error(`GET /api/calls → ${res.status}`);
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
        todo.owner === "self" ? "him" : "customer",
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
        borderRadius: t.radius,
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

/* ------------------------------------------------------------------
   Streak wall — the signature element, now the entry point to a day.
   A held day is a clear pane; a missed day is etched.
   ------------------------------------------------------------------ */
function StreakWall({ days, onSelectDay, selected }) {
  const labels = ["S", "M", "T", "W", "T", "F", "S"];
  /* Pad the first row so columns line up with real weekdays. */
  const lead = new Date(days[0].date).getDay();
  const cells = [...Array(lead).fill(null), ...days];

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div
        aria-hidden="true"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          marginBottom: 4,
          fontSize: 11,
          color: t.edge2,
          textAlign: "center",
        }}
      >
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>

      <div
        role="group"
        aria-label="Daily record. Select a day to see its calls."
        style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}
      >
        {cells.map((d, i) =>
          d === null ? (
            <span key={"pad-" + i} />
          ) : (
            <button
              key={d.date}
              className="sbm-pane sbm-day"
              onClick={() => onSelectDay(d.date)}
              aria-label={`${fmtLong(d.date)}, ${d.held ? "held" : "missed"}, ${d.calls} calls`}
              aria-current={d.date === selected ? "date" : undefined}
              style={{
                animationDelay: `${Math.min(i, 27) * 12}ms`,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
                padding: 0,
                borderRadius: t.radius,
                cursor: "pointer",
                fontSize: 12,
                fontVariantNumeric: "tabular-nums",
                color: d.held ? t.edge2 : t.edge,
                border: `1px solid ${d.date === selected ? t.edge : d.held ? t.frost : "transparent"}`,
                background: d.held ? "transparent" : t.frost,
              }}
            >
              {new Date(d.date).getDate()}
              {d.calls > 0 && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 6,
                    width: 4,
                    height: 4,
                    marginLeft: -2,
                    borderRadius: "50%",
                    background: t.edge2,
                  }}
                />
              )}
            </button>
          )
        )}
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
        padding: "3px 10px",
        borderRadius: t.radius,
        border: `1px solid ${t.putty}`,
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
        borderRadius: 4,
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
        color: t.edge2,
        textDecoration: "none",
      }}
    >
      <Phone size={14} />
      {phone}
    </a>
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
          <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
            {call.client_name}
          </span>
          {call.customer_waiting ? <WaitingTag /> : null}
        </div>
        <div style={{ fontSize: 13, color: t.edge2, marginTop: 2 }}>
          {fmtDate(call.recorded_at)} · {Math.round(call.duration_s / 60)} min
        </div>
      </button>

      {[...visible, ...done].map((todo) => (
        <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onPark={onPark} busy={busyIds.has(todo.id)} />
      ))}
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
  const mine = call.todos.filter((td) => td.owner === "self");
  const theirs = call.todos.filter((td) => td.owner === "customer");
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
          <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>
            {call.client_name}
          </h1>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <Card>
          <div style={{ fontSize: 12, color: t.edge2, marginBottom: 4 }}>His todos</div>
          {mine.map((td) => (
            <TodoRow key={td.id} todo={td} onToggle={onToggle} onPark={onPark} busy={busyIds.has(td.id)} />
          ))}
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: t.edge2, marginBottom: 4 }}>Customer todos</div>
          {theirs.map((td) => (
            <TodoRow key={td.id} todo={td} onToggle={onToggle} onPark={onPark} busy={busyIds.has(td.id)} />
          ))}
        </Card>
      </div>

      {/* Unresolved is LLM output, never actionable — deliberately not checkboxes */}
      {call.unresolved.length > 0 && (
        <div style={{ borderLeft: `2px solid ${t.frost}`, paddingLeft: 14, marginBottom: "1.5rem" }}>
          <div style={{ fontSize: 12, color: t.edge2, marginBottom: 6 }}>Left unresolved on the call</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: t.edge2 }}>
            {call.unresolved.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
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
export default function SimpleBusinessManager() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState({ name: "home" });
  const [busyIds, setBusyIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchCalls()
      .then((data) => {
        if (!cancelled) setCalls(data);
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

  const counts = useMemo(() => {
    const all = calls.flatMap((c) => c.todos);
    return {
      open: all.filter((td) => td.status === "open").length,
      closed: all.filter((td) => td.status === "done").length,
    };
  }, [calls]);

  const streak = useMemo(() => {
    // Missed-day detection reads missed_deadlines, which nothing populates
    // yet — that requires the cron scanner, explicitly out of scope for this
    // milestone (see docs/BUILD_BRIEF.md "Not in this milestone"). Every day
    // reads as held until that lands.
    const missed = new Set();
    const byDay = {};
    for (const c of calls) {
      const k = dayKey(c.recorded_at);
      byDay[k] = (byDay[k] ?? 0) + 1;
    }
    const days = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today().getTime() - i * DAY).toISOString().slice(0, 10);
      days.push({ date: d, held: !missed.has(d), calls: byDay[d] ?? 0 });
    }
    let run = 0;
    for (let i = days.length - 1; i >= 0 && days[i].held; i--) run++;
    return { days, run };
  }, [calls]);

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
      <style>{`${FONTS}
        *{box-sizing:border-box}
        button:focus-visible,a:focus-visible{outline:2px solid ${t.edge};outline-offset:2px}

        /* Cards read top-to-bottom in urgency order; the stagger says so. */
        @keyframes sbm-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .sbm-rise{animation:sbm-rise 260ms cubic-bezier(.22,.61,.36,1) both}

        /* A pane drawing in is the streak incrementing. */
        @keyframes sbm-pane{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}
        .sbm-pane{animation:sbm-pane 300ms cubic-bezier(.22,.61,.36,1) both}

        .sbm-day{transition:border-color 140ms ease,background 140ms ease}
        @media (hover:hover){.sbm-day:hover{border-color:${t.edge2}}}

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

  return shell(
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "1.25rem",
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 500 }}>Simple Business Manager</span>
        <span style={{ fontSize: 13, color: t.edge2 }}>{fmtDate(new Date().toISOString())}</span>
      </header>

      <StreakWall days={streak.days} onSelectDay={(date) => setView({ name: "day", date })} selected={null} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          paddingBottom: "1.25rem",
          marginBottom: "1.5rem",
          borderBottom: `1px solid ${t.frost}`,
        }}
      >
        <div>
          <div style={{ fontFamily: t.display, fontSize: 56, fontWeight: 500, lineHeight: 1 }}>
            {streak.run}
          </div>
          <div style={{ fontSize: 13, color: t.edge2, marginTop: 6 }}>days nothing slipped</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 13, color: t.edge2, lineHeight: 1.9 }}>
          <div>{counts.open} open</div>
          <div>{counts.closed} closed</div>
        </div>
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


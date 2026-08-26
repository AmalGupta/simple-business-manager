import { Circle, Check, Clock } from "lucide-react";
import { t } from "../theme.js";
import { fmtShort, isUrgent } from "../lib/dates.js";

/* Sentence-format rendering of a structured todo — same {owner, text,
   due_date} the extraction pipeline already produces via forced tool-use
   (TodoRow below renders it as a checklist row); this just phrases it as a
   sentence for the admin Recordings review panel. No change to extraction
   itself — see docs/SCAFFOLDING.md §6. */
export function formatTodoSentence(todo) {
  const owner = todo.owner === "self" ? "He" : todo.owner;
  const due = todo.due_date ? fmtShort(todo.due_date) : "date not mentioned";
  return `${owner} is assigned ${todo.text}, to be done by ${due}`;
}

export function TodoRow({ todo, onToggle, onPark, busy, readOnly = false }) {
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

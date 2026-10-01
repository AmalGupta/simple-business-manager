import { useEffect, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { t } from "../theme.js";
import { fmtShort, isUrgent } from "../lib/dates.js";
import { useT } from "../lib/i18n.jsx";
import { useTodoPermissions } from "../lib/todoPermissions.jsx";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../styles.js";
import { TodoContext } from "./TodoContext.jsx";
import { useTodoReceipt } from "./TodoReceipt.jsx";

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

const CONFIRM_TIMEOUT_MS = 8000;

const actionBtn = { minHeight: 32, padding: "0 12px", fontSize: 12 };

/* SBM-100 — a todo is completed only through this explicit "Mark completed"
   button (no tick-box), and still needs the second "Yes, done" tap (SBM-82)
   so a double tap can't close it. Staff need the todo routed first; only an
   admin can reopen a done todo. */
export function TodoDoneAction({ todo, onToggle, busy, className }) {
  const tr = useT();
  const { canComplete, canReopen } = useTodoPermissions(todo);
  const [confirming, setConfirming] = useState(false);
  const done = todo.status === "done";

  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  useEffect(() => {
    setConfirming(false);
  }, [todo.id, todo.status]);

  const btnProps = className
    ? { className, style: { display: "inline-flex", alignItems: "center", gap: 6 } }
    : { style: { ...SMALL_SECONDARY_BUTTON_STYLE, ...actionBtn, display: "inline-flex", alignItems: "center", gap: 6 } };

  if (done) {
    if (!canReopen) return null;
    return (
      <button type="button" disabled={busy} onClick={() => onToggle(todo)} {...btnProps}>
        <RotateCcw size={14} />
        Reopen
      </button>
    );
  }

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: t.edge2 }}>{tr("confirmMarkDone")}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            onToggle(todo);
          }}
          style={{ ...PRIMARY_BUTTON_STYLE, ...actionBtn }}
        >
          {tr("yesDone")}
        </button>
        <button type="button" onClick={() => setConfirming(false)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, ...actionBtn }}>
          {tr("cancel")}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busy || !canComplete}
      title={canComplete ? undefined : "This task needs routing before it can be marked completed"}
      onClick={() => setConfirming(true)}
      {...btnProps}
    >
      <CheckCircle2 size={14} />
      Mark completed
    </button>
  );
}

/**
 * Checklist row — text + optional due on the right, and the Mark completed
 * button underneath when `onToggle` is passed (and not `readOnly`).
 * `embedded` = OpenTodoCard / Studio card body (no CallCard frost borders);
 * the card places the button in its own toolbar, so embedded rows omit it.
 * `showReceipt={false}` when the parent places the read receipt itself.
 */
export function TodoRow({ todo, onToggle, busy, readOnly = false, embedded = false, showReceipt = true }) {
  const done = todo.status === "done";
  const parked = todo.status === "snoozed";
  const urgent = isUrgent(todo);
  const receipt = useTodoReceipt(showReceipt ? todo : null);

  if (embedded) {
    return (
      <div
        className={`sbm-todo-row${done ? " is-done" : ""}${busy ? " is-busy" : ""}`}
        onContextMenu={receipt.onContextMenu}
      >
        <span className={`sbm-todo-row__text${done || parked ? " is-muted" : ""}`}>
          {todo.text}
          <TodoContext text={todo.context} />
        </span>

        {!done && todo.due_date ? (
          <span className={`sbm-todo-row__due${urgent ? " is-urgent" : ""}`}>
            {fmtShort(todo.due_date)}
          </span>
        ) : null}
        {receipt.ticks}
        {receipt.overlay}
      </div>
    );
  }

  const action = onToggle && !readOnly ? <TodoDoneAction todo={todo} onToggle={onToggle} busy={busy} /> : null;

  return (
    <div
      onContextMenu={receipt.onContextMenu}
      style={{
        padding: "9px 10px",
        margin: "0 -10px",
        borderTop: `1px solid ${t.frost}`,
        background: done ? t.frost : "transparent",
        opacity: busy ? 0.5 : 1,
        transition: "background 400ms ease, opacity 150ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          <TodoContext text={todo.context} />
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
        {receipt.ticks}
      </div>
      {action ? <div style={{ marginTop: 8 }}>{action}</div> : null}
      {receipt.overlay}
    </div>
  );
}

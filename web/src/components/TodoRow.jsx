import { useEffect, useState } from "react";
import { Circle, Check, Clock } from "lucide-react";
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

const confirmBtn = { minHeight: 32, padding: "0 10px", fontSize: 12 };

/* SBM-82 — marking done takes a second, deliberate tap on "Yes, done" (away
   from the check), so a double tap or a row sliding under the finger can't
   close a todo. The check is hidden until the todo is routed, and a done
   todo can only be reopened by an admin. */
function useDoneControl(todo, onToggle, readOnly) {
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

  const showCheck = done || canComplete || readOnly;
  const checkEnabled = !readOnly && (done ? canReopen : canComplete);
  const onCheck = () => {
    if (!checkEnabled) return;
    if (done) onToggle(todo);
    else setConfirming(true);
  };
  const confirm = () => {
    setConfirming(false);
    onToggle(todo);
  };
  return { done, showCheck, checkEnabled, onCheck, confirming, confirm, cancel: () => setConfirming(false) };
}

function ConfirmDone({ busy, onConfirm, onCancel }) {
  const tr = useT();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <span style={{ fontSize: 12, color: t.edge2 }}>{tr("confirmMarkDone")}</span>
      <button type="button" onClick={onConfirm} disabled={busy} style={{ ...PRIMARY_BUTTON_STYLE, ...confirmBtn }}>
        {tr("yesDone")}
      </button>
      <button type="button" onClick={onCancel} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, ...confirmBtn }}>
        {tr("cancel")}
      </button>
    </span>
  );
}

/**
 * Checklist row — text + optional due on the right.
 * `embedded` = OpenTodoCard / Studio card body (no CallCard frost borders).
 * `showReceipt={false}` when the parent places the read receipt itself.
 */
export function TodoRow({ todo, onToggle, busy, readOnly = false, embedded = false, showReceipt = true }) {
  const parked = todo.status === "snoozed";
  const urgent = isUrgent(todo);
  const { done, showCheck, checkEnabled, onCheck, confirming, confirm, cancel } = useDoneControl(todo, onToggle, readOnly);
  const receipt = useTodoReceipt(showReceipt ? todo : null);
  const Icon = done ? Check : parked ? Clock : Circle;
  const label = done ? `Reopen: ${todo.text}` : `Mark done: ${todo.text}`;

  const trailing = confirming ? (
    <ConfirmDone busy={busy} onConfirm={confirm} onCancel={cancel} />
  ) : null;

  if (embedded) {
    return (
      <div
        className={`sbm-todo-row${done ? " is-done" : ""}${busy ? " is-busy" : ""}`}
        onContextMenu={receipt.onContextMenu}
      >
        {showCheck ? (
          <button
            type="button"
            className="sbm-todo-row__check"
            onClick={onCheck}
            disabled={busy || !checkEnabled}
            aria-pressed={done}
            aria-label={label}
          >
            <Icon size={18} strokeWidth={done ? 2.5 : 1.6} />
          </button>
        ) : null}

        <span className={`sbm-todo-row__text${done || parked ? " is-muted" : ""}`}>
          {todo.text}
          <TodoContext text={todo.context} />
        </span>

        {trailing ??
          (!done && todo.due_date ? (
            <span className={`sbm-todo-row__due${urgent ? " is-urgent" : ""}`}>
              {fmtShort(todo.due_date)}
            </span>
          ) : null)}
        {receipt.ticks}
        {receipt.overlay}
      </div>
    );
  }

  return (
    <div
      onContextMenu={receipt.onContextMenu}
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
      {showCheck ? (
        <button
          onClick={onCheck}
          disabled={busy || !checkEnabled}
          aria-pressed={done}
          aria-label={label}
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
            cursor: busy ? "wait" : checkEnabled ? "pointer" : "default",
            color: done ? t.edge2 : parked ? t.putty : t.edge2,
          }}
        >
          <Icon size={17} strokeWidth={done ? 2.5 : 1.75} />
        </button>
      ) : null}

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

      {trailing ??
        (!done && todo.due_date && (
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
        ))}
      {receipt.ticks}
      {receipt.overlay}
    </div>
  );
}

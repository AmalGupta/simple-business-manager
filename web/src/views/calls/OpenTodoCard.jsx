import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { fmtShort, isUrgent } from "../../lib/dates.js";
import { useT } from "../../lib/i18n.jsx";
import { useTodoPermissions } from "../../lib/todoPermissions.jsx";
import { TodoRow } from "../../components/TodoRow.jsx";
import { TodoReceiptArea } from "../../components/TodoReceipt.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";
import { TodoAssigneeMeta, TodoCallExtractionMeta } from "./TodoFacts.jsx";
import { TodoContext } from "../../components/TodoContext.jsx";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { TaskContacts, taskContacts } from "../work/TaskContacts.jsx";
import "./OpenTodoCard.css";

export const OPEN_TODO_PAGE_SIZE = 20;

/** Newest call first — shared by Open today + My call tasks. */
export function sortTodosByRecordedAtDesc(list, getRecordedAt) {
  return [...list].sort((a, b) => {
    const at = getRecordedAt(a) ? new Date(getRecordedAt(a)).getTime() : 0;
    const bt = getRecordedAt(b) ? new Date(getRecordedAt(b)).getTime() : 0;
    return bt - at;
  });
}

/**
 * Group flat open-todo rows into one card per call (order = first appearance).
 * @returns {{ callId: string, callName: string, recordedAt: string|null, todos: object[] }[]}
 */
export function groupOpenTodosByCall(todos) {
  const list = Array.isArray(todos) ? todos : [];
  const order = [];
  const map = new Map();
  for (const td of list) {
    if (!td) continue;
    const callId = td.call_id || td.id;
    if (!map.has(callId)) {
      map.set(callId, []);
      order.push(callId);
    }
    map.get(callId).push(td);
  }
  return order.map((callId) => {
    const groupTodos = map.get(callId);
    const head = groupTodos[0];
    return {
      callId,
      callName: head.client_name || "Unknown caller",
      recordedAt: head.recorded_at ?? head.recording_date ?? null,
      todos: groupTodos,
    };
  });
}

/** Soonest due_date among non-done todos (ISO yyyy-mm-dd). */
function earliestDueDate(todos) {
  let best = null;
  for (const td of todos) {
    if (!td || td.status === "done" || !td.due_date) continue;
    if (!best || String(td.due_date) < String(best)) best = td.due_date;
  }
  return best;
}

/** Latest completed_at among the todos (ISO). */
function latestCompletedAt(todos) {
  let best = null;
  for (const td of todos) {
    if (td?.completed_at && (!best || String(td.completed_at) > String(best))) best = td.completed_at;
  }
  return best;
}

const CONFIRM_TIMEOUT_MS = 8000;
const actionBtn = { minHeight: 32, padding: "0 12px", fontSize: 12 };

/* Same SBM-82 rules as the TodoRow check: a second "Yes, done" tap, and
   disabled until the todo is routed. */
function MarkCompletedButton({ todo, onToggle, busy }) {
  const tr = useT();
  const { canComplete } = useTodoPermissions(todo);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (confirming) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--color-slate)" }}>{tr("confirmMarkDone")}</span>
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
      className="sbm-open-todo-card__btn sbm-open-todo-card__btn--secondary"
      disabled={busy || !canComplete}
      title={canComplete ? undefined : "Assign this task before marking it completed"}
      onClick={() => setConfirming(true)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      <CheckCircle2 size={14} />
      Mark completed
    </button>
  );
}

function resolveUnresolved(todos, unresolvedProp) {
  if (Array.isArray(unresolvedProp) && unresolvedProp.length > 0) return unresolvedProp;
  for (const td of todos) {
    if (Array.isArray(td.unresolved) && td.unresolved.length > 0) return td.unresolved;
  }
  return [];
}

/**
 * Studio open-todo card — collapsible call header; expanded body nests todos.
 * Collapsed summary: caller · total todos · due · blocked count.
 * Pass `todos` (preferred) or a single `todo`.
 */
export function OpenTodoCard({
  todos: todosProp,
  todo: singleTodo,
  callName,
  recordedAt: _recordedAt,
  unresolved: unresolvedProp = null,
  onOpenCall,
  onToggle,
  busy = false,
  busyIds = null,
  readOnly = false,
  staffRoster,
  currentUser = null,
  onAssign,
  onRequestSiteAssign,
  extraActions = null,
  renderExtraActions = null,
  standalone = false,
  /** List views start collapsed; call detail / popups can expand by default. */
  defaultExpanded = false,
  /** Admin Open tasks: a "Mark completed" button under each open todo. */
  showCompleteButton = false,
  /** Completed tab: header shows when it was completed instead of the due date. */
  completedView = false,
}) {
  const todos = Array.isArray(todosProp) && todosProp.length > 0 ? todosProp : singleTodo ? [singleTodo] : [];
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  if (todos.length === 0) return null;

  const head = todos[0];
  const callId = head.call_id;
  /* Client call (admin Open tasks): site name on top, caller name + phone under it. */
  const clientCall = head.call_kind === "call" && Boolean(head.caller_name || head.caller_phone);
  const siteNames = clientCall ? [...new Set(todos.map((td) => td.site_name).filter(Boolean))] : [];
  const title = siteNames.length
    ? siteNames.join(", ")
    : callName || head.client_name || "Unknown caller";
  const clientName = clientCall && siteNames.length ? head.caller_name : null;
  const clientPhone = clientCall ? head.caller_phone : null;
  const canOpen = typeof onOpenCall === "function" && Boolean(callId);

  const unresolved = resolveUnresolved(todos, unresolvedProp);
  const blockedCount = unresolved.length;
  const todoCount = todos.length;
  const dueDate = earliestDueDate(todos);
  const dueUrgent = dueDate ? isUrgent({ status: "open", due_date: dueDate }) : false;

  const isBusy = (td) => {
    if (busyIds && typeof busyIds.has === "function") return busyIds.has(td.id);
    return Boolean(busy) && todos.length === 1;
  };

  const toggle = () => setExpanded((v) => !v);

  return (
    <article
      className={`sbm-open-todo-card${standalone ? " is-standalone" : ""}${expanded ? " is-expanded" : " is-collapsed"}`}
    >
      <div className="sbm-open-todo-card__summary">
        <button
          type="button"
          className="sbm-open-todo-card__toggle"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse call card" : "Expand call card"}
          onClick={toggle}
        >
          {expanded ? <ChevronDown size={16} strokeWidth={2} /> : <ChevronRight size={16} strokeWidth={2} />}
        </button>

        <div className="sbm-open-todo-card__heading">
          <button
            type="button"
            className="sbm-open-todo-card__call"
            disabled={!canOpen}
            onClick={(e) => {
              e.stopPropagation();
              onOpenCall?.(callId);
            }}
          >
            {title}
          </button>
          {clientName || clientPhone ? (
            <TaskContacts contacts={[{ key: "caller", name: clientName, phone: clientPhone }]} />
          ) : null}
        </div>

        <dl className="sbm-open-todo-card__summary-stats" onClick={toggle}>
          <div className="sbm-open-todo-card__summary-stat">
            <dt>Todos</dt>
            <dd>{todoCount}</dd>
          </div>
          {completedView ? (
            <div className="sbm-open-todo-card__summary-stat">
              <dt>Completed</dt>
              <dd>{latestCompletedAt(todos) ? fmtShort(String(latestCompletedAt(todos)).slice(0, 10)) : "—"}</dd>
            </div>
          ) : (
            <div className="sbm-open-todo-card__summary-stat">
              <dt>Due</dt>
              <dd className={dueUrgent ? "is-urgent" : undefined}>{dueDate ? fmtShort(dueDate) : "—"}</dd>
            </div>
          )}
          <div className="sbm-open-todo-card__summary-stat">
            <dt>Blocked</dt>
            <dd className={blockedCount > 0 ? "is-blocked" : undefined}>{blockedCount}</dd>
          </div>
        </dl>
      </div>

      {expanded ? (
        <>
          <div className="sbm-open-todo-card__top">
            <TodoCallExtractionMeta todos={todos} />
            {/* Listen before routing — the recording behind these todos.
                preload="none": a page of cards must not fetch every file. */}
            {callId ? <AudioPlayer src={`/api/calls/${callId}/recording`} preload="none" /> : null}
          </div>

          <div className="sbm-open-todo-card__todos">
            {todos.map((td) => {
              const siteButton = onRequestSiteAssign ? (
                <button
                  type="button"
                  className="sbm-open-todo-card__btn sbm-open-todo-card__btn--secondary"
                  onClick={() => onRequestSiteAssign(td)}
                >
                  {td.site_id ? "Change site" : "Assign to Site"}
                </button>
              ) : null;

              const perTodoExtra = renderExtraActions
                ? renderExtraActions(td)
                : todos.length === 1
                  ? extraActions
                  : null;
              const completeButton =
                showCompleteButton && onToggle && td.status !== "done" ? (
                  <MarkCompletedButton todo={td} onToggle={onToggle} busy={isBusy(td)} />
                ) : null;
              const trailing =
                siteButton || perTodoExtra || completeButton ? (
                  <>
                    {siteButton}
                    {perTodoExtra}
                    {completeButton}
                  </>
                ) : null;

              return (
                <TodoReceiptArea key={td.id} todo={td} className="sbm-open-todo-card__todo">
                  {onToggle || readOnly ? (
                    <TodoRow
                      todo={td}
                      onToggle={onToggle}
                      busy={isBusy(td)}
                      readOnly={readOnly || !onToggle}
                      embedded
                      showReceipt={false}
                    />
                  ) : (
                    <p className="sbm-open-todo-card__text">
                      {td.text}
                      <TodoContext text={td.context} />
                    </p>
                  )}

                  <div className="sbm-open-todo-card__below-text">
                    <TaskContacts
                      contacts={taskContacts({
                        client_id: td.client_contact_id,
                        client_name: td.client_contact_name,
                        client_phone: td.client_contact_phone,
                        site_contacts: td.site_contacts,
                      }).filter((c) => !clientPhone || c.phone !== clientPhone)}
                    />
                    <TodoAssigneeMeta todo={td} />
                    {onAssign ? (
                      <div className="sbm-open-todo-card__toolbar">
                        <TodoAssignControl
                          todo={td}
                          staffRoster={staffRoster}
                          currentUser={currentUser}
                          onAssign={onAssign}
                          compact
                          hideStatus
                          extraActions={trailing}
                        />
                      </div>
                    ) : trailing ? (
                      <div className="sbm-open-todo-card__toolbar">
                        <div className="cna-todo-toolbar__actions">{trailing}</div>
                      </div>
                    ) : null}
                  </div>
                </TodoReceiptArea>
              );
            })}
          </div>

          {blockedCount > 0 ? (
            <div className="sbm-open-todo-card__unresolved">
              <div className="sbm-open-todo-card__unresolved-label">Left unresolved on the call</div>
              <ul className="sbm-open-todo-card__unresolved-list">
                {unresolved.map((u, i) => (
                  <li key={i} className="sbm-open-todo-card__unresolved-item">
                    <span className="sbm-open-todo-card__unresolved-text">{u.item}</span>
                    {u.blocked_on ? (
                      <span className="sbm-open-todo-card__unresolved-blocked">blocked on {u.blocked_on}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

export function OpenTodoLoadMore({ remaining, onLoadMore }) {
  if (remaining <= 0) return null;
  return (
    <div className="sbm-open-todo-card__load-more">
      <button
        type="button"
        onClick={onLoadMore}
        style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 36, padding: "0 16px" }}
      >
        Load more ({remaining} left)
      </button>
    </div>
  );
}

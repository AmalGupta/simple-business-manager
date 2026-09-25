import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { fmtShort, isUrgent } from "../../lib/dates.js";
import { TodoRow } from "../../components/TodoRow.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";
import { TodoAssigneeMeta, TodoCallExtractionMeta } from "./TodoFacts.jsx";
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
}) {
  const todos = Array.isArray(todosProp) && todosProp.length > 0 ? todosProp : singleTodo ? [singleTodo] : [];
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));
  if (todos.length === 0) return null;

  const head = todos[0];
  const callId = head.call_id;
  const title = callName || head.client_name || "Unknown caller";
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

        <dl className="sbm-open-todo-card__summary-stats" onClick={toggle}>
          <div className="sbm-open-todo-card__summary-stat">
            <dt>Todos</dt>
            <dd>{todoCount}</dd>
          </div>
          <div className="sbm-open-todo-card__summary-stat">
            <dt>Due</dt>
            <dd className={dueUrgent ? "is-urgent" : undefined}>{dueDate ? fmtShort(dueDate) : "—"}</dd>
          </div>
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
              const trailing =
                siteButton || perTodoExtra ? (
                  <>
                    {siteButton}
                    {perTodoExtra}
                  </>
                ) : null;

              return (
                <div key={td.id} className="sbm-open-todo-card__todo">
                  {onToggle || readOnly ? (
                    <TodoRow
                      todo={td}
                      onToggle={onToggle}
                      busy={isBusy(td)}
                      readOnly={readOnly || !onToggle}
                      embedded
                    />
                  ) : (
                    <p className="sbm-open-todo-card__text">{td.text}</p>
                  )}

                  <div className="sbm-open-todo-card__below-text">
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
                </div>
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

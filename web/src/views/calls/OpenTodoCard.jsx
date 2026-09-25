import { fmtShort, isUrgent } from "../../lib/dates.js";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { TodoRow } from "../../components/TodoRow.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";
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

function extractedByLabel(owner) {
  if (!owner) return "—";
  if (owner === "self") return "Self";
  return owner;
}

function TodoFacts({ todo }) {
  const assignees = todo.assignees ?? [];
  const assigneeNames = assignees.map((a) => a.name).filter(Boolean);
  const urgent = isUrgent(todo);
  const extractedAt = todo.created_at || todo.recorded_at || null;

  return (
    <div className="sbm-open-todo-card__facts">
      <div className="sbm-open-todo-card__labels" aria-label="Labels">
        {assigneeNames.length > 0 ? (
          assigneeNames.map((name) => (
            <span key={name} className="sbm-open-todo-card__chip">
              {name}
            </span>
          ))
        ) : (
          <span className="sbm-open-todo-card__chip is-muted">Unassigned</span>
        )}
        {todo.site_name ? <span className="sbm-open-todo-card__chip is-site">{todo.site_name}</span> : null}
        {todo.due_date ? (
          <span className={`sbm-open-todo-card__chip${urgent ? " is-urgent" : ""}`}>Due {fmtShort(todo.due_date)}</span>
        ) : null}
      </div>

      <dl className="sbm-open-todo-card__dl">
        <div className="sbm-open-todo-card__dl-row">
          <dt>Extracted by</dt>
          <dd>{extractedByLabel(todo.owner)}</dd>
        </div>
        <div className="sbm-open-todo-card__dl-row">
          <dt>Extracted</dt>
          <dd>{extractedAt ? fmtShort(extractedAt) : "—"}</dd>
        </div>
        <div className="sbm-open-todo-card__dl-row">
          <dt>Assigned</dt>
          <dd>{assigneeNames.length > 0 ? assigneeNames.join(", ") : "Unassigned"}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Studio-style open-todo card shared by OpenTodosView + MyOpenTodosView.
 * Meta (call · date) → body / TodoRow → facts (labels + extracted/assigned) → toolbar.
 */
export function OpenTodoCard({
  todo,
  callName,
  recordedAt,
  onOpenCall,
  onToggle,
  busy = false,
  staffRoster,
  currentUser = null,
  onAssign,
  onRequestSiteAssign,
}) {
  const canOpen = typeof onOpenCall === "function";

  return (
    <article className="sbm-open-todo-card">
      <div className="sbm-open-todo-card__meta">
        <button
          type="button"
          className="sbm-open-todo-card__call"
          disabled={!canOpen}
          onClick={() => onOpenCall?.(todo.call_id)}
        >
          {callName || "Unknown caller"}
        </button>
        {recordedAt ? <span className="sbm-open-todo-card__date">{fmtShort(recordedAt)}</span> : null}
      </div>

      {onToggle ? (
        <TodoRow todo={todo} onToggle={onToggle} busy={busy} />
      ) : (
        <p className="sbm-open-todo-card__text">{todo.text}</p>
      )}

      <TodoFacts todo={todo} />

      {onAssign ? (
        <div className="sbm-open-todo-card__toolbar">
          <TodoAssignControl
            todo={todo}
            staffRoster={staffRoster}
            currentUser={currentUser}
            onAssign={onAssign}
            compact
            hideStatus
            extraActions={
              onRequestSiteAssign ? (
                <button
                  type="button"
                  onClick={() => onRequestSiteAssign(todo)}
                  style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 32, padding: "0 10px" }}
                >
                  {todo.site_id ? "Change site" : "Assign to Site"}
                </button>
              ) : null
            }
          />
        </div>
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

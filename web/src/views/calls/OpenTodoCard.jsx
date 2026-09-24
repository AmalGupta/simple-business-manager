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

/**
 * Studio-style open-todo card shared by OpenTodosView + MyOpenTodosView.
 * Meta (call · date · due) → site chip → body / TodoRow → optional assign toolbar.
 */
export function OpenTodoCard({
  todo,
  callName,
  recordedAt,
  onOpenCall,
  onToggle,
  onPark,
  busy = false,
  staffRoster,
  currentUser = null,
  onAssign,
  onRequestSiteAssign,
}) {
  const urgent = isUrgent(todo);
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
        {/* Due lives on TodoRow when toggle is shown — avoid a duplicate badge. */}
        {!onToggle && todo.due_date ? (
          <span className={`sbm-open-todo-card__due${urgent ? " is-urgent" : ""}`}>{fmtShort(todo.due_date)}</span>
        ) : null}
      </div>

      {todo.site_name ? <span className="sbm-open-todo-card__site">{todo.site_name}</span> : null}

      {onToggle ? (
        <TodoRow todo={todo} onToggle={onToggle} onPark={onPark} busy={busy} />
      ) : (
        <p className="sbm-open-todo-card__text">{todo.text}</p>
      )}

      {onAssign ? (
        <div className="sbm-open-todo-card__toolbar">
          <TodoAssignControl
            todo={todo}
            staffRoster={staffRoster}
            currentUser={currentUser}
            onAssign={onAssign}
            compact
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

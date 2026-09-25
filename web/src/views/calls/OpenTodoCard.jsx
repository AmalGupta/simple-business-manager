import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { TodoRow } from "../../components/TodoRow.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";
import { TodoExtractionMeta } from "./TodoFacts.jsx";
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
 * Studio open-todo card — staff + admin:
 * top (call + highlighted Extracted by / Extracted / Assigned)
 * → checklist → assign buttons under the todo text.
 */
export function OpenTodoCard({
  todo,
  callName,
  recordedAt: _recordedAt,
  onOpenCall,
  onToggle,
  busy = false,
  readOnly = false,
  staffRoster,
  currentUser = null,
  onAssign,
  onRequestSiteAssign,
  extraActions = null,
  standalone = false,
}) {
  const canOpen = typeof onOpenCall === "function";
  const siteButton = onRequestSiteAssign ? (
    <button
      type="button"
      className="sbm-open-todo-card__btn sbm-open-todo-card__btn--secondary"
      onClick={() => onRequestSiteAssign(todo)}
    >
      {todo.site_id ? "Change site" : "Assign to Site"}
    </button>
  ) : null;

  const trailing =
    siteButton || extraActions ? (
      <>
        {siteButton}
        {extraActions}
      </>
    ) : null;

  return (
    <article className={`sbm-open-todo-card${standalone ? " is-standalone" : ""}`}>
      <div className="sbm-open-todo-card__top">
        <div className="sbm-open-todo-card__meta">
          <button
            type="button"
            className="sbm-open-todo-card__call"
            disabled={!canOpen}
            onClick={() => onOpenCall?.(todo.call_id)}
          >
            {callName || "Unknown caller"}
          </button>
        </div>
        <TodoExtractionMeta todo={todo} />
      </div>

      {onToggle || readOnly ? (
        <TodoRow
          todo={todo}
          onToggle={onToggle}
          busy={busy}
          readOnly={readOnly || !onToggle}
          embedded
        />
      ) : (
        <p className="sbm-open-todo-card__text">{todo.text}</p>
      )}

      {onAssign ? (
        <div className="sbm-open-todo-card__below-text">
          <div className="sbm-open-todo-card__toolbar">
            <TodoAssignControl
              todo={todo}
              staffRoster={staffRoster}
              currentUser={currentUser}
              onAssign={onAssign}
              compact
              hideStatus
              extraActions={trailing}
            />
          </div>
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

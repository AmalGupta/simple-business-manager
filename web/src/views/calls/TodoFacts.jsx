import { fmtShort, isUrgent } from "../../lib/dates.js";
import "./OpenTodoCard.css";

function extractedByLabel(owner) {
  if (!owner) return "—";
  if (owner === "self") return "Self";
  return owner;
}

/**
 * Labels + Extracted by / Extracted / Assigned — shared by OpenTodoCard,
 * My call tasks, site open-todos popup, and call detail.
 */
export function TodoFacts({ todo }) {
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

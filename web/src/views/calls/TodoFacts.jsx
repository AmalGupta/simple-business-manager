import { fmtShort, isUrgent } from "../../lib/dates.js";
import "./OpenTodoCard.css";

function extractedByLabel(owner) {
  if (!owner) return "—";
  if (owner === "self") return "Self";
  return owner;
}

function todoMeta(todo) {
  const assignees = todo.assignees ?? [];
  const assigneeNames = assignees.map((a) => a.name).filter(Boolean);
  const urgent = isUrgent(todo);
  const extractedAt = todo.created_at || todo.recorded_at || null;
  return {
    assigneeNames,
    urgent,
    extractedBy: extractedByLabel(todo.owner),
    extractedAt: extractedAt ? fmtShort(extractedAt) : "—",
    assigned: assigneeNames.length > 0 ? assigneeNames.join(", ") : "Unassigned",
  };
}

/** Top-row strip: Extracted by / Extracted / Assigned. */
export function TodoExtractionMeta({ todo }) {
  const { extractedBy, extractedAt, assigned } = todoMeta(todo);
  return (
    <dl className="sbm-open-todo-card__meta-facts" aria-label="Extraction details">
      <div className="sbm-open-todo-card__meta-fact">
        <dt>Extracted by</dt>
        <dd>{extractedBy}</dd>
      </div>
      <div className="sbm-open-todo-card__meta-fact">
        <dt>Extracted</dt>
        <dd>{extractedAt}</dd>
      </div>
      <div className="sbm-open-todo-card__meta-fact">
        <dt>Assigned</dt>
        <dd>{assigned}</dd>
      </div>
    </dl>
  );
}

/** Status chips under the todo text (assignees / due). */
export function TodoStatusChips({ todo }) {
  const { assigneeNames, urgent } = todoMeta(todo);
  return (
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
      {todo.due_date ? (
        <span className={`sbm-open-todo-card__chip${urgent ? " is-urgent" : ""}`}>Due {fmtShort(todo.due_date)}</span>
      ) : null}
    </div>
  );
}

/**
 * Full facts block (chips + stacked meta) — kept for any non-card surfaces.
 */
export function TodoFacts({ todo }) {
  return (
    <div className="sbm-open-todo-card__facts">
      <TodoStatusChips todo={todo} />
      <TodoExtractionMeta todo={todo} />
    </div>
  );
}

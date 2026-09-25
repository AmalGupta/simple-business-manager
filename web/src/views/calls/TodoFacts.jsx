import { fmtShort } from "../../lib/dates.js";
import "./OpenTodoCard.css";

function extractedByLabel(owner) {
  if (!owner) return "—";
  if (owner === "self") return "Self";
  return owner;
}

function todoMeta(todo) {
  const assignees = todo.assignees ?? [];
  const assigneeNames = assignees.map((a) => a.name).filter(Boolean);
  const extractedAt = todo.created_at || todo.recorded_at || null;
  return {
    extractedBy: extractedByLabel(todo.owner),
    extractedAt: extractedAt ? fmtShort(extractedAt) : "—",
    assigned: assigneeNames.length > 0 ? assigneeNames.join(", ") : "Unassigned",
  };
}

/** Top-row strip inside sbm-open-todo-card__top: Extracted by / Extracted / Assigned. */
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

/** Full facts block (meta only) — kept for any non-card surfaces. */
export function TodoFacts({ todo }) {
  return (
    <div className="sbm-open-todo-card__facts">
      <TodoExtractionMeta todo={todo} />
    </div>
  );
}

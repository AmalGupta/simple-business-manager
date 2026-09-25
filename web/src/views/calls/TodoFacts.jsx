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

/** Call-level strip: Extracted by / Extracted (Assigned stays per nested todo). */
export function TodoCallExtractionMeta({ todos }) {
  const list = Array.isArray(todos) ? todos.filter(Boolean) : [];
  if (list.length === 0) return null;

  const owners = [
    ...new Set(list.map((td) => extractedByLabel(td.owner)).filter((o) => o && o !== "—")),
  ];
  const extractedBy = owners.length === 0 ? "—" : owners.join(", ");

  let bestTs = 0;
  let bestIso = null;
  for (const td of list) {
    const iso = td.created_at || td.recorded_at || null;
    if (!iso) continue;
    const ts = new Date(iso).getTime();
    if (Number.isFinite(ts) && ts >= bestTs) {
      bestTs = ts;
      bestIso = iso;
    }
  }
  const extractedAt = bestIso ? fmtShort(bestIso) : "—";

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
    </dl>
  );
}

/** Per-todo Assigned line under a nested checklist row. */
export function TodoAssigneeMeta({ todo }) {
  const { assigned } = todoMeta(todo);
  return (
    <dl className="sbm-open-todo-card__meta-facts sbm-open-todo-card__meta-facts--compact" aria-label="Assignee">
      <div className="sbm-open-todo-card__meta-fact">
        <dt>Assigned</dt>
        <dd>{assigned}</dd>
      </div>
    </dl>
  );
}

/** Top-row strip for a single todo (legacy / non-grouped surfaces). */
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

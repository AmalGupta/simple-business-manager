import { useEffect, useMemo, useState } from "react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { suggestAssignee } from "../../lib/assignment.js";

/* Inline assign-or-reassign control for one todo, modeled on
   StageAssignRow.jsx's interaction pattern for site_tasks. The staff roster
   is already loaded app-wide by the time this renders, so — unlike
   StageAssignRow — there's no lazy per-row fetch: it's just a prop.
   `alwaysEditing` keeps the checklist+save visible with no toggle, used by
   OpenTodosView so a table row doesn't need a click to reveal its own
   assignee column.

   migration 0025: a todo can be assigned to more than one staff member, so
   this is a checkbox list rather than a single <select> — onAssign(todo.id,
   userIds: string[]) replaces the full assignee set on Save. */
export function TodoAssignControl({ todo, staffRoster, onAssign, alwaysEditing = false }) {
  const assignees = todo.assignees ?? [];
  const suggested = useMemo(() => suggestAssignee(todo.owner, staffRoster), [todo.owner, staffRoster]);

  const [editing, setEditing] = useState(alwaysEditing);
  const [checkedIds, setCheckedIds] = useState(() => {
    if (assignees.length > 0) return new Set(assignees.map((a) => a.id));
    return suggested ? new Set([suggested.id]) : new Set();
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Keep the checklist in sync if the todo's assignees change out from
  // under us (e.g. a refresh after another admin's edit) while not editing.
  useEffect(() => {
    if (editing) return;
    setCheckedIds(assignees.length > 0 ? new Set(assignees.map((a) => a.id)) : suggested ? new Set([suggested.id]) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id, assignees.map((a) => a.id).join(",")]);

  const toggle = (id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onAssign(todo.id, [...checkedIds]);
      if (!alwaysEditing) setEditing(false);
    } catch (err) {
      console.error("[sbm] failed to assign todo", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const label =
      assignees.length > 0
        ? `Assigned to ${assignees.map((a) => a.name).join(", ")}`
        : suggested
          ? `Suggested: ${suggested.name}`
          : "Unassigned";
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 12, color: t.edge2 }}>
          {label}
          {todo.due_date && ` · due ${fmtShort(todo.due_date)}`}
        </span>
        <button onClick={() => setEditing(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
          {assignees.length > 0 ? "Reassign" : "Assign"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      {staffRoster.length === 0 ? (
        <p style={{ fontSize: 12, color: t.edge2, margin: 0 }}>No staff yet — add one from the Staff page first.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto" }}>
          {staffRoster.map((s) => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: t.edge }}>
              <input type="checkbox" checked={checkedIds.has(s.id)} onChange={() => toggle(s.id)} />
              {s.name}
              {suggested?.id === s.id ? " (suggested)" : ""}
            </label>
          ))}
        </div>
      )}
      {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={submit}
          disabled={saving || staffRoster.length === 0}
          style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, opacity: saving || staffRoster.length === 0 ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {!alwaysEditing && (
          <button onClick={() => setEditing(false)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 34 }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

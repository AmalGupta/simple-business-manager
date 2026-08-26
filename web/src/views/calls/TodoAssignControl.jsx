import { useMemo, useState } from "react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { suggestAssignee } from "../../lib/assignment.js";

/* Inline assign-or-reassign control for one todo, modeled on
   StageAssignRow.jsx's interaction pattern for site_tasks. The staff roster
   is already loaded app-wide by the time this renders, so — unlike
   StageAssignRow — there's no lazy per-row fetch: it's just a prop.
   `alwaysEditing` keeps the select+save visible with no toggle, used by
   OpenTodosView so a table row doesn't need a click to reveal its own
   assignee column. */
export function TodoAssignControl({ todo, staffRoster, onAssign, alwaysEditing = false }) {
  const assignee = staffRoster.find((s) => s.id === todo.assigned_to_user_id) ?? null;
  const suggested = useMemo(() => suggestAssignee(todo.owner, staffRoster), [todo.owner, staffRoster]);

  const [editing, setEditing] = useState(alwaysEditing);
  const [staffId, setStaffId] = useState(todo.assigned_to_user_id ?? suggested?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!staffId) {
      setError("Choose a staff member.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAssign(todo.id, staffId);
      if (!alwaysEditing) setEditing(false);
    } catch (err) {
      console.error("[sbm] failed to assign todo", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 12, color: t.edge2 }}>
          {assignee
            ? `Assigned to ${assignee.name}`
            : suggested
              ? `Suggested: ${suggested.name}`
              : "No suggestion"}
          {todo.due_date && ` · due ${fmtShort(todo.due_date)}`}
        </span>
        <button onClick={() => setEditing(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
          {assignee ? "Reassign" : "Assign"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      {staffRoster.length === 0 ? (
        <p style={{ fontSize: 12, color: t.edge2, margin: 0 }}>No staff yet — add one from the Staff page first.</p>
      ) : (
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, minHeight: 34, fontSize: 13 }}>
          <option value="" disabled>
            Choose a staff member…
          </option>
          {staffRoster.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {suggested?.id === s.id ? " (suggested)" : ""}
            </option>
          ))}
        </select>
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

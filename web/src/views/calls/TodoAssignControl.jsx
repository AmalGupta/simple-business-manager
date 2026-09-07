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
   userIds: string[]) replaces the full assignee set on Save.

   `currentUser` enables a one-tap "Assign to me" for the logged-in admin
   (staff roster alone never includes them). Claiming merges the current
   user into the existing assignee set. */
export function TodoAssignControl({
  todo,
  staffRoster,
  onAssign,
  currentUser = null,
  alwaysEditing = false,
  /** Optional trailing controls (e.g. voice-note mic) rendered in the
   *  collapsed action row so they wrap with Assign/Assign-to-me on narrow
   *  screens instead of colliding in a sibling flex row. */
  extraActions = null,
}) {
  const serverAssignees = todo.assignees ?? [];
  const [localAssignees, setLocalAssignees] = useState(null);
  const assignees = localAssignees ?? serverAssignees;
  const assignablePeople = useMemo(() => {
    const roster = Array.isArray(staffRoster) ? staffRoster : [];
    if (!currentUser?.id) return roster;
    if (roster.some((s) => s.id === currentUser.id)) return roster;
    return [{ id: currentUser.id, name: currentUser.name || "You" }, ...roster];
  }, [staffRoster, currentUser]);

  const suggested = useMemo(() => suggestAssignee(todo.owner, assignablePeople), [todo.owner, assignablePeople]);
  const assignedToMe = Boolean(currentUser?.id && assignees.some((a) => a.id === currentUser.id));

  const [editing, setEditing] = useState(alwaysEditing);
  const [checkedIds, setCheckedIds] = useState(() => {
    if (assignees.length > 0) return new Set(assignees.map((a) => a.id));
    return suggested ? new Set([suggested.id]) : new Set();
  });
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");

  // Prefer server assignees when the parent refreshes; clear optimistic overlay.
  useEffect(() => {
    setLocalAssignees(null);
  }, [todo.id, serverAssignees.map((a) => a.id).join(",")]);

  // Keep the checklist in sync if the todo's assignees change out from
  // under us (e.g. a refresh after another admin's edit) while not editing.
  useEffect(() => {
    if (editing) return;
    setCheckedIds(assignees.length > 0 ? new Set(assignees.map((a) => a.id)) : suggested ? new Set([suggested.id]) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todo.id, assignees.map((a) => a.id).join(",")]);

  const peopleById = useMemo(() => {
    const map = new Map(assignablePeople.map((p) => [p.id, p]));
    for (const a of assignees) map.set(a.id, a);
    return map;
  }, [assignablePeople, assignees]);

  const resolveAssignees = (userIds) =>
    userIds.map((id) => peopleById.get(id) ?? { id, name: id === currentUser?.id ? currentUser.name || "You" : id });

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
      const ids = [...checkedIds];
      await onAssign(todo.id, ids);
      setLocalAssignees(resolveAssignees(ids));
      if (!alwaysEditing) setEditing(false);
    } catch (err) {
      console.error("[sbm] failed to assign todo", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const assignToMe = async () => {
    if (!currentUser?.id || assignedToMe) return;
    setClaiming(true);
    setError("");
    try {
      const next = new Set(assignees.map((a) => a.id));
      next.add(currentUser.id);
      const ids = [...next];
      await onAssign(todo.id, ids);
      setLocalAssignees(resolveAssignees(ids));
    } catch (err) {
      console.error("[sbm] failed to assign todo to self", err);
      setError(err.message || "Failed to assign — try again.");
    } finally {
      setClaiming(false);
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, minWidth: 0, width: "100%" }}>
        <span style={{ fontSize: 12, color: t.edge2, lineHeight: 1.4 }}>
          {label}
          {todo.due_date && ` · due ${fmtShort(todo.due_date)}`}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          {currentUser?.id && !assignedToMe && (
            <button
              type="button"
              onClick={assignToMe}
              disabled={claiming}
              style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, opacity: claiming ? 0.6 : 1 }}
            >
              {claiming ? "Assigning…" : "Assign to me"}
            </button>
          )}
          <button type="button" onClick={() => setEditing(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
            {assignees.length > 0 ? "Reassign" : "Assign"}
          </button>
          {extraActions}
        </div>
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      {assignablePeople.length === 0 ? (
        <p style={{ fontSize: 12, color: t.edge2, margin: 0 }}>No staff yet — add one from the Staff page first.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto" }}>
          {assignablePeople.map((s) => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: t.edge }}>
              <input type="checkbox" checked={checkedIds.has(s.id)} onChange={() => toggle(s.id)} />
              {s.name}
              {currentUser?.id === s.id ? " (you)" : ""}
              {suggested?.id === s.id && currentUser?.id !== s.id ? " (suggested)" : ""}
            </label>
          ))}
        </div>
      )}
      {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={submit}
          disabled={saving || assignablePeople.length === 0}
          style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, opacity: saving || assignablePeople.length === 0 ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {!alwaysEditing && (
          <button onClick={() => setEditing(false)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 34 }}>
            Cancel
          </button>
        )}
        {extraActions}
      </div>
    </div>
  );
}

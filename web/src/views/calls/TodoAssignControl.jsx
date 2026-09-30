import { useEffect, useMemo, useState } from "react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { suggestAssignee } from "../../lib/assignment.js";
import { patchWork } from "../../lib/api.js";
import { WORK_LOCATIONS, effectiveWorkLocation } from "../../lib/constants.js";

const COMPACT_PRIMARY = {
  ...PRIMARY_BUTTON_STYLE,
  minHeight: 32,
  padding: "0 10px",
  fontSize: 12,
};

const COMPACT_SECONDARY = {
  ...SMALL_SECONDARY_BUTTON_STYLE,
  minHeight: 32,
  padding: "0 10px",
};

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
   user into the existing assignee set.

   `compact` (CNA cards): one primary action + secondary siblings in a wrap-
   stable toolbar so 3-up carousel columns stay usable.

   Urgent is set here and only here — admins flag it while routing; the
   staff roster / Assigned work pages only display it. Same for Office /
   Factory (SBM-67): it picks which tab the todo lands under on the staff
   member's Assigned work. */
export function TodoAssignControl({
  todo,
  staffRoster,
  onAssign,
  currentUser = null,
  alwaysEditing = false,
  compact = false,
  /** When true, omit the "Assigned to…" status line (parent shows richer meta). */
  hideStatus = false,
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
  const canClaim = Boolean(currentUser?.id && !assignedToMe);

  /* migration 0045: every new todo lands with the router (the owner). While
     he's its only holder, "Reassign" is really "route to staff": the
     checklist starts from the suggestion without him ticked, so saving
     hands it over rather than adding a co-assignee. */
  const routerHeld = Boolean(
    currentUser?.is_todo_router &&
      !todo.routed_at &&
      assignees.length > 0 &&
      assignees.every((a) => a.id === currentUser.id)
  );
  const initialChecked = () => {
    if (routerHeld) return suggested && suggested.id !== currentUser.id ? new Set([suggested.id]) : new Set();
    if (assignees.length > 0) return new Set(assignees.map((a) => a.id));
    return suggested ? new Set([suggested.id]) : new Set();
  };

  const canMarkUrgent = currentUser?.role === "admin" || currentUser?.role === "superadmin";
  const [localUrgent, setLocalUrgent] = useState(null);
  const urgent = localUrgent ?? Boolean(todo.urgent_at);
  const [urgentChecked, setUrgentChecked] = useState(urgent);

  const [localLocation, setLocalLocation] = useState(null);
  const location = localLocation ?? effectiveWorkLocation(todo.work_location, null);
  const [locationChoice, setLocationChoice] = useState(location);

  const [editing, setEditing] = useState(alwaysEditing);
  const [checkedIds, setCheckedIds] = useState(initialChecked);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");

  // Prefer server assignees when the parent refreshes; clear optimistic overlay.
  useEffect(() => {
    setLocalAssignees(null);
  }, [todo.id, serverAssignees.map((a) => a.id).join(",")]);

  useEffect(() => {
    setLocalUrgent(null);
  }, [todo.id, todo.urgent_at]);

  useEffect(() => {
    if (!editing) setUrgentChecked(urgent);
  }, [editing, urgent]);

  useEffect(() => {
    setLocalLocation(null);
  }, [todo.id, todo.work_location]);

  useEffect(() => {
    if (!editing) setLocationChoice(location);
  }, [editing, location]);

  // Keep the checklist in sync if the todo's assignees change out from
  // under us (e.g. a refresh after another admin's edit) while not editing.
  useEffect(() => {
    if (editing) return;
    setCheckedIds(initialChecked());
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
      /* After assigning — marking urgent pins the new assignees' plan to today. */
      if (canMarkUrgent && urgentChecked !== urgent) {
        await patchWork("todo", todo.id, { urgent: urgentChecked });
        setLocalUrgent(urgentChecked);
      }
      if (canMarkUrgent && locationChoice !== location) {
        await patchWork("todo", todo.id, { work_location: locationChoice });
        setLocalLocation(locationChoice);
      }
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

  const statusLabel = routerHeld
    ? suggested && suggested.id !== currentUser.id
      ? `With you · suggested: ${suggested.name}`
      : "With you — route to staff"
    : assignees.length > 0
      ? `Assigned to ${assignees.map((a) => a.name).join(", ")}`
      : suggested
        ? `Suggested: ${suggested.name}`
        : "Unassigned";
  const statusWithDue = todo.due_date ? `${statusLabel} · due ${fmtShort(todo.due_date)}` : statusLabel;
  const urgentTag = urgent ? (
    <span style={{ fontSize: 11, fontWeight: 700, color: t.signal, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      Urgent
    </span>
  ) : null;
  /* Office is the default, so only the exception gets a tag. */
  const locationTag =
    location === "factory" ? (
      <span style={{ fontSize: 11, fontWeight: 700, color: t.edge2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Factory
      </span>
    ) : null;
  const assignLabel = routerHeld ? "Route to staff" : assignees.length > 0 ? "Reassign" : "Assign";

  if (!editing) {
    if (compact) {
      /* Status above (optional); action buttons stay on one row. */
      return (
        <div className="cna-todo-toolbar">
          {!hideStatus ? <span className="cna-todo-toolbar__status">{statusWithDue}</span> : null}
          <div className="cna-todo-toolbar__actions">
            {urgentTag}
            {locationTag}
            {canClaim ? (
              <button
                type="button"
                onClick={assignToMe}
                disabled={claiming}
                style={{ ...COMPACT_PRIMARY, opacity: claiming ? 0.6 : 1 }}
              >
                {claiming ? "Assigning…" : "Assign to me"}
              </button>
            ) : null}
            <button type="button" onClick={() => setEditing(true)} style={canClaim ? COMPACT_SECONDARY : COMPACT_PRIMARY}>
              {assignLabel}
            </button>
            {extraActions}
          </div>
          {error ? <span style={{ fontSize: 12, color: t.signal }}>{error}</span> : null}
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, minWidth: 0, width: "100%" }}>
        {!hideStatus ? <span style={{ fontSize: 12, color: t.edge2, lineHeight: 1.4 }}>{statusWithDue}</span> : null}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          {urgentTag}
          {locationTag}
          {canClaim ? (
            <button
              type="button"
              onClick={assignToMe}
              disabled={claiming}
              style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, opacity: claiming ? 0.6 : 1 }}
            >
              {claiming ? "Assigning…" : "Assign to me"}
            </button>
          ) : null}
          <button type="button" onClick={() => setEditing(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
            {assignLabel}
          </button>
          {extraActions}
        </div>
        {error ? <span style={{ fontSize: 12, color: t.signal }}>{error}</span> : null}
      </div>
    );
  }

  const editShellClass = compact ? "cna-todo-toolbar" : undefined;
  const editShellStyle = compact
    ? { display: "flex", flexDirection: "column", gap: 6, width: "100%" }
    : { display: "flex", flexDirection: "column", gap: 6, marginTop: 6 };

  return (
    <div className={editShellClass} style={editShellStyle}>
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
      {canMarkUrgent ? (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: urgentChecked ? 700 : 500,
            color: urgentChecked ? t.signal : t.edge,
          }}
        >
          <input type="checkbox" checked={urgentChecked} onChange={(e) => setUrgentChecked(e.target.checked)} />
          Urgent — due within 24 hours
        </label>
      ) : null}
      {canMarkUrgent ? (
        <div role="radiogroup" aria-label="Where the work happens" style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: t.edge }}>
          {WORK_LOCATIONS.map((loc) => (
            <label key={loc.key} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: locationChoice === loc.key ? 700 : 500 }}>
              <input
                type="radio"
                name={`work-location-${todo.id}`}
                checked={locationChoice === loc.key}
                onChange={() => setLocationChoice(loc.key)}
              />
              {loc.label}
            </label>
          ))}
        </div>
      ) : null}
      {error ? <span style={{ fontSize: 12, color: t.signal }}>{error}</span> : null}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={submit}
          disabled={saving || assignablePeople.length === 0 || (routerHeld && checkedIds.size === 0)}
          style={{
            ...(compact ? COMPACT_PRIMARY : { ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12 }),
            opacity: saving || assignablePeople.length === 0 || (routerHeld && checkedIds.size === 0) ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : routerHeld ? "Route" : "Save"}
        </button>
        {!alwaysEditing ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            style={compact ? COMPACT_SECONDARY : { ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 34 }}
          >
            Cancel
          </button>
        ) : null}
        {extraActions}
      </div>
    </div>
  );
}

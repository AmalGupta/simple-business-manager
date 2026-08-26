import { useState, useEffect } from "react";
import { t } from "../../theme.js";
import { fmtShort, isTaskDueDateUrgent } from "../../lib/dates.js";
import { TILE_ROW_STYLE, TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { fetchStaffRoster } from "../../lib/api.js";

/* One stage row inside WorkTimelinePopup — status/assignee/timestamps, plus
   an inline assign-or-reassign control. Kept as its own component so each
   row manages its own "editing" state independently. */
export function StageAssignRow({ task, onAssign }) {
  const [editing, setEditing] = useState(false);
  const [staff, setStaff] = useState(null);
  const [staffId, setStaffId] = useState(task.assigned_to_user_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing || staff !== null) return;
    fetchStaffRoster()
      .then((data) => {
        setStaff(data);
        setStaffId((current) => current || task.assigned_to_user_id || data[0]?.id || "");
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        setStaff([]);
      });
  }, [editing, staff, task.assigned_to_user_id]);

  const submit = async () => {
    if (!staffId) {
      setError("Choose a staff member.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAssign(task.id, { assigned_to_user_id: staffId, due_date: dueDate || null });
      setEditing(false);
    } catch (err) {
      console.error("[sbm] failed to assign stage", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const dueUrgent = task.status !== "done" && isTaskDueDateUrgent(task.due_date);

  let statusLine;
  if (task.status === "done") {
    statusLine = `Done by ${task.completed_by_name ?? task.assignee_name ?? "—"}${task.completed_at ? ` · ${fmtShort(task.completed_at)}` : ""}`;
  } else if (task.assignee_name) {
    statusLine = (
      <>
        Assigned to {task.assignee_name}
        {task.assigned_at ? ` · ${fmtShort(task.assigned_at)}` : ""}
        {task.due_date && (
          <span style={{ color: dueUrgent ? t.signal : "inherit", fontWeight: dueUrgent ? 700 : 400 }}>
            {" "}
            · due {fmtShort(task.due_date)}
          </span>
        )}
      </>
    );
  } else {
    statusLine = "Unassigned";
  }

  return (
    <div style={TILE_ROW_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, color: t.edge }}>{task.stage_label}</div>
          <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>{statusLine}</div>
        </div>
        <button onClick={() => setEditing((v) => !v)} style={SMALL_SECONDARY_BUTTON_STYLE}>
          {editing ? "Cancel" : task.assignee_name ? "Reassign" : "Assign"}
        </button>
      </div>
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {staff === null ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Loading staff…</p>
          ) : staff.length === 0 ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>No staff yet — add one from the Staff page first.</p>
          ) : (
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={TEXT_INPUT_STYLE}>
              <option value="" disabled>
                Choose a staff member…
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 }}>
            Due date (optional)
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={TEXT_INPUT_STYLE} />
          </label>
          {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
          <button
            onClick={submit}
            disabled={saving || !staff?.length}
            style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !staff?.length ? 0.6 : 1, alignSelf: "flex-start" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

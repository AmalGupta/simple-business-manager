import { useState } from "react";
import { t } from "../../theme.js";
import { fmtShort, isTaskDueDateUrgent } from "../../lib/dates.js";
import { TILE_ROW_STYLE, TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { patchSiteTask, fetchUnassignedSiteTasks, fetchStaffRoster } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Staff-facing banner on their own SiteView — their open task(s) at this
   site, with a one-tap "Mark done" that then offers an immediate handoff to
   any other still-unassigned stage at the same site (no admin required for
   this specific handoff — see the narrow permission in
   isUserActiveOnSiteTasks). Stages carry no order, so the handoff picker
   lists every unassigned stage, not a system-computed "next" one. */
export function MyTaskBanner({ siteId, myTasks, onChanged }) {
  const [completingId, setCompletingId] = useState(null);
  const [handoffFor, setHandoffFor] = useState(null); // the just-completed task, while picking a handoff
  const [unassigned, setUnassigned] = useState(null);
  const [pickedStageId, setPickedStageId] = useState("");
  const [staff, setStaff] = useState(null);
  const [staffId, setStaffId] = useState("");
  const [saving, setSaving] = useState(false);

  const markDone = async (task) => {
    setCompletingId(task.id);
    try {
      await patchSiteTask(task.id, { status: "done" });
      // Completion itself is done regardless of what follows — refresh
      // immediately so the app-level tile counts and this banner reflect it
      // even if the handoff picker below can't be offered for some reason.
      await onChanged();
      try {
        const [openStages, staffRoster] = await Promise.all([fetchUnassignedSiteTasks(siteId), fetchStaffRoster()]);
        if (openStages.length > 0) {
          setUnassigned(openStages);
          setStaff(staffRoster);
          setPickedStageId(openStages[0].id);
          setStaffId("");
          setHandoffFor(task);
        }
      } catch (err) {
        console.error("[sbm] failed to load handoff options — completion still succeeded", err);
      }
    } catch (err) {
      console.error("[sbm] failed to mark task done", err);
    } finally {
      setCompletingId(null);
    }
  };

  const submitHandoff = async () => {
    if (!pickedStageId || !staffId) return;
    setSaving(true);
    try {
      await patchSiteTask(pickedStageId, { assigned_to_user_id: staffId });
      await onChanged();
      setHandoffFor(null);
    } catch (err) {
      console.error("[sbm] failed to hand off stage", err);
    } finally {
      setSaving(false);
    }
  };

  const hasTasks = myTasks && myTasks.length > 0;

  return (
    <>
      {hasTasks && (
      <Card style={{ marginBottom: 12, borderColor: t.accent }}>
        <TileLabel>Your task{myTasks.length > 1 ? "s" : ""} here</TileLabel>
        {myTasks.map((task) => (
          <div key={task.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...TILE_ROW_STYLE }}>
            <div>
              <div style={{ fontSize: 14, color: t.edge }}>{task.stage_label}</div>
              {task.due_date && (
                <div style={{ fontSize: 12, color: isTaskDueDateUrgent(task.due_date) ? t.signal : t.edge2, marginTop: 2 }}>
                  Due {fmtShort(task.due_date)}
                </div>
              )}
            </div>
            <button
              onClick={() => markDone(task)}
              disabled={completingId === task.id}
              style={{ ...PRIMARY_BUTTON_STYLE, opacity: completingId === task.id ? 0.6 : 1, minHeight: 34, padding: "0 12px" }}
            >
              {completingId === task.id ? "Saving…" : "Mark done"}
            </button>
          </div>
        ))}
      </Card>
      )}

      {handoffFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hand off next stage"
          onClick={() => setHandoffFor(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,24,31,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: t.white,
              borderRadius: t.radiusCard,
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
              {handoffFor.stage_label} — done. Hand off the next stage?
            </span>
            <select value={pickedStageId} onChange={(e) => setPickedStageId(e.target.value)} style={TEXT_INPUT_STYLE}>
              {unassigned.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.stage_label}
                </option>
              ))}
            </select>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={TEXT_INPUT_STYLE}>
              <option value="" disabled>
                Choose a staff member…
              </option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={() => setHandoffFor(null)} style={SMALL_SECONDARY_BUTTON_STYLE}>
                Skip
              </button>
              <button
                onClick={submitHandoff}
                disabled={saving || !staffId}
                style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !staffId ? 0.6 : 1 }}
              >
                {saving ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useEffect, useCallback } from "react";
import { t } from "../../theme.js";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { WORKFLOW_CATEGORIES } from "../../lib/constants.js";
import { fetchSiteTasks, patchSiteTask } from "../../lib/api.js";
import { StageAssignRow } from "./StageAssignRow.jsx";

/* Admin/superadmin-only popup from SiteView's "View work timeline" button —
   all 23 stages for this site, grouped by category (display order only, not
   a pipeline — see migration 0013), each with status/assignee/timestamps
   and an inline assign control. */
export function WorkTimelinePopup({ site, onClose, onAssigned = () => {} }) {
  const [tasks, setTasks] = useState(null);

  const reload = useCallback(() => {
    if (!site?.id) return Promise.resolve();
    return fetchSiteTasks(site.id)
      .then(setTasks)
      .catch((err) => {
        console.error("[sbm] failed to load site tasks", err);
        setTasks([]);
      });
  }, [site?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const assign = async (taskId, patch) => {
    await patchSiteTask(taskId, patch);
    // Refreshes this popup's own list AND the app-level open-tasks cache the
    // home-page workflow tiles read from — without the second call, an
    // assignment made here doesn't show up on home until a full reload.
    await Promise.all([reload(), onAssigned()]);
  };

  const doneCount = tasks?.filter((tk) => tk.status === "done").length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="View work timeline"
      onClick={onClose}
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
          maxWidth: 480,
          maxHeight: "85vh",
          overflowY: "auto",
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Work timeline</span>
          {tasks && (
            <span style={{ fontSize: 12, color: t.edge2 }}>
              {doneCount}/{tasks.length} done
            </span>
          )}
        </div>
        {tasks === null ? (
          <p style={{ fontSize: 13, color: t.edge2 }}>Loading…</p>
        ) : (
          WORKFLOW_CATEGORIES.map((cat) => {
            const rows = tasks.filter((tk) => tk.category === cat.key);
            if (rows.length === 0) return null;
            return (
              <div key={cat.key}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: t.edge2,
                    margin: "10px 0 0",
                  }}
                >
                  {cat.label}
                </div>
                {rows.map((task) => (
                  <StageAssignRow key={task.id} task={task} onAssign={assign} />
                ))}
              </div>
            );
          })
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={onClose} style={SMALL_SECONDARY_BUTTON_STYLE}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

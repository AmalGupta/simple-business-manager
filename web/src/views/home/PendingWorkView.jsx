import { useMemo } from "react";
import { t } from "../../theme.js";
import { fmtShort, isTaskDueDateUrgent } from "../../lib/dates.js";
import { WORKFLOW_CATEGORY_LABEL } from "../../lib/constants.js";
import { TILE_ROW_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* Staff Pending Work — flat list of every assigned site-task stage (all
   workflow categories except admin-only intake, which is filtered server-side).
   Tap a row to open that site and work from the site page. */
export function PendingWorkView({ tasks, onBack, onOpenSite }) {
  const rows = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        if (ad !== bd) return ad - bd;
        return a.site_name.localeCompare(b.site_name);
      }),
    [tasks]
  );

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>Pending Work</h1>

      {rows.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing assigned to you right now.</p>
        </Card>
      ) : (
        <Card>
          {rows.map((task) => {
            const urgent = isTaskDueDateUrgent(task.due_date);
            return (
              <button
                key={task.id}
                onClick={() => onOpenSite(task.site_name)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "block",
                  width: "100%",
                  ...TILE_ROW_STYLE,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 500, color: t.edge }}>{task.site_name}</span>
                  {task.due_date && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: urgent ? t.signal : t.edge2, whiteSpace: "nowrap" }}>
                      {fmtShort(task.due_date)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: t.edge, marginTop: 4, lineHeight: 1.4 }}>{task.stage_label}</div>
                <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
                  {WORKFLOW_CATEGORY_LABEL[task.category] ?? task.category}
                </div>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}

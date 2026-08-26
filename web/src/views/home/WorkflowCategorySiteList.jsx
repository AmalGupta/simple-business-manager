import { useMemo } from "react";
import { t } from "../../theme.js";
import { fmtShort, isTaskDueDateUrgent } from "../../lib/dates.js";
import { WORKFLOW_CATEGORY_LABEL } from "../../lib/constants.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* Drilldown from a workflow tile — every site with an open task in this one
   category, showing which stage, who has it, and the due date (same
   urgency-red rule as everywhere else). */
export function WorkflowCategorySiteList({ tasks, category, onBack, onOpenSite }) {
  const rows = useMemo(
    () =>
      [...tasks]
        .filter((task) => task.category === category)
        .sort((a, b) => {
          const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return ad - bd;
        }),
    [tasks, category]
  );

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {WORKFLOW_CATEGORY_LABEL[category] ?? category}
      </h1>
      {rows.length === 0 ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Nothing open in this category right now.</p>
      ) : (
        rows.map((task) => {
          const urgent = isTaskDueDateUrgent(task.due_date);
          return (
            <Card key={task.id} style={{ marginBottom: 10 }}>
              <button
                onClick={() => onOpenSite(task.site_name)}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 500, color: t.edge }}>{task.site_name}</span>
                  {task.due_date && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: urgent ? t.signal : t.edge2 }}>
                      {fmtShort(task.due_date)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: t.edge2, marginTop: 2 }}>{task.stage_label}</div>
                <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
                  {task.assignee_name ? `Assigned to ${task.assignee_name}` : "Unassigned"}
                </div>
              </button>
            </Card>
          );
        })
      )}
    </div>
  );
}

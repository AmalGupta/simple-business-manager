import { useMemo } from "react";
import { t } from "../../theme.js";
import { daysUntil, fmtShort, isTaskDueDateUrgent } from "../../lib/dates.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* The staff-home "To-Do / Calendar" tile's destination — merges call todos
   (myOpenTodos) and assigned site-task stages (openSiteTasks) into one
   list, bucketed by due date: overdue, today, tomorrow, the day after,
   later, and no due date. Matches the brainstorm sketch's annotation ("all
   the tasks assigned... for the day and the next two, to be verified by
   the member at checkout") without building a full calendar grid — both
   source lists are already loaded for the existing tiles this reorganizes,
   so no new endpoint was needed. */
const BUCKETS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "day_after", label: "Day after" },
  { key: "later", label: "Later" },
  { key: "none", label: "No due date" },
];

function bucketFor(dueDate) {
  if (!dueDate) return "none";
  const d = daysUntil(dueDate);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === 2) return "day_after";
  return "later";
}

export function MyScheduleView({ todos, siteTasks, onBack, onOpenCall, onOpenSite }) {
  const grouped = useMemo(() => {
    const m = new Map(BUCKETS.map((b) => [b.key, []]));
    for (const td of todos) {
      m.get(bucketFor(td.due_date)).push({ kind: "todo", id: td.id, title: td.text, sub: td.client_name, due_date: td.due_date, ref: td.call_id });
    }
    for (const tk of siteTasks) {
      m.get(bucketFor(tk.due_date)).push({ kind: "task", id: tk.id, title: tk.stage_label, sub: tk.site_name, due_date: tk.due_date, ref: tk.site_name });
    }
    return m;
  }, [todos, siteTasks]);

  const hasAny = todos.length > 0 || siteTasks.length > 0;

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>To-Do / Calendar</h1>

      {!hasAny ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing assigned to you right now.</p>
        </Card>
      ) : (
        BUCKETS.map((b) => {
          const items = grouped.get(b.key);
          if (items.length === 0) return null;
          return (
            <div key={b.key} style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: t.label, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: t.edge2, marginBottom: 6 }}>
                {b.label}
              </div>
              <Card>
                {items.map((item) => {
                  const urgent = isTaskDueDateUrgent(item.due_date);
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      onClick={() => (item.kind === "todo" ? onOpenCall(item.ref) : onOpenSite(item.ref))}
                      style={{
                        display: "block",
                        width: "100%",
                        minHeight: 44,
                        padding: "10px 0",
                        border: "none",
                        borderTop: `1px solid ${t.frost}`,
                        background: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: t.body,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 14, color: t.edge }}>{item.title}</span>
                        {item.due_date && (
                          <span style={{ fontSize: 12, color: urgent ? t.signal : t.edge2, fontWeight: urgent ? 700 : 400, flexShrink: 0 }}>
                            {fmtShort(item.due_date)}
                          </span>
                        )}
                      </div>
                      {item.sub && <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>{item.sub}</div>}
                    </button>
                  );
                })}
              </Card>
            </div>
          );
        })
      )}
    </div>
  );
}

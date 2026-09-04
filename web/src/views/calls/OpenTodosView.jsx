import { useEffect, useMemo, useState } from "react";
import { t } from "../../theme.js";
import { fmtShort, isUrgent } from "../../lib/dates.js";
import { TILE_ROW_STYLE } from "../../styles.js";
import { fetchCallsByTodoStatus } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { TodoRow } from "../../components/TodoRow.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";

/* Admin drilldown from the "open today" / "parked" home tiles.
   `status` is "open" or "snoozed". Parked list uses TodoRow so admin can
   unpark or complete; open list keeps assign-first layout. */
export function OpenTodosView({
  staffRoster,
  onBack,
  onOpen,
  onAssign,
  onToggle,
  onPark,
  busyIds,
  status = "open",
  refreshKey = 0,
}) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCallsByTodoStatus(status)
      .then((data) => {
        if (!cancelled) setCalls(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setCalls([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, refreshKey]);

  const todos = useMemo(
    () =>
      calls
        .flatMap((c) => c.todos.filter((td) => td.status === status).map((td) => ({ ...td, call: c })))
        .sort((a, b) => {
          if (status === "open") {
            const aUn = a.assigned_to_user_id ? 1 : 0;
            const bUn = b.assigned_to_user_id ? 1 : 0;
            if (aUn !== bUn) return aUn - bUn;
          }
          const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return ad - bd;
        }),
    [calls, status]
  );

  const title = status === "snoozed" ? "Parked" : "Open today";
  const empty = status === "snoozed" ? "Nothing parked right now." : "Nothing open right now.";

  if (loading) {
    return (
      <div>
        <BackLink onClick={onBack}>Back</BackLink>
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {title}
      </h1>

      {todos.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>{empty}</p>
        </Card>
      ) : (
        <Card>
          {todos.map((td) => {
            const urgent = isUrgent(td);
            return (
              <div key={td.id} style={{ ...TILE_ROW_STYLE, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <TodoRow
                    todo={td}
                    urgent={urgent}
                    onToggle={onToggle}
                    onPark={onPark}
                    busy={busyIds?.has(td.id)}
                    showDue
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 28 }}>
                  <button
                    type="button"
                    onClick={() => onOpen(td.call_id)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      fontSize: 13,
                      color: t.accent,
                      fontWeight: 500,
                    }}
                  >
                    {td.call.client_name}
                    {td.call.recorded_at ? ` · ${fmtShort(td.call.recorded_at)}` : ""}
                  </button>
                  {status === "open" && onAssign ? (
                    <TodoAssignControl todo={td} staffRoster={staffRoster} onAssign={onAssign} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

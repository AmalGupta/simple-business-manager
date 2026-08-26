import { useMemo } from "react";
import { t } from "../../theme.js";
import { fmtShort, isUrgent } from "../../lib/dates.js";
import { TILE_ROW_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { TodoRow } from "../../components/TodoRow.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";

/* Admin drilldown from the "open today" / "parked" home tiles.
   `status` is "open" or "snoozed". Parked list uses TodoRow so admin can
   unpark or complete; open list keeps assign-first layout. */
export function OpenTodosView({
  calls,
  staffRoster,
  onBack,
  onOpen,
  onAssign,
  onToggle,
  onPark,
  busyIds,
  status = "open",
}) {
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <button
                    onClick={() => onOpen(td.call.id)}
                    style={{ all: "unset", cursor: "pointer", fontFamily: t.display, fontSize: 14, fontWeight: 500, color: t.edge }}
                  >
                    {td.call.client_name}
                  </button>
                  {td.due_date && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: t.radius,
                        whiteSpace: "nowrap",
                        color: urgent ? t.white : t.edge2,
                        background: urgent ? t.signal : t.frost,
                      }}
                    >
                      {fmtShort(td.due_date)}
                    </span>
                  )}
                </div>
                {status === "snoozed" ? (
                  <TodoRow todo={td} onToggle={onToggle} onPark={onPark} busy={busyIds?.has(td.id)} />
                ) : (
                  <>
                    <span style={{ fontSize: 14, color: t.edge, lineHeight: 1.5 }}>{td.text}</span>
                    <TodoAssignControl todo={td} staffRoster={staffRoster} onAssign={onAssign} alwaysEditing />
                  </>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

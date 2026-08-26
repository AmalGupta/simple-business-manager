import { useMemo } from "react";
import { t } from "../../theme.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { TodoRow } from "../../components/TodoRow.jsx";

/* Staff personal queue — open call todos assigned to this user (from
   dashboard summary my_open_todos). Mark done here; park is available too. */
export function MyOpenTodosView({ todos, onBack, onOpenCall, onToggle, onPark, busyIds }) {
  const sorted = useMemo(
    () =>
      [...todos].sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return ad - bd;
      }),
    [todos]
  );

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        My call tasks
      </h1>

      {sorted.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing assigned to you right now.</p>
        </Card>
      ) : (
        <Card>
          {sorted.map((td) => (
            <div key={td.id} style={{ padding: "8px 10px 4px", borderBottom: `1px solid ${t.frost}` }}>
              <button
                onClick={() => onOpenCall?.(td.call_id)}
                style={{
                  all: "unset",
                  cursor: onOpenCall ? "pointer" : "default",
                  fontFamily: t.display,
                  fontSize: 13,
                  fontWeight: 500,
                  color: t.edge2,
                  marginBottom: 2,
                }}
              >
                {td.client_name}
              </button>
              <TodoRow todo={td} onToggle={onToggle} onPark={onPark} busy={busyIds?.has(td.id)} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

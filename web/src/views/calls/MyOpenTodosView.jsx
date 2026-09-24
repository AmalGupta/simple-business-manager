import { useMemo, useState } from "react";
import { t } from "../../theme.js";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { TodoRow } from "../../components/TodoRow.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";
import { AssignTodoSiteModal } from "./AssignTodoSiteModal.jsx";

/* Personal queue — open call todos for this user.
   Staff: assignee-only, mark done.
   Admin (canManage): also owner=self / name-matched; Assign to me / staff / site. */
export function MyOpenTodosView({
  todos,
  onBack,
  onOpenCall,
  onToggle,
  busyIds,
  canManage = false,
  staffRoster = [],
  currentUser = null,
  onAssign,
  onTodoSiteAssigned,
}) {
  const [siteTodo, setSiteTodo] = useState(null);

  /* Newest call first — matches listMyOpenTodos (recorded_at DESC). */
  const sorted = useMemo(
    () =>
      [...todos].sort((a, b) => {
        const at = a.recorded_at ? new Date(a.recorded_at).getTime() : 0;
        const bt = b.recorded_at ? new Date(b.recorded_at).getTime() : 0;
        return bt - at;
      }),
    [todos]
  );

  const emptyCopy = canManage
    ? "Nothing assigned to you or identified for you right now."
    : "Nothing assigned to you right now.";

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        My call tasks
      </h1>

      {sorted.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>{emptyCopy}</p>
        </Card>
      ) : (
        <Card>
          {sorted.map((td) => (
            <div key={td.id} style={{ padding: "8px 10px 4px", borderBottom: `1px solid ${t.frost}` }}>
              <button
                type="button"
                onClick={() => onOpenCall?.(td.call_id)}
                style={{
                  all: "unset",
                  cursor: onOpenCall ? "pointer" : "default",
                  fontFamily: t.display,
                  fontSize: 13,
                  fontWeight: 500,
                  color: t.edge2,
                  marginBottom: 2,
                  display: "block",
                }}
              >
                {td.client_name}
              </button>
              {td.site_name ? (
                <span style={{ fontSize: 12, color: t.edge2, display: "block", marginBottom: 2 }}>{td.site_name}</span>
              ) : null}
              <TodoRow todo={td} onToggle={onToggle} busy={busyIds?.has(td.id)} />
              {canManage && onAssign ? (
                <div style={{ padding: "4px 0 8px 28px" }}>
                  <TodoAssignControl
                    todo={td}
                    staffRoster={staffRoster}
                    currentUser={currentUser}
                    onAssign={onAssign}
                    compact
                    extraActions={
                      <button
                        type="button"
                        onClick={() => setSiteTodo(td)}
                        style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 32, padding: "0 10px" }}
                      >
                        {td.site_id ? "Change site" : "Assign to Site"}
                      </button>
                    }
                  />
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      )}

      {siteTodo ? (
        <AssignTodoSiteModal
          todo={siteTodo}
          onClose={() => setSiteTodo(null)}
          onAssigned={(result) => {
            onTodoSiteAssigned?.(result);
            setSiteTodo(null);
          }}
        />
      ) : null}
    </div>
  );
}

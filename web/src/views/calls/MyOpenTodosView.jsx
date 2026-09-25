import { useEffect, useMemo, useState } from "react";
import { t } from "../../theme.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { AssignTodoSiteModal } from "./AssignTodoSiteModal.jsx";
import {
  OPEN_TODO_PAGE_SIZE,
  OpenTodoCard,
  OpenTodoLoadMore,
  sortTodosByRecordedAtDesc,
} from "./OpenTodoCard.jsx";

/* Personal queue — open call todos for this user (staff + admin).
   Uses OpenTodoCard (facts: extracted by / date / assignees). Staff: mark done only.
   Admin (canManage): also Assign / site. */
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
  const [visibleCount, setVisibleCount] = useState(OPEN_TODO_PAGE_SIZE);

  /* Newest call first — matches listMyOpenTodos (recorded_at DESC). */
  const sorted = useMemo(
    () => sortTodosByRecordedAtDesc(todos, (td) => td.recorded_at),
    [todos]
  );

  useEffect(() => {
    setVisibleCount(OPEN_TODO_PAGE_SIZE);
  }, [todos]);

  const paged = sorted.slice(0, visibleCount);
  const remaining = Math.max(0, sorted.length - visibleCount);

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
        <Card style={{ padding: 0 }}>
          {paged.map((td) => (
            <OpenTodoCard
              key={td.id}
              todo={td}
              callName={td.client_name}
              recordedAt={td.recorded_at}
              onOpenCall={onOpenCall}
              onToggle={onToggle}
              busy={busyIds?.has(td.id)}
              staffRoster={staffRoster}
              currentUser={currentUser}
              onAssign={canManage && onAssign ? onAssign : undefined}
              onRequestSiteAssign={canManage && onAssign ? setSiteTodo : undefined}
            />
          ))}
          <OpenTodoLoadMore
            remaining={remaining}
            onLoadMore={() => setVisibleCount((n) => n + OPEN_TODO_PAGE_SIZE)}
          />
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

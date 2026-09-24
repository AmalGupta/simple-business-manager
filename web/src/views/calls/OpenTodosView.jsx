import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../theme.js";
import { TILE_ROW_STYLE } from "../../styles.js";
import { getCachedCallsByTodoStatus, loadCallsByTodoStatus, refreshCallsByTodoStatus } from "../../lib/api.js";
import { fmtShort, isUrgent } from "../../lib/dates.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { TodoRow } from "../../components/TodoRow.jsx";
import { AssignTodoSiteModal } from "./AssignTodoSiteModal.jsx";
import {
  OPEN_TODO_PAGE_SIZE,
  OpenTodoCard,
  OpenTodoLoadMore,
  sortTodosByRecordedAtDesc,
} from "./OpenTodoCard.jsx";

const OPEN_TABS_CSS = `
.sbm-open-todos-tabs {
  display: flex;
  gap: 0;
  flex-shrink: 0;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--color-line);
  margin-bottom: 1rem;
}
.sbm-open-todos-tab {
  appearance: none;
  border: 1px solid transparent;
  border-bottom: none;
  background: transparent;
  margin: 0 0 -1px;
  padding: 10px 16px;
  font-family: var(--font-label), system-ui, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-slate);
  cursor: pointer;
}
.sbm-open-todos-tab[aria-selected="true"] {
  background: var(--color-surface);
  border-color: var(--color-line);
  color: var(--color-ink);
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}
`;

function isAssignedToUser(todo, userId) {
  if (!userId) return false;
  return (todo.assignees ?? []).some((a) => a.id === userId);
}

/* Admin drilldown from the "open today" / "parked" home tiles.
   Open today: bookmark tabs — Assigned to me | Others — shared OpenTodoCard.
   Parked: flat TodoRow list (unpark / complete). */
export function OpenTodosView({
  staffRoster,
  currentUser = null,
  onBack,
  onOpen,
  onAssign,
  onToggle,
  onPark,
  onTodoSiteAssigned,
  busyIds,
  status = "open",
  refreshKey = 0,
}) {
  const cached = getCachedCallsByTodoStatus(status);
  const [calls, setCalls] = useState(cached ?? []);
  const [loading, setLoading] = useState(cached === null);
  const [bookmark, setBookmark] = useState("mine");
  const [siteTodo, setSiteTodo] = useState(null);
  const [visibleCount, setVisibleCount] = useState(OPEN_TODO_PAGE_SIZE);
  const lastRefreshKey = useRef(refreshKey);

  useEffect(() => {
    let cancelled = false;
    const forceRefresh = lastRefreshKey.current !== refreshKey;
    lastRefreshKey.current = refreshKey;
    if (!forceRefresh) {
      const hit = getCachedCallsByTodoStatus(status);
      if (hit) setCalls(hit);
    }
    setLoading(getCachedCallsByTodoStatus(status) === null);
    (forceRefresh ? refreshCallsByTodoStatus(status) : loadCallsByTodoStatus(status))
      .then((data) => {
        if (!cancelled) setCalls(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setCalls((prev) => prev);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, refreshKey]);

  useEffect(() => {
    setVisibleCount(OPEN_TODO_PAGE_SIZE);
  }, [bookmark, status]);

  const allTodos = useMemo(
    () =>
      calls.flatMap((c) =>
        c.todos.filter((td) => td.status === status).map((td) => ({ ...td, call: c }))
      ),
    [calls, status]
  );

  const mineTodos = useMemo(() => {
    if (!currentUser?.id) return [];
    return sortTodosByRecordedAtDesc(
      allTodos.filter((td) => isAssignedToUser(td, currentUser.id)),
      (td) => td.call?.recorded_at
    );
  }, [allTodos, currentUser?.id]);

  const othersTodos = useMemo(() => {
    const list = !currentUser?.id ? allTodos : allTodos.filter((td) => !isAssignedToUser(td, currentUser.id));
    return sortTodosByRecordedAtDesc(list, (td) => td.call?.recorded_at);
  }, [allTodos, currentUser?.id]);

  const visibleTodos = status === "open" ? (bookmark === "mine" ? mineTodos : othersTodos) : allTodos;
  const pagedTodos = visibleTodos.slice(0, visibleCount);
  const remaining = Math.max(0, visibleTodos.length - visibleCount);
  const title = status === "snoozed" ? "Parked" : "Open today";
  const empty =
    status === "snoozed"
      ? "Nothing parked right now."
      : bookmark === "mine"
        ? "Nothing assigned to you right now."
        : "Nothing assigned to others (or unassigned) right now.";

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
      <style>{OPEN_TABS_CSS}</style>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {title}
      </h1>

      {status === "open" ? (
        <div className="sbm-open-todos-tabs" role="tablist" aria-label="Open todos">
          <button
            type="button"
            role="tab"
            className="sbm-open-todos-tab"
            aria-selected={bookmark === "mine"}
            onClick={() => setBookmark("mine")}
          >
            Assigned to me{mineTodos.length > 0 ? ` (${mineTodos.length})` : ""}
          </button>
          <button
            type="button"
            role="tab"
            className="sbm-open-todos-tab"
            aria-selected={bookmark === "others"}
            onClick={() => setBookmark("others")}
          >
            Assigned to others{othersTodos.length > 0 ? ` (${othersTodos.length})` : ""}
          </button>
        </div>
      ) : null}

      {visibleTodos.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>{empty}</p>
        </Card>
      ) : status === "open" ? (
        <Card style={{ padding: 0 }}>
          {pagedTodos.map((td) => (
            <OpenTodoCard
              key={td.id}
              todo={td}
              callName={td.call.client_name}
              recordedAt={td.call.recorded_at}
              onOpenCall={onOpen}
              staffRoster={staffRoster}
              currentUser={currentUser}
              onAssign={onAssign}
              onRequestSiteAssign={onAssign ? setSiteTodo : undefined}
            />
          ))}
          <OpenTodoLoadMore
            remaining={remaining}
            onLoadMore={() => setVisibleCount((n) => n + OPEN_TODO_PAGE_SIZE)}
          />
        </Card>
      ) : (
        <Card>
          {visibleTodos.map((td) => {
            const urgent = isUrgent(td);
            return (
              <div key={td.id} style={{ ...TILE_ROW_STYLE, display: "flex", flexDirection: "column", gap: 4 }}>
                <TodoRow
                  todo={td}
                  urgent={urgent}
                  onToggle={onToggle}
                  onPark={onPark}
                  busy={busyIds?.has(td.id)}
                  showDue
                />
                <button
                  type="button"
                  onClick={() => onOpen(td.call_id)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontSize: 13,
                    color: t.accent,
                    fontWeight: 500,
                    alignSelf: "flex-start",
                    paddingLeft: 28,
                  }}
                >
                  {td.call.client_name}
                  {td.call.recorded_at ? ` · ${fmtShort(td.call.recorded_at)}` : ""}
                </button>
              </div>
            );
          })}
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

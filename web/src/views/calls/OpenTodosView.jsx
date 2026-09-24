import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../theme.js";
import { fmtShort, isUrgent } from "../../lib/dates.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { getCachedCallsByTodoStatus, loadCallsByTodoStatus, refreshCallsByTodoStatus } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { TodoRow } from "../../components/TodoRow.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";
import { AssignTodoSiteModal } from "./AssignTodoSiteModal.jsx";

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
.sbm-open-todo-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px;
  border-bottom: 1px solid var(--color-line-soft);
}
.sbm-open-todo-card:last-child {
  border-bottom: none;
}
.sbm-open-todo-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
}
.sbm-open-todo-card__call {
  all: unset;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-accent);
  font-weight: 500;
}
.sbm-open-todo-card__site {
  font-size: 12px;
  color: var(--color-slate);
}
.sbm-open-todo-card__text {
  font-size: 14px;
  line-height: 1.45;
  color: var(--color-ink);
  margin: 0;
}
.sbm-open-todo-card .cna-todo-toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.sbm-open-todo-card .cna-todo-toolbar__status {
  font-size: 12px;
  color: var(--color-slate);
  line-height: 1.35;
}
.sbm-open-todo-card .cna-todo-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
`;

function isAssignedToUser(todo, userId) {
  if (!userId) return false;
  return (todo.assignees ?? []).some((a) => a.id === userId);
}

function sortOpenTodos(list) {
  return [...list].sort((a, b) => {
    const aUn = (a.assignees?.length ?? 0) > 0 ? 1 : 0;
    const bUn = (b.assignees?.length ?? 0) > 0 ? 1 : 0;
    if (aUn !== bUn) return aUn - bUn;
    const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return ad - bd;
  });
}

/* Admin drilldown from the "open today" / "parked" home tiles.
   Open today: bookmark tabs — Assigned to me | Others — with a CNA-style
   Assign to me / Assign / Assign to Site toolbar on each card.
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

  const allTodos = useMemo(
    () =>
      calls.flatMap((c) =>
        c.todos.filter((td) => td.status === status).map((td) => ({ ...td, call: c }))
      ),
    [calls, status]
  );

  const mineTodos = useMemo(() => {
    if (!currentUser?.id) return [];
    return sortOpenTodos(allTodos.filter((td) => isAssignedToUser(td, currentUser.id)));
  }, [allTodos, currentUser?.id]);

  const othersTodos = useMemo(() => {
    if (!currentUser?.id) return sortOpenTodos(allTodos);
    return sortOpenTodos(allTodos.filter((td) => !isAssignedToUser(td, currentUser.id)));
  }, [allTodos, currentUser?.id]);

  const visibleTodos = status === "open" ? (bookmark === "mine" ? mineTodos : othersTodos) : allTodos;
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
          {visibleTodos.map((td) => {
            const urgent = isUrgent(td);
            return (
              <div key={td.id} className="sbm-open-todo-card">
                <div className="sbm-open-todo-card__meta">
                  <button type="button" className="sbm-open-todo-card__call" onClick={() => onOpen(td.call_id)}>
                    {td.call.client_name}
                    {td.call.recorded_at ? ` · ${fmtShort(td.call.recorded_at)}` : ""}
                  </button>
                  {td.site_name ? <span className="sbm-open-todo-card__site">{td.site_name}</span> : null}
                  {td.due_date ? (
                    <span
                      style={{
                        fontSize: 12,
                        padding: "2px 8px",
                        borderRadius: t.radius,
                        color: urgent ? t.white : t.edge2,
                        background: urgent ? t.signal : t.frost,
                      }}
                    >
                      {fmtShort(td.due_date)}
                    </span>
                  ) : null}
                </div>
                <p className="sbm-open-todo-card__text">{td.text}</p>
                {onAssign ? (
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
                ) : null}
              </div>
            );
          })}
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

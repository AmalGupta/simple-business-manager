import { useCallback, useEffect, useState } from "react";
import { t } from "../../theme.js";
import { fetchOpenTodos, fetchOpenTodosCounts } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { AssignTodoSiteModal } from "./AssignTodoSiteModal.jsx";
import { OPEN_TODO_PAGE_SIZE, OpenTodoCard, OpenTodoLoadMore } from "./OpenTodoCard.jsx";

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

const BUCKETS = [
  { id: "mine", label: "Assigned to me" },
  { id: "unassigned", label: "Unassigned" },
  { id: "staff", label: "Staff assigned" },
];

const EMPTY_COPY = {
  mine: "Nothing assigned to you right now.",
  unassigned: "No unassigned open tasks right now.",
  staff: "No tasks assigned only to staff right now.",
};

/**
 * Admin Open tasks — three assignee bookmarks, server-paginated, newest first.
 * Cards: complete + Assign to me / Assign·Reassign / Assign to Site.
 */
export function OpenTodosView({
  staffRoster,
  currentUser = null,
  onBack,
  onOpen,
  onAssign,
  onToggle,
  onTodoSiteAssigned,
  busyIds,
  refreshKey = 0,
  initialBucket = "mine",
}) {
  const [bucket, setBucket] = useState(initialBucket);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ mine: 0, unassigned: 0, staff: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [siteTodo, setSiteTodo] = useState(null);

  const loadCounts = useCallback(() => {
    return fetchOpenTodosCounts()
      .then((data) => {
        setCounts({
          mine: data?.mine ?? 0,
          unassigned: data?.unassigned ?? 0,
          staff: data?.staff ?? 0,
          total: data?.total ?? 0,
        });
      })
      .catch((err) => console.error("[sbm] open-todos counts failed", err));
  }, []);

  const loadPage = useCallback(
    async (bucketId, offset, { append } = {}) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const page = await fetchOpenTodos({
          bucket: bucketId,
          limit: OPEN_TODO_PAGE_SIZE,
          offset,
        });
        const next = Array.isArray(page?.items) ? page.items : [];
        setTotal(Number(page?.total) || 0);
        setItems((prev) => (append ? [...prev, ...next] : next));
      } catch (err) {
        console.error("[sbm] open-todos fetch failed", err);
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    setItems([]);
    setTotal(0);
    loadPage(bucket, 0, { append: false });
    loadCounts();
  }, [bucket, refreshKey, loadPage, loadCounts]);

  const patchLocalTodo = (todoId, patch) => {
    setItems((prev) => prev.map((td) => (td.id === todoId ? { ...td, ...patch } : td)));
  };

  const removeLocalTodo = (todoId) => {
    setItems((prev) => prev.filter((td) => td.id !== todoId));
    setTotal((n) => Math.max(0, n - 1));
    loadCounts();
  };

  const handleAssign = async (todoId, userIds) => {
    const updated = await onAssign?.(todoId, userIds);
    if (!updated) return updated;
    const assignees = updated.assignees ?? [];
    const myId = currentUser?.id;
    const assignedToMe = Boolean(myId && assignees.some((a) => a.id === myId));
    const unassigned = assignees.length === 0;
    const stays =
      (bucket === "mine" && assignedToMe) ||
      (bucket === "unassigned" && unassigned) ||
      (bucket === "staff" && !unassigned && !assignedToMe);
    if (stays) patchLocalTodo(todoId, { assignees });
    else removeLocalTodo(todoId);
    return updated;
  };

  const handleToggle = (todo) => {
    onToggle?.(todo);
    /* Completing moves it out of open lists. */
    if (todo.status !== "done") removeLocalTodo(todo.id);
  };

  const handleSiteAssigned = (result) => {
    const updated = result?.todo;
    if (updated?.id) {
      patchLocalTodo(updated.id, {
        ...updated,
        site_id: result.site_id ?? updated.site_id,
        site_name: result.site_name ?? updated.site_name,
        assignees: updated.assignees,
      });
    }
    onTodoSiteAssigned?.(result);
    setSiteTodo(null);
  };

  const remaining = Math.max(0, total - items.length);
  const empty = EMPTY_COPY[bucket] ?? "Nothing here right now.";

  return (
    <div>
      <style>{OPEN_TABS_CSS}</style>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        Open tasks
      </h1>

      <div className="sbm-open-todos-tabs" role="tablist" aria-label="Open tasks">
        {BUCKETS.map((tab) => {
          const n = counts[tab.id] ?? 0;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              className="sbm-open-todos-tab"
              aria-selected={bucket === tab.id}
              onClick={() => setBucket(tab.id)}
            >
              {tab.label}
              {n > 0 ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>

      {loading && items.length === 0 ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : items.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>{empty}</p>
        </Card>
      ) : (
        <Card style={{ padding: 0 }}>
          {items.map((td) => (
            <OpenTodoCard
              key={td.id}
              todo={td}
              callName={td.client_name}
              recordedAt={td.recorded_at}
              onOpenCall={onOpen}
              onToggle={onToggle ? handleToggle : undefined}
              busy={busyIds?.has(td.id)}
              staffRoster={staffRoster}
              currentUser={currentUser}
              onAssign={onAssign ? handleAssign : undefined}
              onRequestSiteAssign={onAssign ? setSiteTodo : undefined}
            />
          ))}
          <OpenTodoLoadMore
            remaining={loadingMore ? 0 : remaining}
            onLoadMore={() => loadPage(bucket, items.length, { append: true })}
          />
          {loadingMore ? <p style={{ fontSize: 13, color: t.edge2, padding: "8px 12px" }}>Loading…</p> : null}
        </Card>
      )}

      {siteTodo ? (
        <AssignTodoSiteModal todo={siteTodo} onClose={() => setSiteTodo(null)} onAssigned={handleSiteAssigned} />
      ) : null}
    </div>
  );
}

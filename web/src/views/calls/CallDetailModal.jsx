import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { t } from "../../theme.js";
import { fmtDate } from "../../lib/dates.js";
import { fetchCall } from "../../lib/api.js";
import { TileLabel } from "../../components/TileLabel.jsx";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { TodoRow } from "../../components/TodoRow.jsx";
import { WaitingTag } from "../../components/WaitingTag.jsx";
import { CallTypeBadge } from "../../components/CallTypeBadge.jsx";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { TodoAssignControl } from "./TodoAssignControl.jsx";
import { AssignTodoSiteModal } from "./AssignTodoSiteModal.jsx";

/**
 * Modal call detail — transcript, audio, todos. Close returns to the grid
 * without navigating away (filters/page state preserved).
 * Todos: complete + assign/reassign + assign-to-site (no park).
 */
export function CallDetailModal({
  callId,
  onClose,
  onToggle,
  busyIds,
  canManage = true,
  staffRoster = [],
  currentUser = null,
  onAssign,
  onTodoSiteAssigned,
}) {
  const [call, setCall] = useState(undefined);
  const [error, setError] = useState("");
  const [siteTodo, setSiteTodo] = useState(null);

  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    setCall(undefined);
    setError("");
    fetchCall(callId)
      .then((data) => {
        if (!cancelled) setCall(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setCall(null);
          setError(err.message || "Failed to load call");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [callId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const patchLocalTodo = (todoId, patch) => {
    setCall((c) => {
      if (!c) return c;
      return {
        ...c,
        todos: (c.todos || []).map((td) => (td.id === todoId ? { ...td, ...patch } : td)),
      };
    });
  };

  const handleToggle = (todo) => {
    patchLocalTodo(
      todo.id,
      todo.status === "done"
        ? { status: "open", completed_at: null }
        : { status: "done", completed_at: new Date().toISOString() }
    );
    onToggle?.(todo);
  };

  const handleAssign = async (todoId, userIds) => {
    const updated = await onAssign?.(todoId, userIds);
    if (updated?.assignees) {
      patchLocalTodo(todoId, { assignees: updated.assignees });
    }
    return updated;
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

  const openTodos = call ? (call.todos || []).filter((td) => td.status !== "done") : [];
  const doneTodos = call ? (call.todos || []).filter((td) => td.status === "done") : [];
  const dateIso = call ? call.recording_date || call.recorded_at : null;

  return (
    <>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Call detail"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(20, 24, 31, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(88vh, 900px)",
          overflow: "auto",
          background: t.white,
          borderRadius: t.radiusCard,
          border: `1px solid ${t.frost}`,
          boxShadow: "0 16px 48px rgba(20, 24, 31, 0.28)",
          padding: "1.1rem 1.25rem 1.35rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <TileLabel>Call detail</TileLabel>
            {call && (
              <>
                <h2
                  style={{
                    fontFamily: t.display,
                    fontSize: 20,
                    fontWeight: 500,
                    color: t.edge,
                    margin: "8px 0 4px",
                  }}
                >
                  {call.client_name || "Unknown caller"}
                </h2>
                <div style={{ fontSize: 13, color: t.edge2 }}>
                  {fmtDate(dateIso)}
                  {call.duration_s != null ? ` · ${Math.round(call.duration_s / 60)} min` : ""}
                  {call.source ? ` · ${call.source}` : ""}
                </div>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {call && <CallTypeBadge callType={call.call_type} />}
            {call?.customer_waiting ? <WaitingTag /> : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                border: `1px solid ${t.frost}`,
                borderRadius: t.radiusButton,
                background: t.white,
                cursor: "pointer",
                color: t.edge,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {call === undefined && <p style={{ margin: 0, fontSize: 14, color: t.edge2 }}>Loading…</p>}
        {call === null && <p style={{ margin: 0, fontSize: 14, color: t.signal }}>{error || "Call not found."}</p>}

        {call && (
          <>
            {call.has_transcript && <AudioPlayer src={`/api/calls/${call.id}/recording`} />}

            {call.summary && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: t.edge2, marginBottom: 4 }}>Summary</div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: t.edge }}>{call.summary}</p>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: t.edge2, marginBottom: 6 }}>Transcript</div>
              {call.transcript ? (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: t.body,
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: t.edge,
                    maxHeight: 240,
                    overflowY: "auto",
                    padding: 12,
                    border: `1px solid ${t.frost}`,
                    borderRadius: t.radiusCard,
                    background: t.pane,
                  }}
                >
                  {call.transcript}
                </pre>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: t.edge2 }}>
                  {call.has_transcript ? "Transcript unavailable." : "No transcript yet."}
                </p>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: t.edge2, marginBottom: 6 }}>
                Todos ({openTodos.length} open)
              </div>
              {openTodos.length + doneTodos.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: t.edge2 }}>No todos on this call.</p>
              ) : (
                [...openTodos, ...doneTodos].map((todo) => (
                  <div key={todo.id} style={{ marginBottom: 8 }}>
                    <TodoRow
                      todo={todo}
                      onToggle={canManage ? handleToggle : undefined}
                      busy={busyIds?.has?.(todo.id)}
                      readOnly={!canManage}
                    />
                    {canManage && onAssign ? (
                      <div style={{ padding: "0 10px 4px" }}>
                        {todo.site_name ? (
                          <div style={{ fontSize: 12, color: t.edge2, marginBottom: 4 }}>Site: {todo.site_name}</div>
                        ) : null}
                        <TodoAssignControl
                          todo={todo}
                          staffRoster={staffRoster}
                          currentUser={currentUser}
                          onAssign={handleAssign}
                          extraActions={
                            <button
                              type="button"
                              onClick={() => setSiteTodo(todo)}
                              style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 34 }}
                            >
                              {todo.site_id ? "Change site" : "Assign to Site"}
                            </button>
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>

      {siteTodo ? (
        <AssignTodoSiteModal
          todo={siteTodo}
          onClose={() => setSiteTodo(null)}
          onAssigned={handleSiteAssigned}
        />
      ) : null}
    </>
  );
}

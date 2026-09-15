import { useState, useEffect, useCallback } from "react";
import { t } from "../../theme.js";
import { fmtShort, fmtDate, isUrgent } from "../../lib/dates.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { fetchSiteOpenTodos, postTodoVoiceNote, refreshConfirmedSites } from "../../lib/api.js";
import { TodoRow } from "../../components/TodoRow.jsx";
import { TodoAssignControl } from "../calls/TodoAssignControl.jsx";
import { TodoVoiceNoteButton } from "../../components/TodoVoiceNoteButton.jsx";
import { siteDisplayName } from "./sitesGridChrome.jsx";

/* Popup from the confirmed-sites Open count — the same open call todos that
   make up open_count, newest first. Mark done / assign / voice note match
   the Open todos / Calls needing action patterns; assign already writes
   site_edits for Site details. */
export function SiteOpenTodosPopup({
  site,
  staffRoster,
  currentUser,
  onAssignTodo,
  onToggleTodo,
  onClose,
  onChanged = () => {},
}) {
  const [items, setItems] = useState(null);
  const [voiceNotesByTodoId, setVoiceNotesByTodoId] = useState(() => new Map());
  const [busyIds, setBusyIds] = useState(() => new Set());

  const reload = useCallback(() => {
    if (!site?.id) return Promise.resolve();
    return fetchSiteOpenTodos(site.id)
      .then(({ items: next, voiceNotesByTodoId: notes }) => {
        setItems(next);
        setVoiceNotesByTodoId(notes);
      })
      .catch((err) => {
        console.error("[sbm] failed to load site open todos", err);
        setItems([]);
        setVoiceNotesByTodoId(new Map());
      });
  }, [site?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const refreshDirectory = useCallback(async () => {
    await refreshConfirmedSites().catch(() => {});
    await onChanged();
  }, [onChanged]);

  const toggle = async (todo) => {
    setBusyIds((s) => new Set(s).add(todo.id));
    try {
      await onToggleTodo(todo);
      await Promise.all([reload(), refreshDirectory()]);
    } catch (err) {
      console.error("[sbm] failed to toggle site open todo", err);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(todo.id);
        return next;
      });
    }
  };

  const assign = async (todoId, userIds) => {
    await onAssignTodo(todoId, userIds);
    await Promise.all([reload(), refreshDirectory()]);
  };

  const addVoiceNote = async (todoId, blob, fileName) => {
    const note = await postTodoVoiceNote(todoId, blob, fileName);
    setVoiceNotesByTodoId((prev) => {
      const next = new Map(prev);
      next.set(todoId, note);
      return next;
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Open items"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "85vh",
          overflowY: "auto",
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 12 }}>
          <div>
            <div style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Open items</div>
            <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>{siteDisplayName(site)}</div>
          </div>
          {items && (
            <span style={{ fontSize: 12, color: t.edge2, flexShrink: 0 }}>
              {items.length} open
            </span>
          )}
        </div>

        {items === null ? (
          <p style={{ fontSize: 13, color: t.edge2 }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: "8px 0" }}>No open items for this site.</p>
        ) : (
          items.map((todo) => {
            const dateIso = todo.recording_date || todo.recorded_at;
            const urgent = isUrgent(todo);
            return (
              <div key={todo.id} style={{ ...TILE_ROW_STYLE, display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch" }}>
                <TodoRow todo={todo} urgent={urgent} onToggle={toggle} busy={busyIds.has(todo.id)} showDue />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 8,
                    paddingLeft: 28,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 13, color: t.edge2 }}>
                    {todo.client_name}
                    {dateIso ? ` · ${fmtDate(dateIso)}` : ""}
                    {todo.owner ? ` · owner ${todo.owner === "self" ? "Self" : todo.owner}` : ""}
                    {todo.due_date ? ` · due ${fmtShort(todo.due_date)}` : ""}
                  </div>
                  <TodoAssignControl
                    todo={todo}
                    staffRoster={staffRoster}
                    currentUser={currentUser}
                    onAssign={assign}
                    extraActions={
                      <TodoVoiceNoteButton
                        todoId={todo.id}
                        existingNote={voiceNotesByTodoId.get(todo.id)}
                        onUpload={addVoiceNote}
                      />
                    }
                  />
                </div>
              </div>
            );
          })
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button type="button" onClick={onClose} style={SMALL_SECONDARY_BUTTON_STYLE}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

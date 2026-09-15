import { useState, useEffect, useCallback } from "react";
import { t } from "../../theme.js";
import { fmtShort, fmtDate, isUrgent } from "../../lib/dates.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { fetchSiteOpenTodos, postTodoVoiceNote, refreshConfirmedSites } from "../../lib/api.js";
import { TodoAssignControl } from "../calls/TodoAssignControl.jsx";
import { TodoVoiceNoteButton } from "../../components/TodoVoiceNoteButton.jsx";
import { siteDisplayName } from "./sitesGridChrome.jsx";

/* Popup from the confirmed-sites Open count — open call todos for one site,
   newest first. Mark done / assign / voice note reuse the same APIs as
   Calls needing action; assign already writes site_edits for Site details. */
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
  const [busyId, setBusyId] = useState(null);

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

  const markDone = async (todo) => {
    setBusyId(todo.id);
    try {
      await onToggleTodo(todo);
      await Promise.all([reload(), refreshDirectory()]);
    } catch (err) {
      console.error("[sbm] failed to mark todo done", err);
    } finally {
      setBusyId(null);
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
            const busy = busyId === todo.id;
            return (
              <div key={todo.id} style={{ ...TILE_ROW_STYLE, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, color: t.edge, fontWeight: 500, lineHeight: 1.4 }}>{todo.text}</div>
                    <div style={{ fontSize: 12, color: t.edge2, marginTop: 4, lineHeight: 1.4 }}>
                      {todo.owner === "self" ? "Self" : todo.owner}
                      {todo.due_date && (
                        <span style={{ color: urgent ? t.signal : "inherit", fontWeight: urgent ? 700 : 400 }}>
                          {" "}
                          · due {fmtShort(todo.due_date)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
                      {todo.client_name}
                      {dateIso ? ` · ${fmtDate(dateIso)}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => markDone(todo)}
                    style={{
                      ...PRIMARY_BUTTON_STYLE,
                      minHeight: 34,
                      padding: "0 12px",
                      fontSize: 12,
                      flexShrink: 0,
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    {busy ? "Saving…" : "Mark done"}
                  </button>
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

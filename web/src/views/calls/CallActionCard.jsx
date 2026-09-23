import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fmtDate } from "../../lib/dates.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { TodoVoiceNoteButton } from "../../components/TodoVoiceNoteButton.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";
import { AssignTodoSiteModal } from "./AssignTodoSiteModal.jsx";
import "./CallActionCard.css";

/* One card in the Calls Needing Action carousel — see
   CallsNeedingActionView.jsx for the carousel shell. Modeled on
   CallDetailModal.jsx's content (header/audio/summary/transcript/todos)
   but built to sit as one of N cards in a scrolling row, with a
   collapsible transcript and per-todo assign + voice-note controls instead
   of a toggle/park control (this card isn't where an individual todo gets
   marked done). Carousel stretch keeps sibling cards the same height with
   Resolve pinned to the bottom — no inner card scrollbars. */
export function CallActionCard({
  call,
  staffRoster,
  currentUser = null,
  onAssignTodo,
  onAssignTodoSite,
  onResolve,
  onAddVoiceNote,
  voiceNotesByTodoId,
}) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [siteTodo, setSiteTodo] = useState(null);

  const dateIso = call.recording_date || call.recorded_at;
  const todos = call.todos ?? [];

  const handleResolve = async () => {
    setResolving(true);
    try {
      await onResolve(call.id);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="cna-card">
      <div className="cna-card__header">
        <p className="cna-card__eyebrow">Call</p>
        <h3 className="cna-card__title">{call.client_name || "Unknown caller"}</h3>
        <div className="cna-card__meta">{fmtDate(dateIso)}</div>
      </div>

      {call.summary ? <p className="cna-card__summary">{call.summary}</p> : null}

      {call.has_transcript ? (
        <div className="cna-card__media">
          <div className="cna-card__audio">
            <AudioPlayer src={`/api/calls/${call.id}/recording`} />
          </div>
          <button
            type="button"
            className="cna-card__transcript-toggle"
            onClick={() => setTranscriptOpen((o) => !o)}
          >
            {transcriptOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Transcript
          </button>
          {transcriptOpen ? (
            <div className="cna-card__transcript">{call.transcript || "Transcript unavailable."}</div>
          ) : null}
        </div>
      ) : null}

      <div className="cna-card__todos-label">
        <TileLabel>Todos ({todos.length})</TileLabel>
      </div>

      <div className="cna-card__todos">
        {todos.length === 0 ? (
          <p className="cna-card__empty">No todos on this call.</p>
        ) : (
          todos.map((todo) => (
            <div key={todo.id} className="cna-card__todo-row">
              <p className="cna-card__todo-text">{todo.text}</p>
              {todo.site_name ? <span className="cna-card__todo-site">{todo.site_name}</span> : null}
              <div className="cna-card__todo-controls">
                <TodoAssignControl
                  todo={todo}
                  staffRoster={staffRoster}
                  currentUser={currentUser}
                  onAssign={onAssignTodo}
                  compact
                  extraActions={
                    <>
                      <button
                        type="button"
                        onClick={() => setSiteTodo(todo)}
                        style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 32, padding: "0 10px" }}
                      >
                        {todo.site_id ? "Change site" : "Assign to Site"}
                      </button>
                      <TodoVoiceNoteButton
                        todoId={todo.id}
                        existingNote={voiceNotesByTodoId?.get(todo.id)}
                        onUpload={onAddVoiceNote}
                      />
                    </>
                  }
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cna-card__footer">
        <button
          type="button"
          onClick={handleResolve}
          disabled={resolving}
          style={{ ...PRIMARY_BUTTON_STYLE, opacity: resolving ? 0.6 : 1 }}
        >
          {resolving ? "Resolving…" : "Resolve"}
        </button>
      </div>

      {siteTodo ? (
        <AssignTodoSiteModal
          todo={siteTodo}
          onClose={() => setSiteTodo(null)}
          onAssigned={(result) => {
            onAssignTodoSite?.(call.id, result);
            setSiteTodo(null);
          }}
        />
      ) : null}
    </div>
  );
}

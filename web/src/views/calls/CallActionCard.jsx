import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { fmtDate } from "../../lib/dates.js";
import { PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { TodoVoiceNoteButton } from "../../components/TodoVoiceNoteButton.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";
import "./CallActionCard.css";

/* One card in the Calls Needing Action carousel — see
   CallsNeedingActionView.jsx for the carousel shell. Modeled on
   CallDetailModal.jsx's content (header/audio/summary/transcript/todos)
   but built to sit as one of N cards in a scrolling row, with a
   collapsible transcript and per-todo assign + voice-note controls instead
   of a toggle/park control (this card isn't where an individual todo gets
   marked done). */
export function CallActionCard({ call, staffRoster, onAssignTodo, onResolve, onAddVoiceNote, voiceNotesByTodoId }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

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
        <h3 className="cna-card__title">Call with {call.client_name || "Unknown caller"}</h3>
        <div className="cna-card__meta">{fmtDate(dateIso)}</div>
      </div>

      {call.summary && <p className="cna-card__summary">{call.summary}</p>}

      {call.has_transcript && (
        <div className="cna-card__audio">
          <AudioPlayer src={`/api/calls/${call.id}/recording`} />
        </div>
      )}

      {call.has_transcript && (
        <>
          <button className="cna-card__transcript-toggle" onClick={() => setTranscriptOpen((o) => !o)}>
            {transcriptOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Transcript
          </button>
          {transcriptOpen && (
            <div className="cna-card__transcript">{call.transcript || "Transcript unavailable."}</div>
          )}
        </>
      )}

      <div className="cna-card__section-label">AI Todos ({todos.length})</div>
      <div className="cna-card__todos">
        {todos.length === 0 ? (
          <p className="cna-card__empty">No todos on this call.</p>
        ) : (
          todos.map((todo) => (
            <div key={todo.id} className="cna-card__todo-row">
              <p className="cna-card__todo-text">{todo.text}</p>
              <div className="cna-card__todo-controls">
                <TodoAssignControl todo={todo} staffRoster={staffRoster} onAssign={onAssignTodo} />
                <TodoVoiceNoteButton
                  todoId={todo.id}
                  existingNote={voiceNotesByTodoId?.get(todo.id)}
                  onUpload={onAddVoiceNote}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cna-card__footer">
        <button onClick={handleResolve} disabled={resolving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: resolving ? 0.6 : 1 }}>
          {resolving ? "Resolving…" : "Resolve"}
        </button>
      </div>
    </div>
  );
}

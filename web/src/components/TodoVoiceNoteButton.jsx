import { useState } from "react";
import { Mic } from "lucide-react";
import { t } from "../theme.js";
import { AudioPlayer } from "./AudioPlayer.jsx";
import { VoiceNoteModal } from "../views/sites/VoiceNoteModal.jsx";

/* Mic button on one todo row in the Calls Needing Action carousel — records
   a quick raw-audio clip (no transcription, unlike call recordings) and
   attaches it to the todo for the assigned staff member to play back.
   Reuses VoiceNoteModal's MediaRecorder capture (site voice memos) rather
   than a second recording implementation. */
export function TodoVoiceNoteButton({ todoId, existingNote, onUpload }) {
  const [recording, setRecording] = useState(false);

  const save = async (blob, fileName) => {
    await onUpload(todoId, blob, fileName);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
      {existingNote && (
        <div style={{ width: 140 }}>
          <AudioPlayer src={`/api/todo-voice-notes/${existingNote.id}`} />
        </div>
      )}
      <button
        onClick={() => setRecording(true)}
        aria-label={existingNote ? "Re-record voice note" : "Add voice note"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          flexShrink: 0,
          border: `1px solid ${t.frost}`,
          borderRadius: t.radiusButton,
          background: t.white,
          color: t.edge2,
          cursor: "pointer",
        }}
      >
        <Mic size={14} />
      </button>
      {recording && <VoiceNoteModal onClose={() => setRecording(false)} onSave={save} />}
    </div>
  );
}

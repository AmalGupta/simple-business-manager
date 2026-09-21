import { useState } from "react";
import { Mic } from "lucide-react";
import { t } from "../theme.js";
import { postDeskVoiceNote } from "../lib/api.js";
import { VoiceNoteModal } from "../views/sites/VoiceNoteModal.jsx";

/* Admin-home header mic — records a desk conversation, uploads to
   /api/desk-voice-note, and runs the same STT → extraction → todo
   assignment pipeline as a phone call. Assigned by = recording user. */
export function DeskConversationMic() {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async (blob, fileName) => {
    setBusy(true);
    setError(null);
    try {
      await postDeskVoiceNote(blob, fileName);
    } catch (err) {
      console.error("[sbm] desk voice note failed", err);
      setError("Couldn't upload — try again.");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setRecording(true);
        }}
        disabled={busy}
        aria-label="Record desk conversation"
        title="Record desk conversation"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          flexShrink: 0,
          border: "1px solid rgba(255,255,255,0.35)",
          borderRadius: t.radiusButton,
          background: "rgba(255,255,255,0.12)",
          color: t.white,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Mic size={15} />
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "rgba(255,200,200,0.95)", maxWidth: 120 }}>{error}</span>
      )}
      {recording && (
        <VoiceNoteModal
          onClose={() => !busy && setRecording(false)}
          onSave={save}
          title="Desk conversation"
        />
      )}
    </>
  );
}

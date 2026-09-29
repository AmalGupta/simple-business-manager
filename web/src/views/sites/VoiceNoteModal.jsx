import { Mic, Square } from "lucide-react";
import { t } from "../../theme.js";
import { useT } from "../../lib/i18n.jsx";
import { PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { Modal } from "../../components/Modal.jsx";
import { useRecorder } from "../../hooks/useRecorder.js";

/* Popup for recording a voice note in-browser — record, stop, preview,
   save. No waveform — matches the app's "no new UI kit" restraint.

   Capture itself lives in useRecorder so the mic can be used without
   this overlay; this component is just the chrome around it. */
export function VoiceNoteModal({ onClose, onSave, title }) {
  const tr = useT();
  title = title ?? tr("recordVoiceNote");
  const { status, elapsedS, error, previewUrl, start, stop, save } = useRecorder();

  const handleSave = async () => {
    try {
      await save(onSave);
      onClose();
    } catch {
      // useRecorder has already surfaced the message and rewound to
      // "recorded" so the take can be retried rather than lost.
    }
  };

  const mm = String(Math.floor(elapsedS / 60)).padStart(2, "0");
  const ss = String(elapsedS % 60).padStart(2, "0");

  return (
    <Modal label={title} title={title} onClose={onClose}>
      {status === "idle" && (
        <button
          onClick={start}
          style={{ ...PRIMARY_BUTTON_STYLE, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Mic size={16} /> {tr("startRecording")}
        </button>
      )}

      {status === "recording" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: t.display, fontSize: 22, color: t.signal }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.signal }} />
            {mm}:{ss}
          </div>
          <button
            onClick={stop}
            style={{ ...PRIMARY_BUTTON_STYLE, background: t.edge, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <Square size={14} /> {tr("stop")}
          </button>
        </>
      )}

      {status === "recorded" && previewUrl && (
        <>
          <AudioPlayer src={previewUrl} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={onClose}
              style={{ minHeight: 40, padding: "0 16px", border: `1px solid ${t.frost}`, borderRadius: t.radiusButton, background: t.white, color: t.edge2, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {tr("discard")}
            </button>
            <button onClick={handleSave} style={PRIMARY_BUTTON_STYLE}>
              {tr("save")}
            </button>
          </div>
        </>
      )}

      {status === "saving" && <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>{tr("saving")}</p>}
      {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
    </Modal>
  );
}

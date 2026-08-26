import { useState, useEffect, useRef } from "react";
import { Mic, Square } from "lucide-react";
import { t } from "../../theme.js";
import { PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";

function pickRecorderMimeType() {
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const c of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(c)) return c;
  }
  return "";
}

function extensionForMimeType(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  return "m4a";
}

/* Popup for recording a voice note in-browser via MediaRecorder — record,
   stop, preview, save. No waveform — matches the app's "no new UI kit"
   restraint, same as AssignTeamModal above. */
export function VoiceNoteModal({ onClose, onSave }) {
  const [status, setStatus] = useState("idle"); // idle | recording | recorded | saving
  const [elapsedS, setElapsedS] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const blobRef = useRef(null);
  const previewUrlRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/mp4" });
        blobRef.current = blob;
        previewUrlRef.current = URL.createObjectURL(blob);
        setStatus("recorded");
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus("recording");
      setElapsedS(0);
      timerRef.current = setInterval(() => setElapsedS((s) => s + 1), 1000);
    } catch (err) {
      console.error("[sbm] mic access failed", err);
      setError("Couldn't access the microphone — check permissions.");
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
  };

  const save = async () => {
    if (!blobRef.current) return;
    setStatus("saving");
    setError("");
    try {
      const ext = extensionForMimeType(blobRef.current.type);
      await onSave(blobRef.current, `voice-note.${ext}`);
      onClose();
    } catch (err) {
      console.error("[sbm] voice note upload failed", err);
      setError("Failed to save — try again.");
      setStatus("recorded");
    }
  };

  const mm = String(Math.floor(elapsedS / 60)).padStart(2, "0");
  const ss = String(elapsedS % 60).padStart(2, "0");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Record voice note"
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
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Record voice note</span>

        {status === "idle" && (
          <button onClick={startRecording} style={{ ...PRIMARY_BUTTON_STYLE, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Mic size={16} /> Start recording
          </button>
        )}

        {status === "recording" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: t.display, fontSize: 22, color: t.signal }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.signal }} />
              {mm}:{ss}
            </div>
            <button
              onClick={stopRecording}
              style={{ ...PRIMARY_BUTTON_STYLE, background: t.edge, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <Square size={14} /> Stop
            </button>
          </>
        )}

        {status === "recorded" && previewUrlRef.current && (
          <>
            <AudioPlayer src={previewUrlRef.current} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{ minHeight: 40, padding: "0 16px", border: `1px solid ${t.frost}`, borderRadius: t.radiusButton, background: t.white, color: t.edge2, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Discard
              </button>
              <button onClick={save} style={PRIMARY_BUTTON_STYLE}>
                Save
              </button>
            </div>
          </>
        )}

        {status === "saving" && <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Saving…</p>}
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { Image, Mic, Square, Video, X } from "lucide-react";
import { t } from "../../theme.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";
import { AudioPlayer } from "../AudioPlayer.jsx";
import { useRecorder } from "../../hooks/useRecorder.js";
import { useT } from "../../lib/i18n.jsx";

/* SBM-103 — one block of "note + voice + photo + video", used for Share
   update, admin replies, and each half of the done form. Controlled:
   `value` is { body, files: [{ key, file, name, kind, url }] } and every
   change goes through onChange. Nothing uploads until the parent submits. */

export const emptySection = () => ({ body: "", files: [] });
export const isSectionEmpty = (v) => !v?.body?.trim() && !(v?.files?.length > 0);

let seq = 0;
const kindOf = (file) => (file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "voice" : "photo");

function withFile(value, file, name) {
  const url = URL.createObjectURL(file);
  return { ...value, files: [...value.files, { key: `f${++seq}`, file, name: name ?? file.name, kind: kindOf(file), url }] };
}

const chipButton = { ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 40, display: "inline-flex", alignItems: "center", gap: 6 };

export function UpdateComposer({ value, onChange, disabled = false, placeholder, autoFocus = false }) {
  const tr = useT();
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const recorder = useRecorder();
  const valueRef = useRef(value);
  valueRef.current = value;

  // Object URLs are only for previews — release them when the composer goes away.
  useEffect(() => () => valueRef.current?.files?.forEach((f) => URL.revokeObjectURL(f.url)), []);

  const addFile = (file, name) => {
    if (file) onChange(withFile(valueRef.current, file, name));
  };
  const removeFile = (key) => {
    const gone = value.files.find((f) => f.key === key);
    if (gone) URL.revokeObjectURL(gone.url);
    onChange({ ...value, files: value.files.filter((f) => f.key !== key) });
  };

  const keepRecording = async () => {
    try {
      await recorder.save(async (blob, fileName) => addFile(blob, fileName));
      recorder.reset();
    } catch {
      // useRecorder keeps the take and shows its error.
    }
  };

  const mm = String(Math.floor(recorder.elapsedS / 60)).padStart(2, "0");
  const ss = String(recorder.elapsedS % 60).padStart(2, "0");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        value={value.body}
        onChange={(e) => onChange({ ...value, body: e.target.value })}
        placeholder={placeholder ?? tr("writeNote")}
        disabled={disabled}
        autoFocus={autoFocus}
        rows={3}
        style={{ ...TEXT_INPUT_STYLE, minHeight: 72, resize: "vertical", fontFamily: "inherit" }}
      />

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          addFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          addFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {recorder.status === "idle" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={disabled} onClick={recorder.start} style={chipButton}>
            <Mic size={14} /> {tr("voice")}
          </button>
          <button type="button" disabled={disabled} onClick={() => photoRef.current?.click()} style={chipButton}>
            <Image size={14} /> {tr("photo")}
          </button>
          <button type="button" disabled={disabled} onClick={() => videoRef.current?.click()} style={chipButton}>
            <Video size={14} /> {tr("video")}
          </button>
        </div>
      )}

      {recorder.status === "recording" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.signal }} />
          <span style={{ fontFamily: t.display, fontSize: 16, color: t.signal }}>
            {mm}:{ss}
          </span>
          <button type="button" onClick={recorder.stop} style={chipButton}>
            <Square size={13} /> {tr("stop")}
          </button>
        </div>
      )}

      {(recorder.status === "recorded" || recorder.status === "saving") && recorder.previewUrl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <AudioPlayer src={recorder.previewUrl} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={recorder.reset} style={chipButton}>
              {tr("discard")}
            </button>
            <button type="button" onClick={keepRecording} style={{ ...chipButton, borderColor: t.accent, color: t.accent }}>
              {tr("save")}
            </button>
          </div>
        </div>
      )}
      {recorder.error && <span style={{ fontSize: 12, color: t.signal }}>{recorder.error}</span>}

      {value.files.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {value.files.map((f) => (
            <li key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${t.frost}`, borderRadius: t.radiusButton, padding: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {f.kind === "photo" && <img src={f.url} alt="" style={{ display: "block", maxHeight: 80, maxWidth: "100%", borderRadius: 4 }} />}
                {f.kind === "video" && <video src={f.url} style={{ display: "block", maxHeight: 80, maxWidth: "100%", borderRadius: 4 }} />}
                {f.kind === "voice" && <AudioPlayer src={f.url} />}
              </div>
              <button
                type="button"
                aria-label={tr("remove")}
                disabled={disabled}
                onClick={() => removeFile(f.key)}
                style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 32, padding: "0 8px" }}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useState, useRef } from "react";
import { Mic, Image, Video, Check } from "lucide-react";
import { t } from "../../theme.js";
import { PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { postSiteComplaint } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { VoiceNoteModal } from "../sites/VoiceNoteModal.jsx";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";

const actionButtonStyle = (busy) => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  minHeight: 40,
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
  fontSize: 13,
  fontWeight: 600,
  cursor: busy ? "wait" : "pointer",
  whiteSpace: "nowrap",
});

/* Site-level complaint — voice note required before submit; optional text,
   then optional photo/video once voice is attached. Writes to escalations
   (admin tile) and site timeline media. */
export function SiteComplaintForm({ site, onBack, onSubmitted }) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(null); // { blob, fileName, previewUrl }
  const [media, setMedia] = useState([]); // { file, previewUrl?, kind }
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const attachVoice = async (blob, fileName) => {
    if (voice?.previewUrl) URL.revokeObjectURL(voice.previewUrl);
    setVoice({ blob, fileName, previewUrl: URL.createObjectURL(blob) });
    setError("");
  };

  const addMediaFile = (file) => {
    if (!file || !voice) return;
    const kind = file.type.startsWith("video/") ? "video" : "photo";
    if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) return;
    const previewUrl = kind === "photo" ? URL.createObjectURL(file) : null;
    setMedia((prev) => [...prev, { file, previewUrl, kind, name: file.name }]);
  };

  const removeMedia = (idx) => {
    setMedia((prev) => {
      const next = [...prev];
      const removed = next.splice(idx, 1)[0];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  };

  const submit = async () => {
    if (!voice?.blob || saving) return;
    setSaving(true);
    setError("");
    try {
      await postSiteComplaint(
        site.id,
        text.trim() || `Complaint at ${site.name}`,
        voice.blob,
        voice.fileName,
        media.map((m) => m.file)
      );
      onSubmitted?.();
    } catch (err) {
      console.error("[sbm] failed to file complaint", err);
      setError(err.message || "Failed to submit — try again.");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = Boolean(voice?.blob) && !saving;

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {site.name} — Complaint
      </h1>

      <Card>
        {!voice ? (
          <>
            <p style={{ fontSize: 14, color: t.edge2, margin: "0 0 12px", lineHeight: 1.5 }}>
              Record a voice note describing the complaint. You can add photos or video after.
            </p>
            <button
              onClick={() => setShowVoiceModal(true)}
              style={{ ...actionButtonStyle(false), width: "100%", justifyContent: "center" }}
            >
              <Mic size={15} /> Record voice note
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "12px",
                borderRadius: t.radiusButton,
                border: `1px solid ${t.accent}`,
                background: t.frostSoft,
                marginBottom: 12,
              }}
            >
              <Check size={18} color={t.accent} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.edge, marginBottom: 6 }}>Voice note attached</div>
                <AudioPlayer src={voice.previewUrl} />
                <button
                  onClick={() => setShowVoiceModal(true)}
                  style={{
                    marginTop: 8,
                    padding: 0,
                    border: "none",
                    background: "none",
                    fontSize: 12,
                    fontWeight: 600,
                    color: t.accent,
                    cursor: "pointer",
                  }}
                >
                  Re-record
                </button>
              </div>
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Optional short note (voice note is the main record)"
              rows={3}
              style={{
                width: "100%",
                padding: "10px",
                border: `1px solid ${t.frost}`,
                borderRadius: t.radiusButton,
                fontFamily: t.body,
                fontSize: 14,
                color: t.edge,
                background: t.white,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                addMediaFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                addMediaFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => photoInputRef.current?.click()}
                style={actionButtonStyle(saving)}
              >
                <Image size={15} /> Add photo
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => videoInputRef.current?.click()}
                style={actionButtonStyle(saving)}
              >
                <Video size={15} /> Add video
              </button>
            </div>

            {media.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {media.map((m, idx) => (
                  <div
                    key={`${m.name}-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      border: `1px solid ${t.frost}`,
                      borderRadius: t.radiusButton,
                      background: t.white,
                    }}
                  >
                    {m.previewUrl ? (
                      <img
                        src={m.previewUrl}
                        alt=""
                        style={{ width: 44, height: 44, objectFit: "cover", borderRadius: t.radius, flexShrink: 0 }}
                      />
                    ) : (
                      <Video size={20} color={t.edge2} style={{ flexShrink: 0 }} />
                    )}
                    <span style={{ flex: 1, fontSize: 13, color: t.edge, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {m.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeMedia(idx)}
                      style={{
                        padding: "4px 8px",
                        border: "none",
                        background: "none",
                        fontSize: 12,
                        color: t.edge2,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {error && <p style={{ fontSize: 12, color: t.signal, margin: "10px 0 0" }}>{error}</p>}

        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            ...PRIMARY_BUTTON_STYLE,
            marginTop: 14,
            width: "100%",
            cursor: saving ? "wait" : "pointer",
            opacity: canSubmit ? 1 : 0.6,
          }}
        >
          {saving ? "Submitting…" : "Submit complaint"}
        </button>
      </Card>

      {showVoiceModal && (
        <VoiceNoteModal
          onClose={() => setShowVoiceModal(false)}
          onSave={attachVoice}
        />
      )}
    </div>
  );
}

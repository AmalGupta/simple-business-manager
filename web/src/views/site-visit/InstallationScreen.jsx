import { useState, useEffect, useMemo, useRef } from "react";
import { Image, Video, Mic, Check } from "lucide-react";
import { t } from "../../theme.js";
import { INSTALLATION_UPDATE_CATEGORIES } from "../../lib/constants.js";
import { fetchInstallation, postInstallationUpdate, postInstallationUpdateMedia } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { VoiceNoteModal } from "../sites/VoiceNoteModal.jsx";

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

/*
 * The 6-row field checklist for one installation — see docs/BUILD... plan
 * notes on the staff site-visit workflow. Rule (from the brainstorm sketch):
 * a row shows only "Add Voice Note" until one is recorded; once it has a
 * voice note, Photo/Video buttons appear (Video only if the category
 * allows it — the "Location" row is photo-only); once it has a voice note
 * PLUS at least one photo/video, the row is "complete" — this is a
 * read-time computation (voice_note_call_id + media_count from the API),
 * not a stored status. Completion is shown with an accent border + check,
 * not a tinted fill, per docs/DESIGN_LANGUAGE.md's "flat or it's wrong"
 * surface rule (tints were explicitly retired).
 */
export function InstallationScreen({ installation, onBack }) {
  const [updates, setUpdates] = useState(null);
  const [recordingCategory, setRecordingCategory] = useState(null);
  const [busyUpdateId, setBusyUpdateId] = useState(null);
  const photoTargetRef = useRef(null);
  const videoTargetRef = useRef(null);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const load = () => {
    fetchInstallation(installation.id)
      .then((data) => setUpdates(data.updates))
      .catch((err) => {
        console.error("[sbm] failed to load installation", err);
        setUpdates([]);
      });
  };

  useEffect(load, [installation.id]);

  // Updates come back oldest-first, so the last one written per category
  // (a repeat visit creates a new row rather than editing the old one) is
  // the current state of that checklist row.
  const latestByCategory = useMemo(() => {
    const m = new Map();
    for (const u of updates ?? []) m.set(u.category, u);
    return m;
  }, [updates]);

  const handleVoiceNote = async (category, blob, fileName) => {
    await postInstallationUpdate(installation.id, category, blob, fileName);
    load();
  };

  const handleMediaFile = async (file) => {
    const updateId = photoTargetRef.current ?? videoTargetRef.current;
    if (!file || !updateId) return;
    setBusyUpdateId(updateId);
    try {
      await postInstallationUpdateMedia(updateId, file);
      load();
    } catch (err) {
      console.error("[sbm] failed to attach media", err);
    } finally {
      setBusyUpdateId(null);
      photoTargetRef.current = null;
      videoTargetRef.current = null;
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>{installation.label}</h1>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          handleMediaFile(e.target.files?.[0]);
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
          handleMediaFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {updates === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : (
        INSTALLATION_UPDATE_CATEGORIES.map((cat) => {
          const current = latestByCategory.get(cat.key);
          const hasVoice = Boolean(current?.voice_note_call_id);
          const complete = hasVoice && current.media_count > 0;
          const busy = busyUpdateId === current?.id;

          return (
            <Card
              key={cat.key}
              style={{
                marginBottom: 10,
                border: complete ? `2px solid ${t.accent}` : `1px solid ${t.frost}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: hasVoice ? 10 : 0 }}>
                <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 500, color: t.edge }}>{cat.label}</span>
                {complete && <Check size={18} color={t.accent} />}
              </div>

              {!hasVoice && (
                <button onClick={() => setRecordingCategory(cat.key)} style={actionButtonStyle(false)}>
                  <Mic size={15} /> Add voice note
                </button>
              )}

              {hasVoice && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.edge2 }}>
                    <Mic size={13} /> Voice note recorded
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => {
                      photoTargetRef.current = current.id;
                      photoInputRef.current?.click();
                    }}
                    style={actionButtonStyle(busy)}
                  >
                    <Image size={15} /> Add photo
                  </button>
                  {cat.allowVideo && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        videoTargetRef.current = current.id;
                        videoInputRef.current?.click();
                      }}
                      style={actionButtonStyle(busy)}
                    >
                      <Video size={15} /> Add video
                    </button>
                  )}
                </div>
              )}

              {complete && (
                <button
                  onClick={() => setRecordingCategory(cat.key)}
                  style={{ all: "unset", cursor: "pointer", display: "block", marginTop: 8, fontSize: 12, fontWeight: 600, color: t.accent }}
                >
                  Log another update →
                </button>
              )}
            </Card>
          );
        })
      )}

      {recordingCategory && (
        <VoiceNoteModal
          onClose={() => setRecordingCategory(null)}
          onSave={async (blob, fileName) => {
            await handleVoiceNote(recordingCategory, blob, fileName);
          }}
        />
      )}
    </div>
  );
}

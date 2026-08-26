import { useState, useRef } from "react";
import { Image, Video, Mic } from "lucide-react";
import { t } from "../../theme.js";
import { postSiteMedia } from "../../lib/api.js";
import { VoiceNoteModal } from "./VoiceNoteModal.jsx";

/* Add photo / video / voice note — sits at the top of SiteView. Photo/video
   upload immediately on file selection; voice note opens VoiceNoteModal. */
export function SiteMediaUploadRow({ siteId, onUploaded, onVoiceNote }) {
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await postSiteMedia(siteId, file);
      await onUploaded?.();
    } catch (err) {
      console.error("[sbm] media upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const actionButtonStyle = {
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
    cursor: uploading ? "wait" : "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
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
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button disabled={uploading} onClick={() => photoInputRef.current?.click()} style={actionButtonStyle}>
        <Image size={15} /> Add photo
      </button>
      <button disabled={uploading} onClick={() => videoInputRef.current?.click()} style={actionButtonStyle}>
        <Video size={15} /> Add video
      </button>
      <button disabled={uploading} onClick={() => setShowVoiceModal(true)} style={actionButtonStyle}>
        <Mic size={15} /> Add voice note
      </button>
      {showVoiceModal && (
        <VoiceNoteModal
          onClose={() => setShowVoiceModal(false)}
          onSave={async (blob, fileName) => {
            await onVoiceNote(blob, fileName);
          }}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { Mic } from "lucide-react";
import { t } from "../../theme.js";
import { PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { postSiteComplaint } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { VoiceNoteModal } from "../sites/VoiceNoteModal.jsx";

/* Site-level complaint — the home category grid's "Complaints" box, not
   nested in an installation. Writes straight into the existing escalations
   table (source: staff_field), so it shows up in the admin Escalations
   tile immediately. Text is required (escalations.text is NOT NULL); the
   voice note is an optional supplementary attachment, unlike the
   installation checklist's required-voice-note rule. */
export function SiteComplaintForm({ site, onBack, onSubmitted }) {
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(null); // { blob, fileName }
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");
    try {
      await postSiteComplaint(site.id, trimmed, voice?.blob, voice?.fileName);
      onSubmitted?.();
    } catch (err) {
      console.error("[sbm] failed to file complaint", err);
      setError("Failed to submit — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>{site.name} — Complaint</h1>

      <Card>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's the complaint?"
          rows={4}
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

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button
            onClick={() => setShowVoiceModal(true)}
            style={{
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
              cursor: "pointer",
            }}
          >
            <Mic size={15} /> {voice ? "Voice note attached" : "Add voice note (optional)"}
          </button>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: t.signal, margin: "10px 0 0" }}>{error}</p>
        )}

        <button
          onClick={submit}
          disabled={saving || !text.trim()}
          style={{ ...PRIMARY_BUTTON_STYLE, marginTop: 14, width: "100%", cursor: saving ? "wait" : "pointer", opacity: saving || !text.trim() ? 0.6 : 1 }}
        >
          {saving ? "Submitting…" : "Submit complaint"}
        </button>
      </Card>

      {showVoiceModal && (
        <VoiceNoteModal
          onClose={() => setShowVoiceModal(false)}
          onSave={async (blob, fileName) => {
            setVoice({ blob, fileName });
          }}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";

/* Popup for self-service phone update — no current-value confirmation (a
   phone number isn't a credential, unlike the PIN reset above). Updates
   users.phone, which the assign-team roster and a site's Team card both
   read live. */
export function UpdatePhoneModal({ currentPhone, onClose, onSave }) {
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(phone.trim());
      onClose();
    } catch (err) {
      setError(err.message || "Failed to update phone.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Update phone"
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
          gap: 10,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Update phone</span>
        <input
          autoFocus
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <p style={{ fontSize: 12, color: t.edge2, margin: 0 }}>
          Shown wherever you're listed as a site's assigned team member.
        </p>
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: "0 16px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

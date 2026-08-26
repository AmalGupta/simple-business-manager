import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";

/* Popup for self-service PIN reset — requires the current PIN (not the
   admin X-SBM-Key), same modal idiom as AssignTeamModal/VoiceNoteModal. */
export function ResetPinModal({ onClose, onReset }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!/^\d{4,6}$/.test(newPin)) {
      setError("New PIN must be 4-6 digits.");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PIN and confirmation don't match.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onReset(currentPin, newPin);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to reset PIN.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reset PIN"
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
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Reset PIN</span>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          placeholder="Current PIN"
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder="New PIN (4-6 digits)"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder="Confirm new PIN"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
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

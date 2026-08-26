import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";

/* "Add staff" — name + optional phone. The PIN is generated server-side and
   returned once here; it stays viewable afterward from the row's reveal
   toggle (see docs "PIN visibility" decision), so there's no separate
   one-time-only confirmation screen to build. */
export function AddStaffModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await onCreate(trimmed, phone.trim());
      setCreated(result);
    } catch (err) {
      console.error("[sbm] failed to add staff", err);
      setError(err.message || "Failed to add — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add staff"
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
        {created ? (
          <>
            <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
              {created.name} added
            </span>
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>
              Share this PIN with {created.name} to log in. You can view it again later from the Staff page.
            </p>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 2, color: t.edge, fontVariantNumeric: "tabular-nums" }}>
              {created.pin}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={onClose} style={PRIMARY_BUTTON_STYLE}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Add staff</span>
            <input
              autoFocus
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={TEXT_INPUT_STYLE}
            />
            <input
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
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
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";

/* Popup for "Add new site" — name plus the same optional address/POC
   fields SiteView's own details form uses (identical placeholders), so a
   site created here looks no different from one filled in afterward.
   Team assignment and photo/video/voice-note upload aren't collected here
   — creating the site hands off straight into SiteView, where that flow
   already exists, rather than duplicating it in this modal. */
export function AddSiteModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [pocName, setPocName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a site name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate(trimmedName, address.trim(), pocName.trim());
    } catch (err) {
      console.error("[sbm] failed to create site", err);
      setError("Failed to create site — try again.");
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add new site"
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
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Add new site</span>
        <input
          autoFocus
          placeholder="Site name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          placeholder="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          placeholder="Point of contact name"
          value={pocName}
          onChange={(e) => setPocName(e.target.value)}
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
            {saving ? "Adding…" : "Add site"}
          </button>
        </div>
      </div>
    </div>
  );
}

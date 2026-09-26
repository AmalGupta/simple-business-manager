import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";

const CATEGORY_OPTIONS = [
  { value: "client", label: "Client" },
  { value: "vendor", label: "Vendor" },
  { value: "supplier", label: "Supplier" },
  { value: "transporter", label: "Transporter" },
  { value: "tech", label: "Tech" },
  { value: "staff", label: "Staff" },
  { value: "family", label: "Family" },
  { value: "relative", label: "Relative" },
  { value: "spam", label: "Spam" },
];

/* "Add contact" — name, phone, category. Choosing Staff creates/links a
   staff login (parent handles promote + confirm PIN modal). */
export function AddCallerModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("client");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate({
        name: trimmed,
        phone: phone.trim() || null,
        category,
      });
      onClose();
    } catch (err) {
      console.error("[sbm] failed to add caller", err);
      setError(err.message || "Failed to add — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add contact"
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
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Add contact</span>
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
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={TEXT_INPUT_STYLE}>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {category === "staff" && (
          <p style={{ margin: 0, fontSize: 12, color: t.edge2, lineHeight: 1.4 }}>
            A Staff login and PIN will be created so they can sign in to SBM.
          </p>
        )}
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
      </div>
    </div>
  );
}

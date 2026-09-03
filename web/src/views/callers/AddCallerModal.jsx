import { useState, useEffect } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { fetchStaffRoster } from "../../lib/api.js";

const CATEGORY_OPTIONS = [
  { value: "client", label: "Client" },
  { value: "staff", label: "Staff" },
  { value: "family", label: "Family" },
  { value: "spam", label: "Spam" },
];

/* "Add caller" — name, phone, category. Single-phase (unlike AddStaffModal):
   there's no generated secret to show back afterward. When category is
   "staff", an optional staff-roster picker links this caller to their real
   login account (callers.staff_user_id) — read-only lookup via
   fetchStaffRoster, distinct from the onCreate mutation itself, which stays
   parent-owned like every other Add*Modal in this app. */
export function AddCallerModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("client");
  const [staffUserId, setStaffUserId] = useState("");
  const [staffRoster, setStaffRoster] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (category !== "staff") return;
    fetchStaffRoster()
      .then(setStaffRoster)
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  }, [category]);

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
        staff_user_id: category === "staff" && staffUserId ? staffUserId : null,
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
      aria-label="Add caller"
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
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Add caller</span>
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
          <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} style={TEXT_INPUT_STYLE}>
            <option value="">Not linked to a staff account</option>
            {staffRoster.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
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

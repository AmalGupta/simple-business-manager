import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";

/**
 * After a contact is promoted to staff: show generated login + PIN, allow
 * edits, then Confirm persists them so the staff member can log in.
 */
export function PromoteStaffConfirmModal({ promotion, onConfirm, onClose }) {
  const [loginName, setLoginName] = useState(promotion.login_name ?? "");
  const [pin, setPin] = useState(promotion.pin ?? "");
  const [alias, setAlias] = useState(promotion.alias ?? "");
  const [editingLogin, setEditingLogin] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const name = loginName.trim();
    const nextPin = pin.trim();
    if (!name) {
      setError("Enter a login name.");
      return;
    }
    if (!/^\d{4,6}$/.test(nextPin)) {
      setError("PIN must be 4–6 digits.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm({
        login_name: name,
        pin: nextPin,
        alias: alias.trim(),
      });
      onClose();
    } catch (err) {
      console.error("[sbm] failed to confirm staff promotion", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Contact promoted to staff"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 110,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
          Contact promoted to staff
        </span>
        <p style={{ margin: 0, fontSize: 13, color: t.edge2, lineHeight: 1.45 }}>
          Contact <strong style={{ color: t.edge }}>{promotion.contact_name}</strong> promoted to staff.
          Confirm the login details below so they can sign in to SBM.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: t.label, fontSize: 11, fontWeight: 700, color: t.edge2, textTransform: "uppercase" }}>
            Alias
          </span>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Spoken name for auto-assign"
            style={TEXT_INPUT_STYLE}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontFamily: t.label,
              fontSize: 11,
              fontWeight: 700,
              color: t.edge2,
              textTransform: "uppercase",
            }}
          >
            Login name
            <button
              type="button"
              onClick={() => setEditingLogin((v) => !v)}
              style={{
                border: 0,
                background: "transparent",
                color: t.accent,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
                textTransform: "none",
                fontFamily: t.sans,
              }}
            >
              {editingLogin ? "Done" : "Edit"}
            </button>
          </span>
          <input
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            readOnly={!editingLogin}
            style={{
              ...TEXT_INPUT_STYLE,
              background: editingLogin ? t.white : "var(--color-canvas, #f6f7f9)",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontFamily: t.label,
              fontSize: 11,
              fontWeight: 700,
              color: t.edge2,
              textTransform: "uppercase",
            }}
          >
            PIN
            <button
              type="button"
              onClick={() => setEditingPin((v) => !v)}
              style={{
                border: 0,
                background: "transparent",
                color: t.accent,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
                textTransform: "none",
                fontFamily: t.sans,
              }}
            >
              {editingPin ? "Done" : "Edit"}
            </button>
          </span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            readOnly={!editingPin}
            inputMode="numeric"
            style={{
              ...TEXT_INPUT_STYLE,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: editingPin ? 1 : 2,
              fontWeight: 600,
              background: editingPin ? t.white : "var(--color-canvas, #f6f7f9)",
            }}
          />
        </label>

        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            type="button"
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
            Later
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

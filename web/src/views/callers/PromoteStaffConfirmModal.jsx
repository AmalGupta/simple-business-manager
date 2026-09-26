import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";

function cleanPin(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\D/g, "")
    .trim();
}

/**
 * After a contact is promoted to staff: show generated or linked login + PIN,
 * allow edits, then Confirm persists them so the staff member can log in.
 */
export function PromoteStaffConfirmModal({ promotion, onConfirm, onClose }) {
  const linkedExisting = Boolean(promotion.linked_existing || promotion.already_linked);
  const [loginName, setLoginName] = useState((promotion.login_name ?? "").trim());
  const [pin, setPin] = useState(cleanPin(promotion.pin));
  const [alias, setAlias] = useState((promotion.alias ?? "").trim());
  /* Linked accounts: start in edit mode so the admin can change name/PIN if needed. */
  const [editingLogin, setEditingLogin] = useState(linkedExisting);
  const [editingPin, setEditingPin] = useState(linkedExisting);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const name = loginName.trim();
    const nextPin = cleanPin(pin);
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
      setEditingLogin(true);
    } finally {
      setSaving(false);
    }
  };

  const headline = linkedExisting ? "Linked to existing staff login" : "Contact promoted to staff";
  const body = linkedExisting ? (
    <>
      Contact <strong style={{ color: t.edge }}>{promotion.contact_name}</strong> is linked to staff
      login <strong style={{ color: t.edge }}>{promotion.login_name}</strong>. Edit the login name or
      PIN if needed, then Confirm.
    </>
  ) : (
    <>
      Contact <strong style={{ color: t.edge }}>{promotion.contact_name}</strong> promoted to staff.
      Confirm the login details below so they can sign in to SBM.
    </>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={headline}
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
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>{headline}</span>
        <p style={{ margin: 0, fontSize: 13, color: t.edge2, lineHeight: 1.45 }}>{body}</p>

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
            onChange={(e) => setPin(cleanPin(e.target.value).slice(0, 6))}
            readOnly={!editingPin}
            inputMode="numeric"
            autoComplete="off"
            style={{
              ...TEXT_INPUT_STYLE,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: 0.5,
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

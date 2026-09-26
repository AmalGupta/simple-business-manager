import { useState, useEffect } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { fetchStaffDeletePreview, postDeleteStaff } from "../../lib/api.js";

function cleanPin(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/\D/g, "")
    .trim();
}

/**
 * Staff-page delete wizard: re-link / unlink / create for linked contacts,
 * then hard-delete the login.
 */
export function DeleteStaffModal({ staffUser, onClose, onDeleted }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(null); // recommend | pick | create | bare
  const [relinkId, setRelinkId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPin, setCreatePin] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchStaffDeletePreview(staffUser.id)
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        if (!data.has_linked_contacts) {
          setMode("bare");
        } else if (data.has_similar) {
          setMode("recommend");
          setRelinkId(data.recommendations[0]?.id ?? "");
        } else {
          setMode("choose");
        }
        setCreateName(data.linked_contacts[0]?.name || staffUser.name || "");
        setCreatePhone(data.linked_contacts[0]?.phone || staffUser.phone || "");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[sbm] delete preview failed", err);
        setError(err.message || "Failed to load delete preview.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [staffUser.id, staffUser.name, staffUser.phone]);

  const contactNames = (preview?.linked_contacts ?? []).map((c) => c.name).join(", ");
  const recommended = preview?.recommendations?.[0] ?? null;

  const runDelete = async (body) => {
    setBusy(true);
    setError("");
    try {
      const result = await postDeleteStaff(staffUser.id, body);
      await onDeleted(result);
      onClose();
    } catch (err) {
      console.error("[sbm] delete staff failed", err);
      setError(err.message || "Failed to delete — try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    const name = createName.trim();
    const pin = cleanPin(createPin);
    if (!name) {
      setError("Enter a login name for the new staff account.");
      return;
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      setError("PIN must be 4–6 digits.");
      return;
    }
    await runDelete({
      contact_action: "create",
      create: {
        name,
        phone: createPhone.trim() || null,
        ...(pin ? { pin } : {}),
      },
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Delete staff ${staffUser.name}`}
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
          maxWidth: 440,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
          Delete {staffUser.name}
        </span>

        {loading ? (
          <p style={{ margin: 0, fontSize: 13, color: t.edge2 }}>Checking linked contacts…</p>
        ) : mode === "bare" ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: t.edge2, lineHeight: 1.45 }}>
              No Contacts Staff link for this login. Delete the staff entry permanently?
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Secondary onClick={onClose}>Cancel</Secondary>
              <button
                type="button"
                disabled={busy}
                onClick={() => runDelete({ contact_action: "none" })}
                style={{ ...PRIMARY_BUTTON_STYLE, opacity: busy ? 0.6 : 1, background: t.signal }}
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        ) : mode === "recommend" ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: t.edge2, lineHeight: 1.45 }}>
              This login is linked to contact{preview.linked_contacts.length > 1 ? "s" : ""}{" "}
              <strong style={{ color: t.edge }}>{contactNames}</strong>. A similar staff login{" "}
              <strong style={{ color: t.edge }}>{recommended?.name}</strong> exists. Associate the
              contact with that login before deleting?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                disabled={busy || !recommended}
                onClick={() =>
                  runDelete({ contact_action: "relink", relink_user_id: recommended.id })
                }
                style={{ ...PRIMARY_BUTTON_STYLE, opacity: busy ? 0.6 : 1 }}
              >
                Associate with {recommended?.name ?? "…"}
              </button>
              <Secondary onClick={() => setMode("pick")}>Choose another staff…</Secondary>
              <Secondary onClick={() => setMode("create")}>Create new staff login…</Secondary>
              <Secondary onClick={onClose}>Cancel</Secondary>
            </div>
          </>
        ) : mode === "choose" ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: t.edge2, lineHeight: 1.45 }}>
              This login is linked to contact{preview.linked_contacts.length > 1 ? "s" : ""}{" "}
              <strong style={{ color: t.edge }}>{contactNames}</strong>. No similar staff login
              found.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => runDelete({ contact_action: "unlink" })}
                style={{ ...PRIMARY_BUTTON_STYLE, opacity: busy ? 0.6 : 1, background: t.signal }}
              >
                Delete staff entry
              </button>
              <Secondary onClick={() => setMode("pick")}>Associate to a different staff</Secondary>
              <Secondary onClick={() => setMode("create")}>Create new staff login</Secondary>
              <Secondary onClick={onClose}>Cancel</Secondary>
            </div>
          </>
        ) : mode === "pick" ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: t.edge2, lineHeight: 1.45 }}>
              Choose a staff login to keep linked to{" "}
              <strong style={{ color: t.edge }}>{contactNames || "the contact"}</strong>, then
              delete <strong style={{ color: t.edge }}>{staffUser.name}</strong>.
            </p>
            <select
              value={relinkId}
              onChange={(e) => setRelinkId(e.target.value)}
              style={TEXT_INPUT_STYLE}
            >
              <option value="">Select staff…</option>
              {(preview?.roster ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Secondary
                onClick={() => setMode(preview?.has_similar ? "recommend" : "choose")}
              >
                Back
              </Secondary>
              <button
                type="button"
                disabled={busy || !relinkId}
                onClick={() => runDelete({ contact_action: "relink", relink_user_id: relinkId })}
                style={{ ...PRIMARY_BUTTON_STYLE, opacity: busy || !relinkId ? 0.6 : 1 }}
              >
                {busy ? "Deleting…" : "Associate & delete"}
              </button>
            </div>
          </>
        ) : mode === "create" ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: t.edge2, lineHeight: 1.45 }}>
              Create a new staff login for{" "}
              <strong style={{ color: t.edge }}>{contactNames || "the contact"}</strong>, then
              delete <strong style={{ color: t.edge }}>{staffUser.name}</strong>.
            </p>
            <input
              placeholder="Login name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              style={TEXT_INPUT_STYLE}
            />
            <input
              placeholder="Phone (optional)"
              value={createPhone}
              onChange={(e) => setCreatePhone(e.target.value)}
              style={TEXT_INPUT_STYLE}
            />
            <input
              placeholder="PIN (optional — generated if blank)"
              value={createPin}
              onChange={(e) => setCreatePin(cleanPin(e.target.value).slice(0, 6))}
              inputMode="numeric"
              style={TEXT_INPUT_STYLE}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Secondary
                onClick={() => setMode(preview?.has_similar ? "recommend" : "choose")}
              >
                Back
              </Secondary>
              <button
                type="button"
                disabled={busy}
                onClick={submitCreate}
                style={{ ...PRIMARY_BUTTON_STYLE, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Creating…" : "Create & delete"}
              </button>
            </div>
          </>
        ) : null}

        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
      </div>
    </div>
  );
}

function Secondary({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      {children}
    </button>
  );
}

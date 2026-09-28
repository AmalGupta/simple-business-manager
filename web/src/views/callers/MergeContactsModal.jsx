import { useState } from "react";
import { t } from "../../theme.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import { postMergeCallers } from "../../lib/api.js";
import { callerCategoryLabel, isStaffCategory } from "../../lib/callerCategories.js";
import { contactPhones } from "./contactPhones.js";

/* Merge two contacts into one (migration 0048). The admin picks which name
   the merged contact keeps; the other name stays on it as an alias. Every
   number, call, site link and alias ends up on the merged contact. If
   either is staff, the merged contact is staff with its login unchanged —
   the server picks the surviving row so the login link is never lost. */
export function MergeContactsModal({ contacts, onClose, onMerged }) {
  const [a, b] = contacts;
  const [keepId, setKeepId] = useState(() => {
    // Default to the staff one, else the one with a real name / more calls.
    if (isStaffCategory(a.category) !== isStaffCategory(b.category)) return isStaffCategory(a.category) ? a.id : b.id;
    return (b.calls ?? 0) > (a.calls ?? 0) ? b.id : a.id;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loginConflict = a.staff_user_id && b.staff_user_id && a.staff_user_id !== b.staff_user_id;
  const staff = [a, b].find((c) => isStaffCategory(c.category) || c.staff_user_id);
  const kept = keepId === a.id ? a : b;
  const allPhones = [...new Set([...contactPhones(a), ...contactPhones(b)])];

  const merge = async () => {
    setBusy(true);
    setError("");
    try {
      const merged = await postMergeCallers([a.id, b.id], kept.name.trim());
      onMerged?.(merged);
    } catch (err) {
      setError(err.message || "Merge failed — try again.");
      setBusy(false);
    }
  };

  return (
    <Modal label="Merge contacts" title="Merge contacts" onClose={onClose} width={440} scroll>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 12px" }}>
        Pick the name to keep. Calls, numbers, sites and aliases of both end up on one contact.
      </p>

      <div role="radiogroup" aria-label="Name to keep" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[a, b].map((c) => (
          <label
            key={c.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "10px 12px",
              border: `1px solid ${keepId === c.id ? t.accent : t.frost}`,
              borderRadius: t.radiusCard,
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="keep-name"
              checked={keepId === c.id}
              onChange={() => setKeepId(c.id)}
              style={{ marginTop: 3 }}
            />
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: t.edge }}>{c.name}</span>
              <span style={{ fontSize: 12, color: t.edge2 }}>
                {contactPhones(c).join(" · ") || "no number"} · {callerCategoryLabel(c.category)}
                {c.staff_user_name ? ` · login ${c.staff_user_name}` : ""}
                {c.calls != null ? ` · ${c.calls} calls` : ""}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div style={{ fontSize: 12, color: t.edge2, margin: "12px 0 0", lineHeight: 1.5 }}>
        <div>
          Merged contact: <strong style={{ color: t.edge }}>{kept.name}</strong>
          {allPhones.length ? ` — ${allPhones.join(", ")}` : ""}
        </div>
        {staff && !loginConflict && (
          <div>
            Type becomes {callerCategoryLabel(isStaffCategory(staff.category) ? staff.category : "service_staff")}
            {staff.staff_user_name ? `; login ${staff.staff_user_name} stays linked` : ""}.
          </div>
        )}
      </div>

      {loginConflict && (
        <p style={{ fontSize: 12, color: t.putty, fontWeight: 600, margin: "10px 0 0" }}>
          These are linked to two different staff logins — unlink one before merging.
        </p>
      )}
      {error && <p style={{ fontSize: 12, color: t.signal, margin: "10px 0 0" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button type="button" onClick={onClose} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 40 }}>
          Cancel
        </button>
        <button
          type="button"
          onClick={merge}
          disabled={busy || loginConflict}
          style={{ ...PRIMARY_BUTTON_STYLE, opacity: busy || loginConflict ? 0.6 : 1 }}
        >
          {busy ? "Merging…" : "Merge"}
        </button>
      </div>
    </Modal>
  );
}

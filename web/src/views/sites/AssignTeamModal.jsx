import { useState, useEffect } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { fetchStaffRoster } from "../../lib/api.js";

/* Popup for "Assign team" — see docs/ADDITIONAL_FEATURES_M0.md follow-up.
   Two fields, add-or-cancel — deliberately not a full contact form. */
/* Assigns a real staff account (dropdown, phone auto-filled from their
   profile) rather than free text — migration 0011. Staff with no phone on
   file yet are shown but disabled, since the backend rejects those. */
export function AssignTeamModal({ onClose, onAdd }) {
  const [staff, setStaff] = useState(null);
  const [staffId, setStaffId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchStaffRoster()
      .then((data) => {
        if (cancelled) return;
        setStaff(data);
        setStaffId(data[0]?.id ?? "");
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = staff?.find((s) => s.id === staffId) ?? null;

  const submit = async () => {
    if (!staffId) {
      setError("Choose a staff member.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAdd(staffId);
      onClose();
    } catch (err) {
      console.error("[sbm] failed to add team member", err);
      setError(err.message || "Failed to add — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Assign team member"
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
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Assign team member</span>
        {staff === null ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Loading staff…</p>
        ) : staff.length === 0 ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>No staff yet — add one from the Staff page first.</p>
        ) : (
          <>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={TEXT_INPUT_STYLE}>
              {/* A real, always-present option for the "" default — without
                  it, if the roster ever loads empty before staff is set, the
                  select's value matches no <option> at all, which leaves it
                  stuck showing the first entry and unresponsive to taps on
                  some mobile browsers. Every staff member is selectable
                  regardless of phone — it's addable later from the Staff
                  page without re-doing the assignment. */}
              <option value="" disabled>
                Choose a staff member…
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 13, color: t.edge2 }}>
              Phone: {selected?.phone || "not on file yet"}
            </div>
          </>
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
          <button
            onClick={submit}
            disabled={saving || !staff?.length}
            style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !staff?.length ? 0.6 : 1 }}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

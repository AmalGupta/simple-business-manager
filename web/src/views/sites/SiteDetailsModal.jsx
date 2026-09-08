import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";

/* ------------------------------------------------------------------
   Site details form, in a dialog.

   These are the migration 0019 intake fields. AddSiteScreen has always
   collected all of them, but SiteView's inline form only exposed three
   (address, point of contact, target date) and the PATCH allowlist only
   accepted four — so a wrong sector or phone number captured at intake
   was effectively permanent. Same fields, now editable.

   Labels match AddSiteScreen exactly. Two forms over the same columns
   that disagree about what a column is called ("H.No" vs "House
   number") is how a field gets filled in twice.
   ------------------------------------------------------------------ */

const FIELDS = [
  { key: "house_no", label: "H.No", placeholder: "House or plot number" },
  { key: "sector", label: "Sector", placeholder: "Sector or locality" },
  { key: "city", label: "City", placeholder: "City" },
  { key: "address", label: "Address", placeholder: "Full address" },
  { key: "poc_name", label: "Contact person", placeholder: "Point of contact name" },
  { key: "poc_contact_number", label: "Contact number", placeholder: "Phone number" },
  { key: "assigned_by", label: "Assigned by", placeholder: "Who assigned this site" },
  { key: "referred_by", label: "Referred by", placeholder: "Who referred it" },
];

const labelStyle = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: t.edge2,
};

function FieldRow({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

/* `extraPatch` is for callers that are doing something to the site beyond
   editing these fields — the review screen confirms as it saves. It's
   merged in before the "nothing changed" check below, so those callers
   still save when the operator only wanted to confirm and left every
   field alone. */
export function SiteDetailsModal({
  site,
  onClose,
  onSave,
  title = "Site details",
  intro = "",
  saveLabel = "Save details",
  extraPatch = null,
}) {
  const [values, setValues] = useState(() => {
    const initial = { target_closure_date: site?.target_closure_date ?? "" };
    for (const f of FIELDS) initial[f.key] = site?.[f.key] ?? "";
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    /* Only changed fields go in the patch. Every detail write appends to
       site_edits and shows up on the site's timeline, so sending all
       eleven every save would stamp "address, sector, city updated" on a
       visit where nothing was touched. Comparing against the loaded
       record keeps the audit trail meaning what it says. */
    const patch = { ...extraPatch };
    for (const f of FIELDS) {
      const next = values[f.key].trim();
      const current = (site?.[f.key] ?? "").trim();
      if (next !== current) patch[f.key] = next || null;
    }
    const nextDate = values.target_closure_date || "";
    const currentDate = site?.target_closure_date ?? "";
    if (nextDate !== currentDate) patch.target_closure_date = nextDate || null;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave(patch);
      onClose();
    } catch (err) {
      console.error("[sbm] failed to save site details", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal label="Site details" title={title} onClose={onClose} width={420} scroll>
      {intro && <p style={{ fontSize: 12, color: t.edge2, margin: "0 0 12px" }}>{intro}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FIELDS.map((f) => (
          <FieldRow key={f.key} label={f.label}>
            <input
              value={values[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
              style={TEXT_INPUT_STYLE}
            />
          </FieldRow>
        ))}
        <FieldRow label="Target closure date">
          <input
            type="date"
            value={values.target_closure_date}
            onChange={(e) => set("target_closure_date", e.target.value)}
            style={TEXT_INPUT_STYLE}
          />
        </FieldRow>
      </div>

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
          disabled={saving}
          style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </Modal>
  );
}

import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import { joinContactEditorRows, siteContactEditorRows } from "./sitesGridChrome.jsx";

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

   Contacts are always multi-row (name + phone). Prefill from linked
   caller_sites when present, otherwise from a comma-split of poc_*.
   Save joins rows back into poc_name / poc_contact_number so display
   compose stays correct, and reports linked-caller edits via onSave's
   second argument.
   ------------------------------------------------------------------ */

const FIELDS = [
  { key: "house_no", label: "H.No", placeholder: "House or plot number" },
  { key: "sector", label: "Sector", placeholder: "Sector or locality" },
  { key: "city", label: "City", placeholder: "City" },
  { key: "address", label: "Address", placeholder: "Full address" },
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

function emptyContactRow() {
  return { key: `new-${crypto.randomUUID()}`, caller_id: null, name: "", phone: "" };
}

/* `extraPatch` is for callers that are doing something to the site beyond
   editing these fields — the review screen confirms as it saves. It's
   merged in before the "nothing changed" check below, so those callers
   still save when the operator only wanted to confirm and left every
   field alone.

   `onSave(patch, { contactUpdates })` — contactUpdates lists linked
   callers whose name/phone changed (caller_id set). */
export function SiteDetailsModal({
  site,
  onClose,
  onSave,
  title = "Site details",
  intro = "",
  saveLabel = "Save details",
  extraPatch = null,
  editableName = false,
}) {
  const [values, setValues] = useState(() => {
    const initial = { target_closure_date: site?.target_closure_date ?? "", name: site?.name ?? "" };
    for (const f of FIELDS) initial[f.key] = site?.[f.key] ?? "";
    return initial;
  });
  const [contactRows, setContactRows] = useState(() => siteContactEditorRows(site));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  const setContactField = (key, field, value) => {
    setContactRows((rows) => rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  const addContactRow = () => setContactRows((rows) => [...rows, emptyContactRow()]);

  const removeContactRow = (key) => {
    setContactRows((rows) => {
      const next = rows.filter((row) => row.key !== key);
      return next.length > 0 ? next : [emptyContactRow()];
    });
  };

  const submit = async () => {
    /* Only changed fields go in the patch. Every detail write appends to
       site_edits and shows up on the site's timeline, so sending all
       eleven every save would stamp "address, sector, city updated" on a
       visit where nothing was touched. Comparing against the loaded
       record keeps the audit trail meaning what it says. */
    const patch = { ...extraPatch };
    /* Not in FIELDS, so the site page's copy of this form can't rename by
       accident: its surrounding view is keyed by the old name and would be
       orphaned by the refetch. Blank is refused rather than collapsed to
       NULL like the rest — sites.name is NOT NULL, and a site with no name
       can't be found again on any screen. */
    if (editableName) {
      const nextName = values.name.trim();
      if (!nextName) {
        setError("A site needs a name.");
        return;
      }
      if (nextName !== (site?.name ?? "").trim()) patch.name = nextName;
    }
    for (const f of FIELDS) {
      const next = values[f.key].trim();
      const current = (site?.[f.key] ?? "").trim();
      if (next !== current) patch[f.key] = next || null;
    }
    const nextDate = values.target_closure_date || "";
    const currentDate = site?.target_closure_date ?? "";
    if (nextDate !== currentDate) patch.target_closure_date = nextDate || null;

    const joined = joinContactEditorRows(contactRows);
    const currentPocName = (site?.poc_name ?? "").trim() || null;
    const currentPocPhone = (site?.poc_contact_number ?? "").trim() || null;
    if ((joined.poc_name ?? null) !== currentPocName) patch.poc_name = joined.poc_name;
    if ((joined.poc_contact_number ?? null) !== currentPocPhone) patch.poc_contact_number = joined.poc_contact_number;

    const originalById = new Map((site?.contacts ?? []).map((c) => [c.caller_id, c]));
    const contactUpdates = [];
    for (const row of contactRows) {
      if (!row.caller_id) continue;
      const prev = originalById.get(row.caller_id);
      if (!prev) continue;
      const name = row.name.trim();
      const phone = row.phone.trim() || null;
      const prevName = (prev.name ?? "").trim();
      const prevPhone = (prev.phone ?? "").trim() || null;
      if (name !== prevName || phone !== prevPhone) {
        if (!name) {
          setError("Linked contacts need a name.");
          return;
        }
        contactUpdates.push({ caller_id: row.caller_id, name, phone });
      }
    }

    if (Object.keys(patch).length === 0 && contactUpdates.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave(patch, { contactUpdates });
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
      {intro ? <p style={{ fontSize: 12, color: t.edge2, margin: "0 0 12px" }}>{intro}</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {editableName ? (
          <FieldRow label="Site name">
            <input
              value={values.name}
              placeholder="Site name"
              onChange={(e) => set("name", e.target.value)}
              style={TEXT_INPUT_STYLE}
            />
          </FieldRow>
        ) : null}
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

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={labelStyle}>
              {contactRows.length <= 1 ? "Contacts" : `Contacts (${contactRows.length})`}
            </span>
            <button type="button" onClick={addContactRow} style={SMALL_SECONDARY_BUTTON_STYLE}>
              Add contact
            </button>
          </div>
          {contactRows.map((row, index) => {
            const n = index + 1;
            const nameLabel = contactRows.length === 1 ? "Contact person" : `Contact ${n}`;
            const phoneLabel = contactRows.length === 1 ? "Contact number" : `Contact ${n} number`;
            return (
              <div
                key={row.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingBottom: index < contactRows.length - 1 ? 10 : 0,
                  borderBottom: index < contactRows.length - 1 ? `1px solid ${t.frostSoft}` : "none",
                }}
              >
                <FieldRow label={nameLabel}>
                  <input
                    value={row.name}
                    placeholder="Point of contact name"
                    onChange={(e) => setContactField(row.key, "name", e.target.value)}
                    style={TEXT_INPUT_STYLE}
                  />
                </FieldRow>
                <FieldRow label={phoneLabel}>
                  <input
                    value={row.phone}
                    placeholder="Phone number"
                    onChange={(e) => setContactField(row.key, "phone", e.target.value)}
                    style={TEXT_INPUT_STYLE}
                  />
                </FieldRow>
                {contactRows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeContactRow(row.key)}
                    style={{ ...SMALL_SECONDARY_BUTTON_STYLE, alignSelf: "flex-start" }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <FieldRow label="Target closure date">
          <input
            type="date"
            value={values.target_closure_date}
            onChange={(e) => set("target_closure_date", e.target.value)}
            style={TEXT_INPUT_STYLE}
          />
        </FieldRow>
      </div>

      {error ? <span style={{ fontSize: 12, color: t.signal }}>{error}</span> : null}

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
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </Modal>
  );
}

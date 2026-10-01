import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import { AssociateContactsModal } from "./AssociateContactsModal.jsx";
import { SiteContactField, siteContactValue } from "./SiteContactField.jsx";

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

   Contacts are directory links (caller_sites), not free-text POC rows.
   Linked contacts are shown read-only here; "Add contact" opens the same
   AssociateContactsModal the review screen uses, so create/link writes
   the Callers Directory and rebuilds display via syncSitePocFromContacts.
   ------------------------------------------------------------------ */

const FIELDS = [
  { key: "house_no", label: "H.No", placeholder: "House or plot number" },
  { key: "sector", label: "Sector", placeholder: "Sector or locality" },
  { key: "city", label: "City", placeholder: "City" },
  { key: "address", label: "Address", placeholder: "Full address" },
];

/* SBM-83 — directory contacts, not free text (see SiteContactField). */
const CONTACT_FIELDS = [
  { key: "assigned_by", label: "Assigned to", placeholder: "Assigned to" },
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

const contactRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: t.edge,
};

const rowBtn = { minHeight: 28, padding: "0 10px", fontSize: 12 };

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
   field alone.

   `onSaveContacts(callerIds)` — links contacts and resolves to the site's
   full contact list. "Add contact" opens AssociateContactsModal in place of
   this form (not on top of it — Escape closes every open Modal) and comes
   back to it with unsaved edits intact (SBM-99).

   `onRemoveContact(callerId)` — unlinks one contact and resolves to the
   remaining list (SBM-101). Like Add contact it writes straight away; the
   server rebuilds the point of contact and display name from what's left. */
export function SiteDetailsModal({
  site,
  onClose,
  onSave,
  onSaveContacts,
  onRemoveContact,
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
  const [contactValues, setContactValues] = useState(() =>
    Object.fromEntries(CONTACT_FIELDS.map((f) => [f.key, siteContactValue(site, f.key)]))
  );
  const [pickingField, setPickingField] = useState(null);
  const [associating, setAssociating] = useState(false);
  const [linkedContacts, setLinkedContacts] = useState(() => site?.contacts ?? []);
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [clearTypedPoc, setClearTypedPoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* A point of contact typed in before contacts came from the directory
     (SBM-83) — no caller_sites row, so there's nothing to unlink; Save
     clears the text instead. */
  /* Judged on the record as opened: after unlinking the last contact,
     site.poc_name still holds that contact's name until the refetch lands. */
  const [typedPocAtOpen] = useState(() =>
    (site?.contacts ?? []).length === 0 && site?.poc_name?.trim()
      ? { name: site.poc_name.trim(), phone: site.poc_contact_number?.trim() || null }
      : null
  );
  /* Linking a contact rewrites poc_name from the directory, replacing it. */
  const typedPoc = linkedContacts.length === 0 ? typedPocAtOpen : null;

  const removeContact = async (callerId) => {
    setRemovingId(callerId);
    setError("");
    try {
      const next = await onRemoveContact(callerId);
      setLinkedContacts(Array.isArray(next) ? next : (list) => list.filter((c) => c.caller_id !== callerId));
      setConfirmRemoveId(null);
    } catch (err) {
      console.error("[sbm] failed to remove site contact", err);
      setError(err.message || "Couldn’t remove the contact — try again.");
    } finally {
      setRemovingId(null);
    }
  };

  /* Confirming from review needs a mapped contact with a number first —
     the server refuses the confirm otherwise (handlePatchSite 409). */
  const confirming = extraPatch?.is_confirmed === "Y" && site?.is_confirmed !== "Y";
  const needsContact = confirming && !linkedContacts.some((c) => c.phone);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));

  const onAddContact = onSaveContacts ? () => setAssociating(true) : null;

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
    /* Only the link is sent; the server writes the name. An untouched
       legacy text value (no caller_id) is left as it is. */
    for (const f of CONTACT_FIELDS) {
      const next = contactValues[f.key];
      const currentId = site?.[`${f.key}_caller_id`] || null;
      const hadValue = Boolean(currentId || site?.[f.key]?.trim());
      if (!next) {
        if (hadValue) patch[`${f.key}_caller_id`] = null;
      } else if (next.caller_id && next.caller_id !== currentId) {
        patch[`${f.key}_caller_id`] = next.caller_id;
      }
    }
    if (typedPoc && clearTypedPoc) {
      patch.poc_name = null;
      patch.poc_contact_number = null;
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

  if (associating) {
    return (
      <AssociateContactsModal
        site={site}
        existingContactIds={linkedContacts.map((c) => c.caller_id)}
        onSave={async (callerIds) => {
          const next = await onSaveContacts(callerIds);
          if (Array.isArray(next)) setLinkedContacts(next);
          return next;
        }}
        onClose={() => setAssociating(false)}
      />
    );
  }

  if (pickingField) {
    const field = CONTACT_FIELDS.find((f) => f.key === pickingField);
    return (
      <AssociateContactsModal
        site={site}
        pick={{
          title: `${field.label} — choose a contact`,
          onPick: (caller) => {
            setContactValues((current) => ({
              ...current,
              [pickingField]: { caller_id: caller.id, name: caller.name, phone: caller.phone || null },
            }));
            setPickingField(null);
          },
        }}
        onClose={() => setPickingField(null)}
      />
    );
  }

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
        {CONTACT_FIELDS.map((f) => (
          <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={labelStyle}>{f.label}</span>
            <SiteContactField
              value={contactValues[f.key]}
              placeholder={f.placeholder}
              onChoose={() => setPickingField(f.key)}
              onClear={() => setContactValues((current) => ({ ...current, [f.key]: null }))}
            />
          </div>
        ))}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={labelStyle}>
              {linkedContacts.length === 0
                ? "Contacts"
                : linkedContacts.length === 1
                  ? "Contacts"
                  : `Contacts (${linkedContacts.length})`}
            </span>
            {onAddContact ? (
              <button type="button" onClick={onAddContact} style={SMALL_SECONDARY_BUTTON_STYLE}>
                Add contact
              </button>
            ) : null}
          </div>
          {typedPoc ? (
            <div style={contactRowStyle}>
              <span style={{ minWidth: 0, textDecoration: clearTypedPoc ? "line-through" : "none" }}>
                {typedPoc.name}
                <span style={{ color: t.putty, marginLeft: 6, fontSize: 12 }}>typed, not a linked contact</span>
              </span>
              <button
                type="button"
                onClick={() => setClearTypedPoc((v) => !v)}
                style={{ ...SMALL_SECONDARY_BUTTON_STYLE, ...rowBtn }}
              >
                {clearTypedPoc ? "Undo" : "Remove"}
              </button>
            </div>
          ) : null}
          {clearTypedPoc ? (
            <p style={{ fontSize: 12, color: t.edge2, margin: 0 }}>Removed when you save.</p>
          ) : null}
          {linkedContacts.length === 0 ? (
            typedPoc ? null : (
              <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>
                {onAddContact
                  ? "No directory contacts linked yet. Add contact opens the same picker as Review sites."
                  : "No directory contacts linked yet."}
              </p>
            )
          ) : (
            linkedContacts.map((c) => (
              <div key={c.caller_id} style={contactRowStyle}>
                <span style={{ minWidth: 0 }}>{c.name}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ color: t.edge2 }}>{c.phone || "no phone"}</span>
                  {onRemoveContact ? (
                    confirmRemoveId === c.caller_id ? (
                      <>
                        <button
                          type="button"
                          disabled={removingId === c.caller_id}
                          onClick={() => removeContact(c.caller_id)}
                          style={{ ...SMALL_SECONDARY_BUTTON_STYLE, ...rowBtn, color: t.signal }}
                        >
                          {removingId === c.caller_id ? "Removing…" : "Yes, remove"}
                        </button>
                        <button
                          type="button"
                          disabled={removingId === c.caller_id}
                          onClick={() => setConfirmRemoveId(null)}
                          style={{ ...SMALL_SECONDARY_BUTTON_STYLE, ...rowBtn }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Remove ${c.name} from this site`}
                        onClick={() => setConfirmRemoveId(c.caller_id)}
                        style={{ ...SMALL_SECONDARY_BUTTON_STYLE, ...rowBtn }}
                      >
                        Remove
                      </button>
                    )
                  ) : null}
                </span>
              </div>
            ))
          )}
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
      {needsContact ? (
        <p style={{ fontSize: 12, color: t.putty, fontWeight: 600, margin: "8px 0 0" }}>
          Map a contact with a phone number (Add contact) before confirming this site.
        </p>
      ) : null}

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
        <button
          type="button"
          onClick={submit}
          disabled={saving || needsContact}
          style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || needsContact ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </Modal>
  );
}

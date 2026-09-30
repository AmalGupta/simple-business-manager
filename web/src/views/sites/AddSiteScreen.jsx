import { useState, useRef } from "react";
import { Image, Mic, MapPin, Ruler } from "lucide-react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { patchSite, postSiteMedia, postSiteVoiceNote } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { VoiceNoteModal } from "./VoiceNoteModal.jsx";
import { AssociateContactsModal } from "./AssociateContactsModal.jsx";
import { SiteContactField } from "./SiteContactField.jsx";
import { ExistingSiteSearch } from "./ExistingSiteSearch.jsx";
import { useT } from "../../lib/i18n.jsx";

const labelStyle = {
  fontFamily: t.label,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge2,
};

function FieldRow({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(100px, 120px) 1fr", gap: 10, alignItems: "center" }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}

const actionTileStyle = (disabled) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 88,
  padding: "12px 8px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusCard,
  background: t.white,
  color: disabled ? t.edge2 : t.edge,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: t.label,
});

/*
 * Full "Add new site" intake — structured address/contact fields plus
 * post-create photo, voice note, GPS pin, and measurement upload actions.
 * Voice notes use the same calls/STT pipeline as SiteView; transcript
 * appears on the sites page timeline for admin only.
 *
 * Assigned by / Referred by are directory contacts (SBM-83), picked with
 * AssociateContactsModal; `defaultAssignedBy` is the signed-in user's own
 * contact (`{ caller_id, name, phone }`) when they have one. The Contacts
 * directory is admin-only, so for staff (`canPickContacts` false) both
 * fields are hidden and an admin fills them later from Review sites or
 * the site page.
 */
export function AddSiteScreen({
  onBack,
  onCreate,
  onDone,
  /* SBM-95 — pick an existing site instead (resolves to the site row). */
  onPickExisting,
  defaultAssignedBy = null,
  canPickContacts = false,
}) {
  const tr = useT();
  const [houseNo, setHouseNo] = useState("");
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [pocName, setPocName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [assignedBy, setAssignedBy] = useState(canPickContacts ? defaultAssignedBy : null);
  const [referredBy, setReferredBy] = useState(null);
  const [pickingField, setPickingField] = useState(null);
  const [siteLocation, setSiteLocation] = useState("");
  const [createdSite, setCreatedSite] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const photoInputRef = useRef(null);
  const measureInputRef = useRef(null);

  const buildDetails = () => ({
    house_no: houseNo.trim() || null,
    sector: sector.trim() || null,
    city: city.trim() || null,
    poc_name: pocName.trim() || null,
    poc_contact_number: contactNumber.trim() || null,
    assigned_by_caller_id: assignedBy?.caller_id || null,
    referred_by_caller_id: referredBy?.caller_id || null,
    site_location: siteLocation.trim() || null,
  });

  const validate = () => {
    if (!houseNo.trim() && !sector.trim() && !city.trim()) {
      setError(tr("enterAddressPart"));
      return false;
    }
    setError("");
    return true;
  };

  const ensureSite = async () => {
    if (createdSite) return createdSite;
    if (!validate()) return null;
    setSaving(true);
    try {
      const site = await onCreate(buildDetails());
      setCreatedSite(site);
      return site;
    } catch (err) {
      console.error("[sbm] failed to create site", err);
      setError(tr("failedCreateSite"));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveSite = async () => {
    const site = await ensureSite();
    if (site) onDone?.(site);
  };

  const applyLocation = async (loc) => {
    setSiteLocation(loc);
    if (createdSite) {
      await patchSite(createdSite.id, { site_location: loc });
    }
  };

  const captureLocation = async () => {
    if (!navigator.geolocation) {
      setLocationStatus(tr("locationUnsupported"));
      return;
    }
    setLocationStatus(tr("gettingLocation"));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
        await applyLocation(loc);
        setLocationStatus(tr("locationCaptured"));
        await ensureSite();
      },
      () => setLocationStatus(tr("locationFailed")),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const actionsDisabled = saving || busyAction;

  const pickExisting = async (site) => {
    setSaving(true);
    setError("");
    try {
      const picked = await onPickExisting(site);
      onDone?.(picked);
    } catch (err) {
      console.error("[sbm] failed to pick existing site", err);
      setError(tr("failedPickSite"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>{tr("back")}</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {tr("addNewSite")}
      </h1>

      {onPickExisting && !createdSite && (
        <>
          <ExistingSiteSearch onPick={pickExisting} disabled={saving} />
          <p style={{ ...labelStyle, margin: "0 0 8px" }}>{tr("orAddNewSite")}</p>
        </>
      )}

      <Card style={{ padding: "1rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <FieldRow label={tr("fieldHouseNo")}>
            <input placeholder={tr("phHouseNo")} value={houseNo} onChange={(e) => setHouseNo(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label={tr("fieldSector")}>
            <input placeholder={tr("phSector")} value={sector} onChange={(e) => setSector(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label={tr("fieldCity")}>
            <input placeholder={tr("fieldCity")} value={city} onChange={(e) => setCity(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label={tr("fieldContactPerson")}>
            <input placeholder={tr("phName")} value={pocName} onChange={(e) => setPocName(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label={tr("fieldContactNumber")}>
            <input placeholder={tr("phPhone")} value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          {canPickContacts && (
            <>
              <FieldRow label={tr("fieldAssignedBy")}>
                <SiteContactField
                  value={assignedBy}
                  placeholder={tr("phAssignedBy")}
                  onChoose={() => setPickingField("assigned_by")}
                  onClear={() => setAssignedBy(null)}
                />
              </FieldRow>
              <FieldRow label={tr("fieldReferredBy")}>
                <SiteContactField
                  value={referredBy}
                  placeholder={tr("phReferredBy")}
                  onChoose={() => setPickingField("referred_by")}
                  onClear={() => setReferredBy(null)}
                />
              </FieldRow>
            </>
          )}
          {siteLocation && (
            <FieldRow label={tr("fieldLocation")}>
              <span style={{ fontSize: 13, color: t.edge2 }}>{siteLocation}</span>
            </FieldRow>
          )}
        </div>
      </Card>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusyAction(true);
          try {
            const site = await ensureSite();
            if (site) await postSiteMedia(site.id, file);
          } catch (err) {
            console.error("[sbm] photo upload failed", err);
            setError(tr("photoUploadFailed"));
          } finally {
            setBusyAction(false);
          }
        }}
      />
      <input
        ref={measureInputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusyAction(true);
          try {
            const site = await ensureSite();
            if (site) await postSiteMedia(site.id, file, "Measurements");
          } catch (err) {
            console.error("[sbm] measurement upload failed", err);
            setError(tr("measurementUploadFailed"));
          } finally {
            setBusyAction(false);
          }
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: "1.25rem" }}>
        <button
          type="button"
          disabled={actionsDisabled}
          onClick={async () => {
            const site = await ensureSite();
            if (site) photoInputRef.current?.click();
          }}
          style={actionTileStyle(actionsDisabled)}
        >
          <Image size={20} />
          {tr("sitePhotos")}
        </button>
        <button
          type="button"
          disabled={actionsDisabled}
          onClick={async () => {
            const site = await ensureSite();
            if (site) setShowVoiceModal(true);
          }}
          style={actionTileStyle(actionsDisabled)}
        >
          <Mic size={20} />
          {tr("siteVoiceNotes")}
        </button>
        <button type="button" disabled={actionsDisabled} onClick={captureLocation} style={actionTileStyle(actionsDisabled)}>
          <MapPin size={20} />
          {tr("siteLocation")}
        </button>
        <button
          type="button"
          disabled={actionsDisabled}
          onClick={async () => {
            const site = await ensureSite();
            if (site) measureInputRef.current?.click();
          }}
          style={actionTileStyle(actionsDisabled)}
        >
          <Ruler size={20} />
          {tr("uploadMeasurements")}
        </button>
      </div>

      {locationStatus && <p style={{ fontSize: 12, color: t.edge2, margin: "0 0 12px" }}>{locationStatus}</p>}
      {createdSite && (
        <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 12px" }}>
          {tr("siteSavedAs", { name: createdSite.name })}
        </p>
      )}
      {error && <p style={{ fontSize: 12, color: t.signal, margin: "0 0 12px" }}>{error}</p>}

      <button type="button" onClick={saveSite} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, width: "100%", opacity: saving ? 0.6 : 1 }}>
        {saving ? tr("saving") : createdSite ? tr("done") : tr("saveSite")}
      </button>

      {pickingField && (
        <AssociateContactsModal
          site={null}
          pick={{
            title: `${tr(pickingField === "assigned_by" ? "fieldAssignedBy" : "fieldReferredBy")} — ${tr("chooseContact")}`,
            onPick: (caller) => {
              const value = { caller_id: caller.id, name: caller.name, phone: caller.phone || null };
              (pickingField === "assigned_by" ? setAssignedBy : setReferredBy)(value);
              setPickingField(null);
            },
          }}
          onClose={() => setPickingField(null)}
        />
      )}
      {showVoiceModal && (
        <VoiceNoteModal
          onClose={() => setShowVoiceModal(false)}
          onSave={async (blob, fileName) => {
            setBusyAction(true);
            try {
              const site = await ensureSite();
              if (site) {
                await postSiteVoiceNote(site.id, blob, fileName);
                setShowVoiceModal(false);
              }
            } catch (err) {
              console.error("[sbm] voice note failed", err);
              setError(tr("voiceUploadFailed"));
            } finally {
              setBusyAction(false);
            }
          }}
        />
      )}
    </div>
  );
}

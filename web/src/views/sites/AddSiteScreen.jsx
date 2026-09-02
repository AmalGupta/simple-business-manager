import { useState, useRef } from "react";
import { Image, Mic, MapPin, Ruler } from "lucide-react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { patchSite, postSiteMedia, postSiteVoiceNote } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { VoiceNoteModal } from "./VoiceNoteModal.jsx";

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
 */
export function AddSiteScreen({ onBack, onCreate, onDone, defaultAssignedBy = "" }) {
  const [houseNo, setHouseNo] = useState("");
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [pocName, setPocName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [assignedBy, setAssignedBy] = useState(defaultAssignedBy);
  const [referredBy, setReferredBy] = useState("");
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
    assigned_by: assignedBy.trim() || null,
    referred_by: referredBy.trim() || null,
    site_location: siteLocation.trim() || null,
  });

  const validate = () => {
    if (!houseNo.trim() && !sector.trim() && !city.trim()) {
      setError("Enter at least H.No, sector, or city.");
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
      setError("Failed to create site — try again.");
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
      setLocationStatus("Location not supported on this device.");
      return;
    }
    setLocationStatus("Getting location…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
        await applyLocation(loc);
        setLocationStatus("Location captured.");
        await ensureSite();
      },
      () => setLocationStatus("Could not get location — check permissions."),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const actionsDisabled = saving || busyAction;

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        Add new site
      </h1>

      <Card style={{ padding: "1rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <FieldRow label="H.No">
            <input placeholder="House / plot number" value={houseNo} onChange={(e) => setHouseNo(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label="Sector">
            <input placeholder="Sector or locality" value={sector} onChange={(e) => setSector(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label="City">
            <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label="Contact person">
            <input placeholder="Name" value={pocName} onChange={(e) => setPocName(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label="Contact number">
            <input placeholder="Phone number" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label="Assigned by">
            <input placeholder="Who assigned this site" value={assignedBy} onChange={(e) => setAssignedBy(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          <FieldRow label="Referred by">
            <input placeholder="Referral source" value={referredBy} onChange={(e) => setReferredBy(e.target.value)} style={TEXT_INPUT_STYLE} />
          </FieldRow>
          {siteLocation && (
            <FieldRow label="Location">
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
            setError("Photo upload failed.");
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
            setError("Measurement upload failed.");
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
          Site photos
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
          Site voice notes
        </button>
        <button type="button" disabled={actionsDisabled} onClick={captureLocation} style={actionTileStyle(actionsDisabled)}>
          <MapPin size={20} />
          Site location
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
          Upload measurements
        </button>
      </div>

      {locationStatus && <p style={{ fontSize: 12, color: t.edge2, margin: "0 0 12px" }}>{locationStatus}</p>}
      {createdSite && (
        <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 12px" }}>
          Site saved as <strong style={{ color: t.edge }}>{createdSite.name}</strong>. Add photos or notes above, then tap Done.
        </p>
      )}
      {error && <p style={{ fontSize: 12, color: t.signal, margin: "0 0 12px" }}>{error}</p>}

      <button type="button" onClick={saveSite} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, width: "100%", opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving…" : createdSite ? "Done" : "Save site"}
      </button>

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
              setError("Voice note upload failed.");
            } finally {
              setBusyAction(false);
            }
          }}
        />
      )}
    </div>
  );
}

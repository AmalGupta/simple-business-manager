import { useState } from "react";
import { t } from "../../theme.js";
import { postSitesBackfill, patchSite } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* ------------------------------------------------------------------
   Site review — reached via "Show unconfirmed sites" below Tile 3.
   Every site (discovered by the main extraction or the Haiku site scan),
   with a Valid / Not valid toggle. Changes are local until "Update
   confirmed sites" — deliberately batched rather than saving per-toggle,
   so reviewing a dozen sites is a dozen taps, not a dozen round trips.
   ------------------------------------------------------------------ */
export function SitesReviewView({ sites, onBack, onSaved }) {
  const [pending, setPending] = useState(() => Object.fromEntries(sites.map((s) => [s.id, s.is_confirmed])));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const runBackfill = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await postSitesBackfill();
      await onSaved();
      setScanResult(
        result.scanned === 0
          ? "No untouched calls to scan."
          : `Scanned ${result.scanned} call${result.scanned === 1 ? "" : "s"} — found ${result.sitesFound.length ? result.sitesFound.join(", ") : "no sites"}.`
      );
    } catch (err) {
      console.error("[sbm] site backfill failed", err);
      setScanResult("Scan failed — see console.");
    } finally {
      setScanning(false);
    }
  };

  const dirty = sites.some((s) => pending[s.id] !== s.is_confirmed);

  const setChoice = (id, value) => {
    setSaved(false);
    setPending((p) => ({ ...p, [id]: p[id] === value ? null : value }));
  };

  const update = async () => {
    setSaving(true);
    try {
      const changed = sites.filter((s) => pending[s.id] !== s.is_confirmed);
      await Promise.all(changed.map((s) => patchSite(s.id, { is_confirmed: pending[s.id] })));
      await onSaved();
      setSaved(true);
    } catch (err) {
      console.error("[sbm] failed to update site confirmations", err);
    } finally {
      setSaving(false);
    }
  };

  const choiceButtonStyle = (active, kind) => ({
    flex: 1,
    padding: "8px 0",
    border: `1px solid ${active ? (kind === "Y" ? t.accent : t.putty) : t.frost}`,
    borderRadius: t.radiusButton,
    background: active ? (kind === "Y" ? t.accent : t.puttyBg) : t.white,
    color: active ? (kind === "Y" ? t.white : t.putty) : t.edge2,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Review sites</h1>
        <button
          onClick={runBackfill}
          disabled={scanning}
          style={{
            flexShrink: 0,
            padding: "7px 12px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            background: t.white,
            color: t.edge2,
            fontSize: 12,
            fontWeight: 600,
            cursor: scanning ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {scanning ? "Scanning…" : "Scan existing calls"}
        </button>
      </div>
      {scanResult && <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1rem" }}>{scanResult}</p>}

      {sites.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No sites yet.</p>
        </Card>
      ) : (
        <Card style={{ marginBottom: 12 }}>
          {sites.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderTop: `1px solid ${t.frost}`,
              }}
            >
              <span style={{ flex: 1, fontSize: 14, color: t.edge }}>{s.name}</span>
              <div style={{ display: "flex", gap: 6, width: 160 }}>
                <button onClick={() => setChoice(s.id, "Y")} style={choiceButtonStyle(pending[s.id] === "Y", "Y")}>
                  Valid
                </button>
                <button onClick={() => setChoice(s.id, "N")} style={choiceButtonStyle(pending[s.id] === "N", "N")}>
                  Not valid
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={update}
          disabled={!dirty || saving}
          style={{
            padding: "10px 18px",
            border: "none",
            borderRadius: t.radiusButton,
            background: t.accent,
            color: t.white,
            fontSize: 14,
            fontWeight: 700,
            cursor: !dirty || saving ? "not-allowed" : "pointer",
            opacity: !dirty || saving ? 0.5 : 1,
          }}
        >
          {saving ? "Updating…" : "Update confirmed sites"}
        </button>
        {saved && !dirty && <span style={{ fontSize: 13, color: t.edge2 }}>Updated.</span>}
      </div>
    </div>
  );
}

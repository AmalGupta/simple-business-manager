import { useState } from "react";
import { t } from "../../theme.js";
import { postSitesBackfill, patchSite } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { SitesReviewGrid } from "./SitesReviewGrid.jsx";

/* ------------------------------------------------------------------
   Site review — reached via "Show unconfirmed sites" below Tile 3.
   Every site (discovered by the main extraction or the Haiku site scan),
   with a Valid / Not valid decision per row. Changes are local until
   "Update confirmed sites" — deliberately batched rather than saving
   per-toggle, so reviewing a dozen sites is a dozen taps, not a dozen
   round trips.

   The rows themselves are a sortable, filterable grid (SitesReviewGrid);
   this view owns the pending decisions, the batched save and the scan,
   and shows each site's originating caller and call date so the decision
   is a judgement on evidence rather than on a bare string.
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

  const changed = sites.filter((s) => pending[s.id] !== s.is_confirmed);
  const dirty = changed.length > 0;

  const setChoice = (id, value) => {
    setSaved(false);
    setPending((p) => ({ ...p, [id]: p[id] === value ? null : value }));
  };

  const update = async () => {
    setSaving(true);
    try {
      await Promise.all(changed.map((s) => patchSite(s.id, { is_confirmed: pending[s.id] })));
      await onSaved();
      setSaved(true);
    } catch (err) {
      console.error("[sbm] failed to update site confirmations", err);
    } finally {
      setSaving(false);
    }
  };

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
        <SitesReviewGrid sites={sites} pending={pending} onChoose={setChoice} />
      )}

      {/* Sticky, because the whole point of batching is to decide many rows
          before saving — and with the backlog this screen carries, a button
          at the bottom of the page would be hundreds of rows below the one
          you just marked. */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 0",
          background: t.pane,
          borderTop: dirty ? `1px solid ${t.frost}` : "1px solid transparent",
        }}
      >
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
          {saving
            ? "Updating…"
            : dirty
              ? `Update ${changed.length} site${changed.length === 1 ? "" : "s"}`
              : "Update confirmed sites"}
        </button>
        {saved && !dirty && <span style={{ fontSize: 13, color: t.edge2 }}>Updated.</span>}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { t } from "../../theme.js";
import { postSitesBackfill, patchSite } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { SitesReviewGrid } from "./SitesReviewGrid.jsx";

/* ------------------------------------------------------------------
   Site review — reached via "Show unconfirmed sites" below Tile 3.
   Every site (discovered by the main extraction or the Haiku site scan),
   with an Is Valid switch per row. Changes are local until
   "Update confirmed sites" — deliberately batched rather than saving
   per-toggle, so reviewing a dozen sites is a dozen taps, not a dozen
   round trips.

   Three index-card tabs (below the search bar on the grid) segregate by
   pending decision: Undecided (default), Active sites (Valid), Archived
   (Not valid). Search only runs inside the selected tab. Toggling a row
   moves it between tabs immediately.

   The rows themselves are a sortable, filterable grid (SitesReviewGrid);
   this view owns the pending decisions, the batched save and the scan,
   and shows each site's originating caller and call date so the decision
   is a judgement on evidence rather than on a bare string.
   ------------------------------------------------------------------ */

export function SitesReviewView({ sites, onBack, onSaved, canManage = true }) {
  const [pending, setPending] = useState(() => Object.fromEntries(sites.map((s) => [s.id, s.is_confirmed])));
  const [tab, setTab] = useState("undecided");

  /* Seeding only in the useState initializer wasn't enough: the dashboard
     renders this view before its /api/sites fetch lands, so the map was
     built from an empty list and every row afterwards read as an unsaved
     change (undefined !== null). The screen opened claiming nineteen sites
     needed updating, and the button would have patched is_confirmed
     undefined across all of them. Seed only rows we haven't seen, so a
     refetch mid-review never discards decisions still on screen. */
  useEffect(() => {
    setPending((current) => {
      const unseen = sites.filter((s) => !(s.id in current));
      if (unseen.length === 0) return current;
      const next = { ...current };
      for (const s of unseen) next[s.id] = s.is_confirmed;
      return next;
    });
  }, [sites]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const tabCounts = useMemo(() => {
    const counts = { undecided: 0, active: 0, archived: 0 };
    for (const s of sites) {
      const d = pending[s.id] ?? null;
      if (d === "Y") counts.active += 1;
      else if (d === "N") counts.archived += 1;
      else counts.undecided += 1;
    }
    return counts;
  }, [sites, pending]);

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

  /* The details dialog confirms as it saves — the one place on this screen
     that writes immediately rather than batching, because filling in a
     site's address and contact is a decision already made, not a triage
     judgement being queued. The pending map has to move with it: leave it
     null and the refetched 'Y' reads as an unsaved change, so the sticky
     button would offer to set the site back to undecided. */
  const saveDetails = async (site, patch) => {
    await patchSite(site.id, patch);
    setPending((p) => ({ ...p, [site.id]: "Y" }));
    await onSaved();
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
        <SitesReviewGrid
          sites={sites}
          pending={pending}
          decisionTab={tab}
          tabCounts={tabCounts}
          onDecisionTabChange={setTab}
          onChoose={setChoice}
          canManage={canManage}
          onContactsChanged={onSaved}
          onDetailsSaved={saveDetails}
        />
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

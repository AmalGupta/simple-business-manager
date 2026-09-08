import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { t } from "../../theme.js";
import { getCachedConfirmedSites, loadConfirmedSites } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { SitesGrid } from "./SitesGrid.jsx";

/* ------------------------------------------------------------------
   Sites directory — reached via the "N confirmed sites" rollup on Tile 3.
   Every confirmed site with its current open-item count — a reference
   list, unlike Tile 3 itself which only shows sites that need triage.
   Tapping a row reuses the same per-site drilldown (SiteView) Tile 3's
   own rows link to. Also the entry point for "Add new site".

   The rows themselves are a sortable, filterable grid (SitesGrid); this
   component is just the fetch, the heading and the empty state.
   ------------------------------------------------------------------ */
export function SitesDirectoryView({
  onBack,
  onOpenSite,
  onAddSite,
  isHome = false,
  innerScrolls = false,
  horizontalScrolls = false,
}) {
  const [sites, setSites] = useState(() => getCachedConfirmedSites());

  useEffect(() => {
    let cancelled = false;
    /* Instant paint from cache when fresh (per-view TTL in api.js);
       otherwise falls through to a real fetch — see loadConfirmedSites. */
    loadConfirmedSites()
      .then((data) => {
        if (!cancelled) setSites(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load confirmed sites", err);
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <BackLink onClick={onBack}>{isHome ? "Home" : "Back"}</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Sites</h1>
        {onAddSite && (
          <button
            onClick={onAddSite}
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={14} /> Add new site
          </button>
        )}
      </div>

      {sites === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : sites.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No confirmed sites yet.</p>
        </Card>
      ) : (
        <SitesGrid
          rows={sites}
          onOpenSite={onOpenSite}
          innerScrolls={innerScrolls}
          horizontalScrolls={horizontalScrolls}
        />
      )}
    </div>
  );
}

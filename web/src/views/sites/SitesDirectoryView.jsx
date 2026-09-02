import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { t } from "../../theme.js";
import { fmtShort, daysUntil } from "../../lib/dates.js";
import { fetchConfirmedSites } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* ------------------------------------------------------------------
   Sites directory — reached via the "N confirmed sites" rollup on Tile 3.
   Every confirmed site with its current open-item count, alphabetical — a
   reference list, unlike Tile 3 itself which only shows sites that need
   triage. Tapping a row reuses the same per-site drilldown (SiteView) Tile
   3's own rows link to. Also the entry point for "Add new site".
   ------------------------------------------------------------------ */
export function SitesDirectoryView({ onBack, onOpenSite, onAddSite, isHome = false }) {
  const [sites, setSites] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchConfirmedSites()
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
        <Card>
          {sites.map((s) => {
            const missed = s.target_closure_date && daysUntil(s.target_closure_date) < 0;
            return (
              <button
                key={s.id}
                onClick={() => onOpenSite(s.name)}
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: missed ? "12px 1.25rem" : "12px 0",
                  margin: missed ? "0 -1.25rem" : 0,
                  border: "none",
                  borderTop: `1px solid ${t.frost}`,
                  background: missed ? t.signalBg : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: t.body,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {s.unread_count > 0 && (
                    <span
                      className="sbm-unread-glow"
                      aria-label={`${s.unread_count} new since you last posted`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 20,
                        height: 20,
                        padding: "0 6px",
                        borderRadius: 999,
                        background: t.unread,
                        color: t.white,
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {s.unread_count}
                    </span>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 500, color: t.edgeStrong }}>{s.name}</span>
                  {s.target_closure_date && (
                    <span style={{ fontSize: 12, color: missed ? t.signal : t.edge2, fontWeight: missed ? 700 : 400 }}>
                      Due {fmtShort(s.target_closure_date)}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12, color: missed ? t.signal : t.edge2, fontWeight: missed ? 700 : 400 }}>
                  {missed ? `missed ${Math.abs(daysUntil(s.target_closure_date))}d` : `${s.open_count} open`}
                </span>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}

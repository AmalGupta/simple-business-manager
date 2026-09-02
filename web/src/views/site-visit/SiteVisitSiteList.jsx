import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { t } from "../../theme.js";
import { fetchConfirmedSites } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* Entry point for the "Site Visit" home tile — pick a site, then a
   category. Complaints use ComplaintsHomeView instead. Reuses
   fetchConfirmedSites, already scoped server-side to the staff member's
   own sites (same call SitesDirectoryView makes for "All my sites"). */
export function SiteVisitSiteList({
  onBack,
  onSelectSite,
  onAddSite,
  title = "Site Visit",
  prompt = "Which site are you at?",
  addLabel = "Add new site",
}) {
  const [sites, setSites] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchConfirmedSites()
      .then((data) => {
        if (!cancelled) setSites(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load sites for site visit", err);
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>{title}</h1>
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
            <Plus size={14} /> {addLabel}
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1rem" }}>{prompt}</p>

      {sites === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : sites.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No sites assigned to you yet.</p>
        </Card>
      ) : (
        <Card>
          {sites.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSite(s)}
              style={{
                display: "flex",
                width: "100%",
                minHeight: 44,
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "12px 0",
                border: "none",
                borderTop: `1px solid ${t.frost}`,
                background: "none",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: t.body,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 500, color: t.edgeStrong }}>{s.name}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

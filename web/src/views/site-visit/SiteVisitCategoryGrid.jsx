import { t } from "../../theme.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* Category picker for one site, reached from SiteVisitSiteList. Only
   Installation and Complaints are wired up this pass — New Measurement and
   Material Delivery are drawn as boxes with no screen behind them in the
   brainstorm sketch, so they render disabled here rather than being
   invented. */
const CATEGORIES = [
  { key: "measurement", label: "New Measurement", enabled: false },
  { key: "material_delivery", label: "Material Delivery", enabled: false },
  { key: "installation", label: "Installation", enabled: true },
  { key: "complaints", label: "Complaints", enabled: true },
];

export function SiteVisitCategoryGrid({ site, onBack, onOpenInstallations, onOpenComplaint }) {
  const open = (key) => {
    if (key === "installation") onOpenInstallations();
    if (key === "complaints") onOpenComplaint();
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 4px" }}>{site.name}</h1>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1.25rem" }}>What are you here to report?</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            disabled={!c.enabled}
            onClick={() => open(c.key)}
            style={{ all: "unset", cursor: c.enabled ? "pointer" : "default", display: "block" }}
            aria-label={c.label}
          >
            <Card style={{ minHeight: 88, display: "flex", flexDirection: "column", justifyContent: "center", opacity: c.enabled ? 1 : 0.5 }}>
              <TileLabel>{c.label}</TileLabel>
              {!c.enabled && <span style={{ fontSize: 12, color: t.edge2 }}>Coming soon</span>}
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

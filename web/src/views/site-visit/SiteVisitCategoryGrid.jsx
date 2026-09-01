import { t } from "../../theme.js";
import { SITE_VISIT_CATEGORIES } from "../../lib/constants.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* Category picker for one site, reached from SiteVisitSiteList. All four
   boxes are always active — a staff member can initiate a Measurement,
   Material Delivery, or Installation report from the field even without a
   prior admin-assigned site_task in that category; gating this on
   assignment (an earlier pass) blocked exactly the proactive reporting
   this flow exists for. */
export function SiteVisitCategoryGrid({ site, onBack, onOpenCategory }) {
  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 4px" }}>{site.name}</h1>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1.25rem" }}>What are you here to report?</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {SITE_VISIT_CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => onOpenCategory(c.key)}
            style={{ all: "unset", cursor: "pointer", display: "block" }}
            aria-label={c.label}
          >
            <Card style={{ minHeight: 88, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <TileLabel>{c.label}</TileLabel>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

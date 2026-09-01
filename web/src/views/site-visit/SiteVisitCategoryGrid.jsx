import { t } from "../../theme.js";
import { SITE_VISIT_CATEGORIES } from "../../lib/constants.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* Category picker for one site, reached from SiteVisitSiteList. A box is
   active only if the staff member has an assigned site_task in the
   matching WorkflowCategory at this site — see SITE_VISIT_CATEGORIES —
   except Complaints, which is never gated (filing a problem report isn't
   something you need to be assigned to do). `assignedCategories` is a Set
   of WorkflowCategory keys computed from openSiteTasks in Dashboard.jsx. */
export function SiteVisitCategoryGrid({ site, assignedCategories, onBack, onOpenCategory }) {
  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 4px" }}>{site.name}</h1>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1.25rem" }}>What are you here to report?</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {SITE_VISIT_CATEGORIES.map((c) => {
          const enabled = c.workflowCategory === null || assignedCategories.has(c.workflowCategory);
          return (
            <button
              key={c.key}
              disabled={!enabled}
              onClick={() => enabled && onOpenCategory(c.key)}
              style={{ all: "unset", cursor: enabled ? "pointer" : "default", display: "block" }}
              aria-label={c.label}
            >
              <Card style={{ minHeight: 88, display: "flex", flexDirection: "column", justifyContent: "center", opacity: enabled ? 1 : 0.5 }}>
                <TileLabel>{c.label}</TileLabel>
                {!enabled && <span style={{ fontSize: 12, color: t.edge2 }}>Not assigned to you here</span>}
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

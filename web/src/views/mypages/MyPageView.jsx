import { ArrowRight } from "lucide-react";
import { t } from "../../theme.js";
import { BackLink } from "../../components/BackLink.jsx";
import { Card } from "../../components/Card.jsx";
import { MY_PAGE_VIEW_LABELS, MY_PAGE_VIEW_TARGETS } from "../../lib/my-page-views.js";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";

/* SBM-106 — one of the admin's own pages: a named set of views, each opened
   from here. Opening a view returns to this page via `from`. */
export function MyPageView({ page, onBack, onEdit, onOpenView }) {
  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: "1rem" }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>{page.name}</h1>
        <button type="button" onClick={onEdit} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
          Edit page
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {page.views.map((id) => (
          <button key={id} type="button" onClick={() => onOpenView(MY_PAGE_VIEW_TARGETS[id])} style={{ all: "unset", cursor: "pointer", display: "block" }}>
            <Card tile>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: t.label, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: t.edge }}>
                  {MY_PAGE_VIEW_LABELS[id]}
                </span>
                <ArrowRight size={14} color={t.accent} />
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

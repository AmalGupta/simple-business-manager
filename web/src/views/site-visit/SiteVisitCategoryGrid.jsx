import { useState } from "react";
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
   this flow exists for.

   Measurement / Installation / Material Delivery skip the intermediate
   instance list and open a fresh checklist (parent creates the row).
   Complaints still goes to the site complaint form. */
export function SiteVisitCategoryGrid({ site, onBack, onOpenCategory }) {
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");

  const handleOpen = async (key) => {
    if (busyKey) return;
    setError("");
    setBusyKey(key);
    try {
      await onOpenCategory(key);
    } catch (err) {
      console.error("[sbm] failed to open site-visit category", err);
      setError(err.message || "Couldn't start that report — try again.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 4px" }}>{site.name}</h1>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1.25rem" }}>What are you here to report?</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {SITE_VISIT_CATEGORIES.map((c) => {
          const busy = busyKey === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => handleOpen(c.key)}
              disabled={Boolean(busyKey)}
              style={{
                all: "unset",
                cursor: busyKey ? "wait" : "pointer",
                display: "block",
                opacity: busyKey && !busy ? 0.55 : 1,
              }}
              aria-label={c.label}
              aria-busy={busy}
            >
              <Card style={{ minHeight: 88, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <TileLabel>{busy ? "Starting…" : c.label}</TileLabel>
              </Card>
            </button>
          );
        })}
      </div>
      {error && <p style={{ fontSize: 12, color: t.signal, margin: "12px 0 0" }}>{error}</p>}
    </div>
  );
}

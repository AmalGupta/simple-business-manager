import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { fetchMaterialShortages } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Home-panel entry point into the material-shortage ledger (migration
   0016) — admin/superadmin only, same StaffTile/StatCard template. Reported
   from the staff site-visit flow's "Material Short" checklist row. Hidden
   at zero, same rule as the escalations tile and workflow-category tiles,
   rather than shown as a permanent 0. Self-fetches its count rather than
   riding the shared dashboard-summary aggregate, since this is a secondary
   admin ledger, not core dashboard state. */
export function MaterialShortagesTile({ onOpen }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchMaterialShortages("open")
      .then((rows) => {
        if (!cancelled) setCount(rows.length);
      })
      .catch((err) => {
        console.error("[sbm] failed to load material shortages", err);
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!count) return null;

  return (
    <button onClick={onOpen} style={{ all: "unset", cursor: "pointer", display: "block" }} aria-label={`Material shortages — ${count} open`}>
      <Card tile>
        <TileLabel action={<Package size={14} color={t.edge2} />}>material short</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

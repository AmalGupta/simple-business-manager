import { Package } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Home-panel entry point into the material-shortage ledger (migration
   0016) — admin/superadmin only, same StaffTile/StatCard template. Reported
   from the staff site-visit flow's "Material Short" checklist row. Hidden
   at zero (parent omits this tile), same rule as the escalations tile and
   workflow-category tiles. Count is passed in so the home grid never mounts
   an empty cell with only a drag grip. */
export function MaterialShortagesTile({ count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", height: "100%" }}
      aria-label={`Material shortages — ${count} open`}
    >
      <Card tile>
        <TileLabel action={<Package size={14} color={t.edge2} />}>material short</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

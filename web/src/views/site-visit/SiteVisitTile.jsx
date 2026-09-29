import { MapPin } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { useT } from "../../lib/i18n.jsx";

/* Staff home — sites on this user's team roster (same scope as Site Visit picker). */
export function SiteVisitTile({ count, onOpen }) {
  const tr = useT();
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`${tr("siteVisit")} — ${count}`}
    >
      <Card tile>
        <TileLabel action={<MapPin size={14} color={t.edge2} />}>{tr("siteVisit")}</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

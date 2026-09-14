import { MapPin } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Staff home — sites on this user's team roster (same scope as Site Visit picker). */
export function SiteVisitTile({ count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Site Visit — ${count} assigned sites`}
    >
      <Card tile>
        <TileLabel action={<MapPin size={14} color={t.edge2} />}>Site Visit</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

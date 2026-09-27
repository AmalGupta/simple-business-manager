import { ClipboardList } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Staff home — every open call todo + site task assigned to this person.
   Urgent count (admin-flagged, due within 24h) is the one place on this
   tile allowed to go red. */
export function AssignedWorkTile({ count, urgentCount = 0, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Assigned work — ${count} open${urgentCount ? `, ${urgentCount} urgent` : ""}`}
    >
      <Card tile>
        <TileLabel action={<ClipboardList size={14} color={t.edge2} />}>Assigned work</TileLabel>
        <div style={{ ...TILE_VALUE_ROW_STYLE, flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 6 }}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
          {urgentCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: t.signal }}>{urgentCount} urgent</span>
          )}
        </div>
      </Card>
    </button>
  );
}

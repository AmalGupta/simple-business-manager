import { CalendarRange } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Admin home — opens the staff × day roster grid and per-staff audit. */
export function StaffRosterTile({ staffCount, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Staff roster — ${staffCount} staff`}
    >
      <Card tile>
        <TileLabel action={<CalendarRange size={14} color={t.edge2} />}>Staff roster</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{staffCount}</span>
        </div>
      </Card>
    </button>
  );
}

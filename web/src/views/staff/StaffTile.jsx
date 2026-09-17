import { Users } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Home-panel entry point into StaffDirectoryView — admin/superadmin only
   (migration 0011), same tile template as StatCard but clickable, matching
   the other tiles' Card+TileLabel shape rather than a bespoke look. */
export function StaffTile({ count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Staff — ${count} people`}
    >
      <Card tile>
        <TileLabel action={<Users size={14} color={t.edge2} />}>staff</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

import { PhoneCall } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Home-panel entry point into CallersDirectoryView — admin/superadmin only
   (migration 0021), same tile template as StaffTile. */
export function CallerTile({ count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Callers — ${count} directory entries`}
    >
      <Card tile>
        <TileLabel action={<PhoneCall size={14} color={t.edge2} />}>callers</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

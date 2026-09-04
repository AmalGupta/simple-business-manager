import { PhoneCall } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Admin home — every call with an AI-generated todo list not yet resolved.
   Opens the Calls Needing Action carousel. Same tile pattern as
   PendingWorkTile.jsx. */
export function CallsNeedingActionTile({ count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Calls Needing Action — ${count}`}
    >
      <Card tile>
        <TileLabel action={<PhoneCall size={14} color={t.edge2} />}>Calls Needing Action</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

import { CheckCircle2 } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Admin home — calls manually resolved from Calls Needing Action. */
export function ResolvedCallsTile({ count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", height: "100%" }}
      aria-label={`Resolved Calls — ${count}`}
    >
      <Card tile>
        <TileLabel action={<CheckCircle2 size={14} color={t.edge2} />}>Resolved Calls</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

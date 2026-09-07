import { SlidersHorizontal } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

export function CustomizationTile({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label="Customization"
    >
      <Card tile>
        <TileLabel action={<SlidersHorizontal size={14} color={t.edge2} />}>customization</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={{ fontSize: 14, color: t.edge2, fontWeight: 500 }}>Your UI prefs</span>
        </div>
      </Card>
    </button>
  );
}

import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../styles.js";
import { Card } from "./Card.jsx";
import { TileLabel } from "./TileLabel.jsx";

export function StatCard({ value, label }) {
  return (
    <Card tile>
      <TileLabel>{label}</TileLabel>
      <div style={TILE_VALUE_ROW_STYLE}>
        <span style={TILE_NUMBER_STYLE}>{value}</span>
      </div>
    </Card>
  );
}

import { t } from "./theme.js";

/* Same row rhythm as the list tiles (10px vertical padding, hairline top
   border) so a stat card sitting next to a list card doesn't feel like a
   different template. */
export const TILE_ROW_STYLE = {
  padding: "10px 0",
  borderTop: `1px solid ${t.frost}`,
};

/* The value row in a fixed-height number tile (StatCard, StaffTile,
   WorkflowTilesRow, "calls logged", "recordings") — grows to fill the
   tile's remaining --tile-height below the label and centers the number
   in it, so every number tile looks the same regardless of row position. */
export const TILE_VALUE_ROW_STYLE = {
  flex: 1,
  display: "flex",
  alignItems: "center",
};

/* The numeral itself, inside TILE_VALUE_ROW_STYLE — accent-blue and bold
   rather than ink-black, so color reads as a deliberate signal on the one
   thing worth it, not decoration applied everywhere. See
   docs/DESIGN_LANGUAGE.md "Color". */
export const TILE_NUMBER_STYLE = {
  fontFamily: t.display,
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1,
  color: t.accent,
};

export const TEXT_INPUT_STYLE = {
  minHeight: 40,
  padding: "0 10px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  fontFamily: t.body,
  fontSize: 14,
  color: t.edge,
  background: t.white,
};

export const PRIMARY_BUTTON_STYLE = {
  minHeight: 40,
  padding: "0 16px",
  border: "none",
  borderRadius: t.radiusButton,
  background: t.accent,
  color: t.white,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

export const SMALL_SECONDARY_BUTTON_STYLE = {
  padding: "6px 12px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

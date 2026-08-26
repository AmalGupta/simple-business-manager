import { t } from "../theme.js";

/* Flat white surface, hairline border, one shared radius — every Card
   usage renders the same skin now (see docs/DESIGN_LANGUAGE.md "Surface").
   `tile` no longer changes the skin; it only fixes the card to
   --tile-height and lays it out as a column flexbox, so the home-grid
   tiles stay symmetrical regardless of content — a tile with a
   variable-length list (SitesAttentionTile, EscalationsTile) scrolls
   internally rather than growing taller than its neighbours. See those
   components for the `flex: 1; overflowY: auto` content wrapper that
   makes that scrolling work. */
export function Card({ children, style, className, tile = false }) {
  return (
    <div
      className={className}
      style={{
        background: t.white,
        border: `1px solid ${t.frost}`,
        borderRadius: t.radiusCard,
        padding: "1rem 1.25rem",
        ...(tile ? { height: "var(--tile-height)", display: "flex", flexDirection: "column" } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

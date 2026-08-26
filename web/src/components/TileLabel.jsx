import { t } from "../theme.js";

/* Shared header row for all four home-panel tiles — one label style, one
   optional right-aligned action, so the tiles read as one family rather
   than four separately-styled cards. */
export function TileLabel({ children, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span
        style={{
          fontFamily: t.label,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: t.edge,
        }}
      >
        {children}
      </span>
      {action}
    </div>
  );
}

import { t } from "../../theme.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

const LINK_STYLE = {
  display: "block",
  flexShrink: 0,
  width: "100%",
  textAlign: "left",
  padding: 0,
  margin: 0,
  border: "none",
  background: "none",
  cursor: "pointer",
  fontFamily: t.body,
  fontSize: 12,
  fontWeight: 600,
};

/* ------------------------------------------------------------------
   Tile 3 — sites needing attention. Navigation only: confirmed and
   unconfirmed site lists. (The old open-item triage rows were removed
   so the tile is just those two entry points.)
   ------------------------------------------------------------------ */
export function SitesAttentionTile({ onReviewSites, onViewDirectory, unconfirmedCount, confirmedCount }) {
  return (
    <Card tile>
      <TileLabel>Sites needing attention</TileLabel>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <button onClick={onViewDirectory} style={{ ...LINK_STYLE, color: t.edge }}>
          Confirmed Sites{confirmedCount > 0 ? ` (${confirmedCount})` : ""}
        </button>
        <button onClick={onReviewSites} style={{ ...LINK_STYLE, color: t.accent }}>
          Unconfirmed Sites{unconfirmedCount > 0 ? ` (${unconfirmedCount})` : ""}
        </button>
      </div>
    </Card>
  );
}

import { t } from "../../theme.js";
import { TILE_ROW_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* ------------------------------------------------------------------
   Tile 3 — sites needing attention. See docs/ADDITIONAL_FEATURES_M0.md
   "Phase 1 home page". Inclusion/sort/age is computed server-side
   (packages/core/src/queries.ts getSitesNeedingAttention). Always
   rendered, with an empty state — a tile that disappears when there's
   nothing to show made the 4-card panel jump around; "nothing needs
   attention" is itself useful information, same principle as the
   escalations empty state.
   ------------------------------------------------------------------ */
export function SitesAttentionTile({ sites, onOpenSite, onReviewSites, onViewDirectory, hasAnySites, unconfirmedCount, confirmedCount }) {
  /* "Nothing needs attention" means the triage list is empty AND there's no
     site data at all elsewhere — showing it next to a confirmed-sites or
     unconfirmed-sites link (both proof there IS site data) read as a
     contradiction. */
  const showEmptyState = sites.length === 0 && !hasAnySites;

  return (
    <Card tile>
      <TileLabel>Sites needing attention</TileLabel>
      {/* Scrolls internally past --tile-height rather than growing the tile
          — see the Card `tile` comment. The two footer links below stay
          pinned outside this region so they're always reachable. */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {showEmptyState && <p style={{ fontSize: 13, color: t.edge2, margin: "10px 0 0" }}>Nothing needs attention.</p>}
        {sites.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpenSite(s.name)}
            style={{
              display: "flex",
              width: "100%",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              ...TILE_ROW_STYLE,
              margin: 0,
              border: "none",
              borderTop: `1px solid ${t.frost}`,
              background: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: t.body,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: t.edgeStrong }}>{s.name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.edge2 }}>
              <span>
                {s.open_count} open · {s.oldest_age_days}d
              </span>
            </span>
          </button>
        ))}
      </div>
      {confirmedCount > 0 && (
        <button
          onClick={onViewDirectory}
          style={{
            display: "block",
            flexShrink: 0,
            width: "100%",
            textAlign: "left",
            padding: "10px 0 0",
            margin: 0,
            border: "none",
            background: "none",
            cursor: "pointer",
            fontFamily: t.body,
            fontSize: 12,
            fontWeight: 600,
            color: t.edge,
          }}
        >
          {confirmedCount} confirmed site{confirmedCount === 1 ? "" : "s"} →
        </button>
      )}
      <button
        onClick={onReviewSites}
        style={{
          display: "block",
          flexShrink: 0,
          width: "100%",
          textAlign: "left",
          padding: "10px 0 0",
          margin: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          fontFamily: t.body,
          fontSize: 12,
          fontWeight: 600,
          color: t.accent,
        }}
      >
        Show unconfirmed sites{unconfirmedCount > 0 ? ` (${unconfirmedCount})` : ""}
      </button>
    </Card>
  );
}

import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { t } from "../../theme.js";
import { PendingWorkTile } from "./PendingWorkTile.jsx";
import { StaffScheduleTile } from "./StaffScheduleTile.jsx";
import { SiteVisitTile } from "../site-visit/SiteVisitTile.jsx";
import { ComplaintsTile } from "../site-visit/ComplaintsTile.jsx";
import { MyProductionTile } from "../production/MyProductionTile.jsx";
import { WarehouseTile } from "../warehouse/WarehouseTile.jsx";

/* Staff home tile grid — used for staff login and when an admin opens a
   staff bookmark on home. Data is already scoped to that staff member. */
export function StaffHomePanel({
  openSiteTasks,
  myOpenTodos,
  myOpenTodosCount,
  sites,
  complaintsRefreshKey = 0,
  forUserId = null,
  onOpenPendingWork,
  onOpenSchedule,
  onOpenSiteVisit,
  onOpenComplaints,
  onOpenMyOpenTodos,
  onOpenSitesDirectory,
  onOpenProduction,
  onOpenWarehouse,
}) {
  const confirmedSites = (sites ?? []).filter((s) => s.is_confirmed !== "N");
  const openTodosCount = myOpenTodosCount ?? myOpenTodos?.length ?? 0;

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <PendingWorkTile count={openSiteTasks.length} onOpen={onOpenPendingWork} />

        <StaffScheduleTile
          count={openTodosCount + openSiteTasks.length}
          onOpen={onOpenSchedule}
        />

        <SiteVisitTile count={confirmedSites.length} onOpen={onOpenSiteVisit} />

        <ComplaintsTile
          refreshKey={complaintsRefreshKey}
          forUserId={forUserId}
          onOpen={onOpenComplaints}
        />

        <MyProductionTile forUserId={forUserId} onOpen={onOpenProduction} />

        <WarehouseTile onOpen={onOpenWarehouse} />

        {openTodosCount > 0 && (
          <button
            onClick={onOpenMyOpenTodos}
            style={{ all: "unset", cursor: "pointer", display: "block" }}
            aria-label={`My call tasks — ${openTodosCount} open`}
          >
            <Card tile>
              <TileLabel>My call tasks</TileLabel>
              <div style={TILE_VALUE_ROW_STYLE}>
                <span style={TILE_NUMBER_STYLE}>{openTodosCount}</span>
              </div>
            </Card>
          </button>
        )}
      </div>

      {openSiteTasks.length === 0 && openTodosCount === 0 && (
        <p style={{ fontSize: 14, color: t.edge2, marginBottom: "1.5rem" }}>Nothing assigned right now.</p>
      )}

      <button
        onClick={onOpenSitesDirectory}
        style={{ all: "unset", cursor: "pointer", fontSize: 13, fontWeight: 600, color: t.accent }}
      >
        All my sites →
      </button>
    </>
  );
}

import { AssignedWorkTile } from "../work/AssignedWorkTile.jsx";
import { SiteVisitTile } from "../site-visit/SiteVisitTile.jsx";
import { ComplaintsTile } from "../site-visit/ComplaintsTile.jsx";

/* Staff home tile grid — used for staff login and when an admin opens a
   staff bookmark on home. Data is already scoped to that staff member.
   Tiles only (staff roster, migration 0044): Assigned work (call todos +
   site tasks, planned per day), Site visit, Complaints. */
export function StaffHomePanel({
  openSiteTasks,
  myOpenTodosCount,
  urgentWorkCount = 0,
  sites,
  complaintsRefreshKey = 0,
  forUserId = null,
  onOpenAssignedWork,
  onOpenSiteVisit,
  onOpenComplaints,
}) {
  const confirmedSites = (sites ?? []).filter((s) => s.is_confirmed !== "N");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 12,
        marginBottom: "1.5rem",
      }}
    >
      <AssignedWorkTile
        count={(myOpenTodosCount ?? 0) + openSiteTasks.length}
        urgentCount={urgentWorkCount}
        onOpen={onOpenAssignedWork}
      />

      <SiteVisitTile count={confirmedSites.length} onOpen={onOpenSiteVisit} />

      <ComplaintsTile refreshKey={complaintsRefreshKey} forUserId={forUserId} onOpen={onOpenComplaints} />
    </div>
  );
}

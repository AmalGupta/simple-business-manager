import { useEffect, useState } from "react";
import { AssignedWorkTile } from "../work/AssignedWorkTile.jsx";
import { fetchTaskUpdateInbox } from "../../lib/api.js";
import { SiteVisitTile } from "../site-visit/SiteVisitTile.jsx";
import { ComplaintsTile } from "../site-visit/ComplaintsTile.jsx";
import { ScopeGate, useViewAsReadOnly } from "../../lib/scopes.jsx";
import { t } from "../../theme.js";

/* Staff home tile grid — used for staff login and when an admin opens a
   staff bookmark on home. Data is already scoped to that staff member.
   Tiles only (staff roster, migration 0044): Assigned work (call todos +
   site tasks, planned per day), Site visit, Complaints.
   SBM-81: when an admin views this, each tile is gated by its page scope
   (Manage scopes); a "View only" chip shows while anything is read-only. */
export function StaffHomePanel({
  openSiteTasks,
  myOpenTodosCount,
  urgentWorkCount = 0,
  assignedComplaintsCount = 0,
  sites,
  complaintsRefreshKey = 0,
  forUserId = null,
  onOpenAssignedWork,
  onOpenSiteVisit,
  onOpenComplaints,
}) {
  const confirmedSites = (sites ?? []).filter((s) => s.is_confirmed !== "N");
  const readOnly = useViewAsReadOnly();
  /* SBM-103 — tasks with an admin's update not yet opened: green bubble on the tile. */
  const [updatesCount, setUpdatesCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchTaskUpdateInbox({ forUserId })
      .then((rows) => !cancelled && setUpdatesCount(rows.length))
      .catch((err) => console.error("[sbm] failed to load task updates inbox", err));
    return () => {
      cancelled = true;
    };
  }, [forUserId, myOpenTodosCount, openSiteTasks.length]);

  return (
    <>
      {readOnly && (
        <p
          data-testid="view-only-chip"
          style={{
            display: "inline-block",
            margin: "0 0 12px",
            padding: "2px 8px",
            fontSize: 12,
            fontWeight: 700,
            color: t.edge2,
            border: `1px solid ${t.frost}`,
            borderRadius: 6,
          }}
        >
          View only
        </p>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <ScopeGate scope="staff.assigned_work">
          <AssignedWorkTile
            count={(myOpenTodosCount ?? 0) + openSiteTasks.length}
            urgentCount={urgentWorkCount}
            complaintsCount={assignedComplaintsCount}
            updatesCount={updatesCount}
            onOpen={onOpenAssignedWork}
          />
        </ScopeGate>

        <ScopeGate scope="staff.site_visit">
          <SiteVisitTile count={confirmedSites.length} onOpen={onOpenSiteVisit} />
        </ScopeGate>

        <ScopeGate scope="staff.complaints">
          <ComplaintsTile refreshKey={complaintsRefreshKey} forUserId={forUserId} onOpen={onOpenComplaints} />
        </ScopeGate>
      </div>
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { fetchWorkEvents } from "../../lib/api.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { fmtDateTime } from "./workDates.js";

const PAGE = 100;

function describe(e) {
  switch (e.event) {
    case "scheduled":
      if (!e.to_value) return `Unplanned (was ${fmtShort(e.from_value)})`;
      return e.from_value
        ? `Moved to ${fmtShort(e.to_value)} (was ${fmtShort(e.from_value)})`
        : `Planned for ${fmtShort(e.to_value)}`;
    case "completed":
      return "Completed";
    case "reopened":
      return "Reopened";
    case "handed_off":
      return `Passed on to ${e.to_user_name ?? "someone"}`;
    case "received":
      return `Received from ${e.from_user_name ?? "someone"}`;
    case "assigned":
      return "Assigned";
    case "marked_urgent":
      return "Marked urgent";
    case "urgent_cleared":
      return "Urgent cleared";
    case "location_changed":
      return `Moved to ${e.to_value === "factory" ? "Factory" : "Office"}`;
    case "due_changed":
      return `Due date ${e.from_value ? fmtShort(e.from_value) : "none"} → ${e.to_value ? fmtShort(e.to_value) : "none"}`;
    case "parked":
      return "Parked";
    case "unparked":
      return "Taken out of parked";
    case "rerouted":
      return `Moved to ${e.to_user_name ?? "the owner"} for routing`;
    default:
      return e.event;
  }
}

/* Admin — one staff member's audit trail of every transition on their
   assigned work (plan / move / done / pass on / receive / urgent), newest
   first. "by X" appears only when someone other than this staff member
   acted (an admin assigning or flagging urgent). */
export function StaffAuditView({ staff, onBack, onOpenAssignedWork }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    fetchWorkEvents(staff.id, { limit: PAGE })
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
        setHasMore(rows.length === PAGE);
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff audit", err);
        if (!cancelled) setError("Couldn’t load the audit trail.");
      });
    return () => {
      cancelled = true;
    };
  }, [staff.id]);

  const loadMore = useCallback(async () => {
    if (!events?.length) return;
    setLoadingMore(true);
    try {
      const rows = await fetchWorkEvents(staff.id, { limit: PAGE, beforeSeq: events[events.length - 1].seq });
      setEvents((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE);
    } catch (err) {
      console.error("[sbm] failed to load more audit", err);
    } finally {
      setLoadingMore(false);
    }
  }, [events, staff.id]);

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, margin: "0 0 1.25rem" }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>{staff.name} · audit</h1>
        <button type="button" onClick={onOpenAssignedWork} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
          Assigned work →
        </button>
      </div>

      {error && <p style={{ fontSize: 14, color: t.edge2 }}>{error}</p>}
      {!events && !error && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}
      {events && events.length === 0 && (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No activity recorded yet.</p>
        </Card>
      )}

      {events && events.length > 0 && (
        <Card>
          {events.map((e, i) => {
            const byOther = e.actor_name && e.actor_name !== staff.name;
            const urgentEvent = e.event === "marked_urgent";
            return (
              <div key={e.id} style={{ ...TILE_ROW_STYLE, ...(i === 0 ? { borderTop: "none" } : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: urgentEvent ? t.signal : t.edge }}>
                    {describe(e)}
                    {byOther && <span style={{ fontWeight: 400, color: t.edge2 }}> · by {e.actor_name}</span>}
                  </span>
                  <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>{fmtDateTime(e.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: t.edge, marginTop: 2 }}>{e.item_title ?? "(deleted item)"}</div>
                {e.site_name && <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>{e.site_name}</div>}
              </div>
            );
          })}
        </Card>
      )}

      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={loadMore}
          style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, width: "100%", marginTop: 12 }}
        >
          {loadingMore ? "Loading…" : "Load older"}
        </button>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { fetchTaskAudit } from "../../lib/api.js";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { fmtDateTime } from "./workDates.js";

const PAGE = 100;

const dateOrNone = (v) => (v ? fmtShort(v) : "none");

/* The state change as the admin reads it. */
export function describeTransition(e) {
  switch (e.event) {
    case "assigned":
      if (e.from_user_name) return "Reassigned";
      return e.actor_role === "admin" || e.actor_role === "superadmin" ? "Admin → Routed" : "Assigned";
    case "handed_off":
      return "Open → Passed";
    case "completed":
      return "Open → Done";
    case "reopened":
      return "Done → Open";
    case "parked":
      return "Open → Parked";
    case "unparked":
      return "Parked → Open";
    case "rerouted":
      return "Staff → Back to owner for routing";
    case "marked_urgent":
      return "Marked urgent";
    case "urgent_cleared":
      return "Urgent cleared";
    case "due_changed":
      return `Change due date: ${dateOrNone(e.from_value)} → ${dateOrNone(e.to_value)}`;
    case "scheduled":
      if (!e.to_value) return `Plan date cleared (was ${fmtShort(e.from_value)})`;
      return e.from_value
        ? `Change plan date: ${fmtShort(e.from_value)} → ${fmtShort(e.to_value)}`
        : `Planned for ${fmtShort(e.to_value)}`;
    default:
      return e.event;
  }
}

/* Whose task it is after the transition. */
export function assignedToName(e) {
  if (e.event === "assigned" || e.event === "handed_off" || e.event === "rerouted") {
    return e.to_user_name ?? "NA";
  }
  return e.subject_name ?? "NA";
}

const th = {
  textAlign: "left",
  padding: "8px 10px",
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge,
  borderBottom: `1px solid ${t.frost}`,
  whiteSpace: "nowrap",
};
const td = { padding: "10px", borderBottom: `1px solid ${t.frost}`, verticalAlign: "top", fontSize: 13, color: t.edge };

/* Admin Task Audit — every transition on any call todo or site task,
   newest first: who did it, what changed, whose task it is now, when. */
export function TaskAuditView({ onBack }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTaskAudit({ limit: PAGE })
      .then((r) => {
        if (cancelled) return;
        setItems(r.items ?? []);
        setHasMore((r.items ?? []).length === PAGE);
      })
      .catch((err) => {
        console.error("[sbm] failed to load task audit", err);
        if (!cancelled) setError("Couldn’t load the task audit.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!items?.length) return;
    setLoadingMore(true);
    try {
      const r = await fetchTaskAudit({ limit: PAGE, beforeSeq: items[items.length - 1].seq });
      setItems((prev) => [...prev, ...(r.items ?? [])]);
      setHasMore((r.items ?? []).length === PAGE);
    } catch (err) {
      console.error("[sbm] failed to load older task audit", err);
    } finally {
      setLoadingMore(false);
    }
  }, [items]);

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>Task audit</h1>

      {error && <p style={{ fontSize: 14, color: t.edge2 }}>{error}</p>}
      {!items && !error && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}
      {items && items.length === 0 && (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No task activity yet.</p>
        </Card>
      )}

      {items && items.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={th}>Employee</th>
                  <th style={th}>Transition</th>
                  <th style={th}>Assigned to</th>
                  <th style={th}>Date &amp; time</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{e.actor_name ?? "System"}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: e.event === "marked_urgent" ? t.signal : t.edge }}>
                        {describeTransition(e)}
                      </div>
                      <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
                        {e.item_title ?? "(deleted task)"}
                        {e.site_name ? ` · ${e.site_name}` : ""}
                      </div>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{assignedToName(e)}</td>
                    <td style={{ ...td, whiteSpace: "nowrap", color: t.edge2 }}>{fmtDateTime(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

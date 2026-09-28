import { useEffect, useState } from "react";
import { t } from "../../theme.js";
import { fetchTaskTimeline } from "../../lib/api.js";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { fmtDateTime } from "./workDates.js";
import { assignedToName, describeTransition } from "./taskAuditFormat.js";

const STATUS_LABEL = { open: "Open", done: "Done", snoozed: "Parked", assigned: "Open", unassigned: "Unassigned" };

/* One task's full timeline, oldest first — shown above the call (or on its
   own for a site task) when a task is opened from Task audit. */
export function TaskTimelineCard({ kind, id, onOpenSite }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetchTaskTimeline(kind, id)
      .then((d) => !cancelled && setData(d))
      .catch((err) => {
        console.error("[sbm] failed to load task timeline", err);
        if (!cancelled) setError("Couldn’t load this task’s timeline.");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  return (
    <Card style={{ marginBottom: "1.25rem" }}>
      <TileLabel>Task timeline</TileLabel>
      {error && <p style={{ fontSize: 13, color: t.edge2 }}>{error}</p>}
      {!data && !error && <p style={{ fontSize: 13, color: t.edge2 }}>Loading…</p>}
      {data && (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.edge, marginTop: 6 }}>{data.title ?? "(deleted task)"}</div>
          <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
            {STATUS_LABEL[data.status] ?? data.status ?? ""}
            {data.urgent ? " · urgent" : ""}
            {data.assignees.length ? ` · with ${data.assignees.join(", ")}` : " · unassigned"}
            {data.site_name ? ` · ${data.site_name}` : ""}
          </div>
          {data.site_name && onOpenSite && (
            <button
              type="button"
              onClick={() => onOpenSite(data.site_name)}
              style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 32, marginTop: 8 }}
            >
              Open site
            </button>
          )}

          <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
            {data.events.length === 0 && (
              <li style={{ fontSize: 13, color: t.edge2 }}>No recorded changes yet.</li>
            )}
            {data.events.map((e, i) => (
              <li
                key={e.id}
                style={{
                  position: "relative",
                  padding: "0 0 12px 18px",
                  borderLeft: i === data.events.length - 1 ? "2px solid transparent" : `2px solid ${t.frost}`,
                  marginLeft: 5,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: -6,
                    top: 2,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: e.event === "marked_urgent" ? t.signal : t.accent,
                  }}
                />
                <div style={{ fontSize: 13, fontWeight: 600, color: t.edge }}>{describeTransition(e)}</div>
                <div style={{ fontSize: 12, color: t.edge2, marginTop: 1 }}>
                  {e.actor_name ?? "System"} · assigned to {assignedToName(e)} · {fmtDateTime(e.created_at)}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

import { t } from "../../theme.js";
import { Card } from "../../components/Card.jsx";
import { SiteTimelineEntry } from "./SiteTimelineEntry.jsx";

export function SiteTimeline({ entries, onOpenCall, canManage }) {
  if (entries === null) return <p style={{ fontSize: 13, color: t.edge2 }}>Loading…</p>;
  if (entries.length === 0) {
    return (
      <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing recorded for this site yet.</p>
      </Card>
    );
  }
  return (
    <div style={{ borderLeft: `2px solid ${t.frost}`, marginLeft: 4 }}>
      {entries.map((entry) => (
        <SiteTimelineEntry key={`${entry.type}-${entry.id}`} entry={entry} onOpenCall={onOpenCall} canManage={canManage} />
      ))}
    </div>
  );
}

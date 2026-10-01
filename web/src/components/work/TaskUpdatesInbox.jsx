import { MapPin } from "lucide-react";
import { t } from "../../theme.js";
import { Card } from "../Card.jsx";
import { UpdatesBubble } from "./UpdatesBubble.jsx";
import { fmtDateTime } from "../../views/work/workDates.js";
import { useT } from "../../lib/i18n.jsx";

const SECTION_KEY = { completed: "sectionCompleted", pending: "sectionPending", update: "sectionUpdate" };

/* SBM-103 — tasks with posts from the other side you haven't opened yet,
   newest first, each with the green bubble. Pinned above the admin Open
   tasks list and the staff Assigned work list; includes finished tasks, so
   a done note (or a reply on one) still surfaces. Click opens the task's
   updates popup, which clears its bubble. */
export function TaskUpdatesInbox({ items, onOpen }) {
  const tr = useT();
  if (!items?.length) return null;
  return (
    <Card style={{ padding: 0, marginBottom: "1.25rem", borderColor: t.unread }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${t.frost}` }}>
        <UpdatesBubble count={items.length} label={tr("newUpdates")} />
        <span style={{ fontFamily: t.label, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: t.edge }}>
          {tr("newUpdates")}
        </span>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((it) => (
          <li key={`${it.item_kind}-${it.item_id}`} style={{ borderBottom: `1px solid ${t.frost}` }}>
            <button
              type="button"
              onClick={() => onOpen(it)}
              style={{ all: "unset", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 14px", width: "100%", boxSizing: "border-box" }}
            >
              <UpdatesBubble count={it.unseen_count} label={tr("nNew", { n: it.unseen_count })} style={{ marginTop: 1 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: t.edge, lineHeight: 1.35 }}>{it.title ?? "—"}</span>
                <span style={{ fontSize: 12, color: t.edge2 }}>
                  {tr(SECTION_KEY[it.last_section] ?? "sectionUpdate")} · {it.last_author_name ?? "—"} · {fmtDateTime(it.last_at)}
                  {it.status === "done" ? ` · ${tr("done")}` : ""}
                </span>
                {it.last_body && (
                  <span style={{ fontSize: 13, color: t.edge, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.last_body}</span>
                )}
                {it.site_name && (
                  <span style={{ fontSize: 12, color: t.accent, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={11} /> {it.site_name}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

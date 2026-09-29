import { useState, useEffect, useCallback, useMemo } from "react";
import { AlertTriangle, ChevronRight, Image as ImageIcon, Mic, Plus, Star } from "lucide-react";
import { t } from "../../theme.js";
import { fmtDate, fmtShort } from "../../lib/dates.js";
import { fetchComplaints } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

export function siteDetailsLine(c) {
  const parts = [];
  if (c.site_address?.trim()) parts.push(c.site_address.trim());
  if (c.site_poc_name?.trim()) parts.push(`POC: ${c.site_poc_name.trim()}`);
  return parts.length ? parts.join(" · ") : "No address on file";
}

/* Resolved = green, unresolved = amber. Red is kept for genuine urgency
   (the Urgent badge), per the colour rule in SCAFFOLDING.md §7. */
export function ComplaintStatusLabel({ status, closedAt }) {
  const resolved = status !== "open";
  return (
    <span
      style={{
        alignSelf: "flex-start",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: t.radius,
        color: resolved ? t.ok : t.putty,
        background: resolved ? t.okBg : t.puttyBg,
      }}
    >
      {resolved ? `Resolved${closedAt ? ` · ${fmtShort(closedAt)}` : ""}` : "Unresolved"}
    </span>
  );
}

export function ComplaintFlags({ c }) {
  if (!c.urgent_at && !c.important_at) return null;
  return (
    <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {c.urgent_at && c.status === "open" && (
        <span style={{ fontSize: 11, fontWeight: 700, color: t.signal, display: "inline-flex", alignItems: "center", gap: 3 }}>
          <AlertTriangle size={12} /> Urgent
        </span>
      )}
      {c.important_at && (
        <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, display: "inline-flex", alignItems: "center", gap: 3 }}>
          <Star size={12} /> Important
        </span>
      )}
    </span>
  );
}

function ComplaintCard({ c, showAssignee, selfId, onOpen }) {
  /* Staff see complaints they raised too; for those held by someone else, say who. */
  const raisedNotHeld = selfId && c.assigned_to_user_id !== selfId;
  return (
    <button type="button" onClick={onOpen} style={{ all: "unset", cursor: "pointer", display: "block", minWidth: 0 }} aria-label={`Complaint: ${c.text}`}>
      <Card style={{ height: "100%", minHeight: 150, display: "flex", flexDirection: "column", gap: 8, boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
          <ComplaintFlags c={c} />
          <ChevronRight size={16} color={t.edge2} style={{ flexShrink: 0, marginLeft: "auto" }} />
        </div>
        <span
          style={{
            fontSize: 14,
            color: t.edge,
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {c.text}
        </span>
        <span style={{ fontSize: 12, color: t.edge2 }}>
          Raised {fmtDate(c.created_at)}
          {c.created_by_name ? ` · ${c.created_by_name}` : ""}
        </span>
        {(c.voice_call_id || c.media_count > 0) && (
          <span style={{ fontSize: 12, color: t.edge2, display: "flex", gap: 10 }}>
            {c.voice_call_id && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Mic size={12} /> Voice note
              </span>
            )}
            {c.media_count > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <ImageIcon size={12} /> {c.media_count}
              </span>
            )}
          </span>
        )}
        {c.due_date && c.status === "open" && (
          <span style={{ fontSize: 12, color: t.edge2 }}>Due {fmtShort(c.due_date)}</span>
        )}
        {(showAssignee || raisedNotHeld) && (
          <span style={{ fontSize: 12, color: t.edge2 }}>
            {c.assignee_name ? `Assignee: ${c.assignee_name}` : "Not assigned yet"}
            {raisedNotHeld ? " · raised by you" : ""}
          </span>
        )}
        <div style={{ marginTop: "auto" }}>
          <ComplaintStatusLabel status={c.status} closedAt={c.closed_at} />
        </div>
      </Card>
    </button>
  );
}

/* SBM-71 — Complaints as a metro grid, grouped by site; each card opens the
   complaint. Staff see complaints assigned to them and ones they raised
   (server-scoped); admin sees all. Staff can file a new one from here. */
export function ComplaintsHomeView({
  onBack,
  onAddComplaint,
  onOpenComplaint,
  refreshKey = 0,
  canAdd = false,
  canAssign = false,
  forUserId = null,
  /** Staff viewer (or the staff member an admin is looking at) — marks complaints they raised but don't hold. */
  selfId = null,
}) {
  const [complaints, setComplaints] = useState(null);
  const [hideResolved, setHideResolved] = useState(false);

  const load = useCallback(() => {
    fetchComplaints({ forUserId: forUserId || undefined })
      .then((data) => setComplaints(data))
      .catch((err) => {
        console.error("[sbm] failed to load complaints", err);
        setComplaints([]);
      });
  }, [forUserId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const resolvedCount = complaints?.filter((c) => c.status !== "open").length ?? 0;
  const groups = useMemo(() => {
    if (!complaints) return [];
    const bySite = new Map();
    for (const c of complaints) {
      if (hideResolved && c.status !== "open") continue;
      const key = c.site_id ?? "none";
      if (!bySite.has(key)) bySite.set(key, { key, name: c.site_name ?? "No site", items: [] });
      bySite.get(key).items.push(c);
    }
    return [...bySite.values()].sort((a, b) => {
      const ua = a.items.some((c) => c.urgent_at && c.status === "open");
      const ub = b.items.some((c) => c.urgent_at && c.status === "open");
      if (ua !== ub) return ua ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [complaints, hideResolved]);

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Complaints</h1>
        {canAdd && (
          <button
            onClick={onAddComplaint}
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              minHeight: 44,
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={14} /> Add complaint
          </button>
        )}
      </div>

      {resolvedCount > 0 && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: t.edge2, marginBottom: "1rem", minHeight: 32, cursor: "pointer" }}>
          <input type="checkbox" checked={hideResolved} onChange={(e) => setHideResolved(e.target.checked)} style={{ width: 18, height: 18 }} />
          Hide resolved ({resolvedCount})
        </label>
      )}

      {complaints === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : groups.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>
            {complaints.length === 0 ? "No complaints yet." : "No unresolved complaints."}
          </p>
        </Card>
      ) : (
        groups.map((g) => (
          <section key={g.key} style={{ marginBottom: "1.5rem" }}>
            <p
              style={{
                fontFamily: t.label,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: t.edge,
                margin: "0 0 8px",
              }}
            >
              {g.name} · {g.items.length}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {g.items.map((c) => (
                <ComplaintCard key={c.id} c={c} showAssignee={canAssign} selfId={selfId} onOpen={() => onOpenComplaint(c.id)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { t } from "../../theme.js";
import { fmtDate } from "../../lib/dates.js";
import { TILE_ROW_STYLE, TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { fetchComplaints } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

function siteDetailsLine(c) {
  const parts = [];
  if (c.site_address?.trim()) parts.push(c.site_address.trim());
  if (c.site_poc_name?.trim()) parts.push(`POC: ${c.site_poc_name.trim()}`);
  return parts.length ? parts.join(" · ") : "No address on file";
}

function ComplaintAssignControl({ complaint, staffRoster, onAssign }) {
  const assignee = staffRoster.find((s) => s.id === complaint.assigned_to_user_id) ?? null;
  const [editing, setEditing] = useState(false);
  const [staffId, setStaffId] = useState(complaint.assigned_to_user_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStaffId(complaint.assigned_to_user_id ?? "");
  }, [complaint.assigned_to_user_id]);

  const submit = async () => {
    if (!staffId) {
      setError("Choose a staff member.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAssign(complaint.id, staffId);
      setEditing(false);
    } catch (err) {
      console.error("[sbm] failed to assign complaint", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
        <span style={{ fontSize: 12, color: t.edge2 }}>
          {assignee ? `Assignee: ${assignee.name}` : "Assignee: Unassigned"}
        </span>
        <button onClick={() => setEditing(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
          {assignee ? "Reassign" : "Assign"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
      <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, minHeight: 34, fontSize: 13 }}>
        <option value="" disabled>
          Choose a staff member…
        </option>
        {staffRoster.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={submit}
          disabled={saving || staffRoster.length === 0}
          style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, opacity: saving || staffRoster.length === 0 ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setEditing(false)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 34 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* Complaints list — staff and admin. Staff can add new; admin can assign. */
export function ComplaintsHomeView({
  onBack,
  onAddComplaint,
  refreshKey = 0,
  canAdd = false,
  canAssign = false,
  staffRoster = [],
  onAssignComplaint,
}) {
  const [complaints, setComplaints] = useState(null);

  const load = useCallback(() => {
    fetchComplaints()
      .then((data) => setComplaints(data))
      .catch((err) => {
        console.error("[sbm] failed to load complaints", err);
        setComplaints([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleAssign = async (id, staffId) => {
    const updated = await onAssignComplaint(id, staffId);
    setComplaints((rows) => rows.map((c) => (c.id === id ? updated : c)));
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem", gap: 12 }}>
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
            <Plus size={14} /> Add new complaint
          </button>
        )}
      </div>

      {complaints === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : complaints.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No complaints yet.</p>
        </Card>
      ) : (
        <Card>
          {complaints.map((c) => (
            <div
              key={c.id}
              style={{
                ...TILE_ROW_STYLE,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "stretch",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: t.display, fontSize: 14, fontWeight: 500, color: t.edge }}>
                  {c.site_name ?? "Unknown site"}
                </span>
                <span style={{ fontSize: 11, color: t.edge2, whiteSpace: "nowrap" }}>{fmtDate(c.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: t.edge2 }}>
                Raised by {c.created_by_name ?? "Unknown"}
              </div>
              <div style={{ fontSize: 13, color: t.edge, lineHeight: 1.5 }}>
                <span style={{ fontFamily: t.label, fontSize: 11, fontWeight: 600, color: t.edge2, display: "block", marginBottom: 2 }}>
                  Site details
                </span>
                {siteDetailsLine(c)}
              </div>
              <span style={{ fontSize: 14, color: t.edge, lineHeight: 1.5 }}>{c.text}</span>
              {canAssign ? (
                <ComplaintAssignControl complaint={c} staffRoster={staffRoster} onAssign={handleAssign} />
              ) : (
                <span style={{ fontSize: 12, color: t.edge2 }}>
                  {c.assignee_name ? `Assignee: ${c.assignee_name}` : "Assignee: Unassigned"}
                </span>
              )}
              <span
                style={{
                  alignSelf: "flex-start",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: t.radius,
                  color: c.status === "open" ? t.edge : t.edge2,
                  background: c.status === "open" ? t.frost : t.frostSoft,
                  textTransform: "capitalize",
                }}
              >
                {c.status === "open" ? "Open" : "Closed"}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

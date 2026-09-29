import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { t } from "../../theme.js";
import { todayIso } from "../../lib/dates.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";
import { fetchConfirmedSites, patchComplaintFields, patchWork } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";

const fieldLabel = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 };

/* SBM-71 — shown to an admin right after they file a complaint (same
   voice-first form staff use). In one step they can put it on the right
   site, flag it urgent, give it a deadline, and route it to a staff member.
   Until routed it stays with the admin who filed it. "Not now" skips. */
export function ComplaintSetupView({ complaint, site, me, staffRoster = [], onDone }) {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState(site?.id ?? complaint.site_id ?? "");
  const [urgent, setUrgent] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [routeTo, setRouteTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchConfirmedSites()
      .then((rows) => setSites(rows ?? []))
      .catch((err) => console.error("[sbm] failed to load sites", err));
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const patch = {};
      if (siteId && siteId !== complaint.site_id) patch.site_id = siteId;
      if (dueDate) patch.due_date = dueDate;
      if (routeTo) patch.assigned_to_user_id = routeTo;
      if (Object.keys(patch).length) await patchComplaintFields(complaint.id, patch);
      /* After routing, so urgent pins the new holder's plan to today. */
      if (urgent) await patchWork("complaint", complaint.id, { urgent: true });
      onDone(complaint.id);
    } catch (err) {
      console.error("[sbm] complaint set-up failed", err);
      setError(err.message || "Couldn’t save — the complaint is filed; try again or skip.");
      setSaving(false);
    }
  };

  const siteOptions = sites.some((s) => s.id === siteId) || !siteId ? sites : [{ id: siteId, name: site?.name ?? "Current site" }, ...sites];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.ok, marginBottom: 6 }}>
        <CheckCircle2 size={18} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>Complaint filed</span>
      </div>
      <h1 style={{ fontFamily: t.display, fontSize: 20, fontWeight: 500, color: t.edge, margin: "0 0 0.25rem", lineHeight: 1.35 }}>
        {complaint.text}
      </h1>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1.25rem" }}>
        It’s with you for now. Set it up and route it, or do it later from the complaint.
      </p>

      <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={fieldLabel}>
          Site
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, minHeight: 44 }}>
            {!siteId && <option value="">Choose a site…</option>}
            {siteOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
            minHeight: 44,
            fontWeight: urgent ? 700 : 500,
            color: urgent ? t.signal : t.edge,
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} style={{ width: 20, height: 20 }} />
          <AlertTriangle size={15} /> Urgent — due within 24 hours
        </label>

        <label style={fieldLabel}>
          Deadline (optional)
          <input
            type="date"
            value={dueDate}
            min={todayIso()}
            onChange={(e) => setDueDate(e.target.value)}
            style={{ ...TEXT_INPUT_STYLE, minHeight: 44 }}
          />
        </label>

        <label style={fieldLabel}>
          Route to staff
          <select value={routeTo} onChange={(e) => setRouteTo(e.target.value)} style={{ ...TEXT_INPUT_STYLE, minHeight: 44 }}>
            <option value="">Keep with me ({me?.name ?? "admin"})</option>
            {staffRoster.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button type="button" onClick={() => onDone(complaint.id)} disabled={saving} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
            Not now
          </button>
          <button type="button" onClick={save} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 44, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Card>
    </div>
  );
}

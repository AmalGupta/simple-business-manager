import { useState, useEffect } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { TOOL_LOCATIONS } from "../../lib/constants.js";
import { fetchSites, fetchStaffRoster, postToolMovement } from "../../lib/api.js";
import { Modal } from "../../components/Modal.jsx";

const labelStyle = { fontSize: 12, fontWeight: 600, color: t.edge2, marginBottom: 4, display: "block" };
const fieldWrap = { marginBottom: 10 };

export function NewToolOutModal({ onClose, onCreated }) {
  const [toolName, setToolName] = useState("");
  const [takenByUserId, setTakenByUserId] = useState("");
  const [location, setLocation] = useState("site");
  const [siteId, setSiteId] = useState("");
  const [note, setNote] = useState("");
  const [staffRoster, setStaffRoster] = useState([]);
  const [sites, setSites] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStaffRoster().then(setStaffRoster).catch((err) => console.error("[sbm] failed to load staff roster", err));
    fetchSites().then(setSites).catch((err) => console.error("[sbm] failed to load sites", err));
  }, []);

  const valid = toolName.trim() && takenByUserId;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      const created = await postToolMovement({
        tool_name: toolName.trim(),
        taken_by_user_id: takenByUserId,
        location,
        site_id: location === "site" ? siteId || null : null,
        note: note.trim() || null,
      });
      onCreated(created);
    } catch (err) {
      console.error("[sbm] failed to log tool out", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal label="Tool out" title="Tool out" onClose={onClose} width={380}>
      <div style={fieldWrap}>
        <label style={labelStyle}>Tool</label>
        <input value={toolName} onChange={(e) => setToolName(e.target.value)} placeholder="e.g. Drill" style={{ ...TEXT_INPUT_STYLE, width: "100%" }} />
      </div>
      <div style={fieldWrap}>
        <label style={labelStyle}>Taken by</label>
        <select value={takenByUserId} onChange={(e) => setTakenByUserId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
          <option value="">Select…</option>
          {staffRoster.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div style={fieldWrap}>
        <label style={labelStyle}>Location</label>
        <select value={location} onChange={(e) => setLocation(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
          {TOOL_LOCATIONS.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      {location === "site" && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Site (optional)</label>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
            <option value="">Select a site…</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div style={fieldWrap}>
        <label style={labelStyle}>Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }} />
      </div>
      {error ? <span style={{ fontSize: 12, color: t.signal }}>{error}</span> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={SMALL_SECONDARY_BUTTON_STYLE}>
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={!valid || saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: !valid || saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

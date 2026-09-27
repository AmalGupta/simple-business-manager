import { useState, useEffect } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import { fetchStaffRoster, postProductionJob } from "../../lib/api.js";

const textareaStyle = {
  ...TEXT_INPUT_STYLE,
  minHeight: 72,
  padding: "8px 10px",
  resize: "vertical",
  fontFamily: t.body,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: t.edge2,
  marginBottom: 4,
  display: "block",
};

/* Office hands the survey over — creates the job, which seeds all 5 fixed
   steps per migrations/0042_production_warehouse.sql. Picking who takes
   Measurement here assigns it immediately (skips "pending, needs an
   assign click") — every step after it auto-continues to whoever
   completed the one before, so this one choice is normally the only
   manual assignment the whole job needs. */
export function NewProductionJobModal({ sites, onClose, onCreated }) {
  const [siteId, setSiteId] = useState("");
  const [title, setTitle] = useState("");
  const [surveyNote, setSurveyNote] = useState("");
  const [assignToUserId, setAssignToUserId] = useState("");
  const [staffRoster, setStaffRoster] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStaffRoster()
      .then(setStaffRoster)
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  }, []);

  const submit = async () => {
    if (!siteId || !title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const job = await postProductionJob({ siteId, title: title.trim(), surveyNote: surveyNote.trim(), assignToUserId });
      onCreated(job);
    } catch (err) {
      console.error("[sbm] failed to create production job", err);
      setError(err.message || "Failed to create job — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal label="New production job" title="New production job" onClose={onClose} width={420}>
      <div>
        <label style={labelStyle}>Site</label>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
          <option value="">Select a site…</option>
          {(sites ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Sector 70 – 12 windows, living + bedroom"
          style={{ ...TEXT_INPUT_STYLE, width: "100%" }}
        />
      </div>
      <div>
        <label style={labelStyle}>Survey note (optional)</label>
        <textarea
          value={surveyNote}
          onChange={(e) => setSurveyNote(e.target.value)}
          placeholder="Measurements, sizes, anything Tanseem needs from the survey"
          style={{ ...textareaStyle, width: "100%" }}
        />
      </div>
      <div>
        <label style={labelStyle}>Assign Measurement to (optional)</label>
        <select value={assignToUserId} onChange={(e) => setAssignToUserId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
          <option value="">Leave unassigned</option>
          {staffRoster.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 11, color: t.edge2, margin: "4px 0 0" }}>
          Every step after this one goes to whoever completes the step before it, until someone reassigns.
        </p>
      </div>
      {error ? <span style={{ fontSize: 12, color: t.signal }}>{error}</span> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={SMALL_SECONDARY_BUTTON_STYLE}>
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !siteId || !title.trim()}
          style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !siteId || !title.trim() ? 0.6 : 1 }}
        >
          {saving ? "Creating…" : "Create job"}
        </button>
      </div>
    </Modal>
  );
}

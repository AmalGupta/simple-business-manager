import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { t } from "../../theme.js";
import { fmtShort, todayIso } from "../../lib/dates.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { deleteOffboarding, fetchOffboardingList, fetchStaffRoster, postStartOffboarding } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

const sectionLabel = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge,
  margin: "0 0 6px",
};

/* SBM-64 — everyone currently serving notice, plus "Start offboarding":
   pick a staff member and their last working day. Each notice row has
   Retain: they're staying, so the last working day is cleared and their
   roster row goes back to normal. */
export function OffboardingListView({ onBack, onOpen }) {
  const [leaving, setLeaving] = useState(null);
  const [roster, setRoster] = useState([]);
  const [staffId, setStaffId] = useState("");
  const [lwd, setLwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRetainId, setConfirmRetainId] = useState(null);
  const [retainingId, setRetainingId] = useState(null);

  const load = () => {
    fetchOffboardingList()
      .then(setLeaving)
      .catch((err) => {
        console.error("[sbm] failed to load offboarding list", err);
        setLeaving([]);
      });
    fetchStaffRoster()
      .then(setRoster)
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  };

  useEffect(load, []);

  const retain = async (l) => {
    if (confirmRetainId !== l.id) {
      setConfirmRetainId(l.id);
      return;
    }
    setConfirmRetainId(null);
    setRetainingId(l.id);
    setError("");
    try {
      await deleteOffboarding(l.id);
      setNotice(`${l.name} is staying — last working day cleared.`);
      load();
    } catch (err) {
      console.error("[sbm] failed to retain", err);
      setError(err.message || "Couldn’t retain — try again.");
    } finally {
      setRetainingId(null);
    }
  };

  const eligible = roster.filter((s) => !s.last_working_day);

  const start = async () => {
    if (!staffId || !lwd) {
      setError("Pick a staff member and their last working day.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await postStartOffboarding(staffId, lwd);
      onOpen(staffId);
    } catch (err) {
      console.error("[sbm] failed to start offboarding", err);
      setError(err.message || "Couldn’t start — try again.");
      setSaving(false);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Staff</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        Offboard a staff member
      </h1>

      <p style={sectionLabel}>Start offboarding</p>
      <Card style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "1.5rem" }}>
        <select
          aria-label="Staff member"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          style={{ ...TEXT_INPUT_STYLE, minHeight: 44 }}
        >
          <option value="">Who is leaving?</option>
          {eligible.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 }}>
          Last working day
          <input
            type="date"
            value={lwd}
            min={todayIso()}
            onChange={(e) => setLwd(e.target.value)}
            style={{ ...TEXT_INPUT_STYLE, minHeight: 44 }}
          />
        </label>
        <p style={{ fontSize: 12, color: t.edge2, margin: 0 }}>
          They keep their login and their work until then. Hand their tasks and sites over from the next screen; anything
          still with them after the last working day goes to the owner’s routing queue and their login is closed.
        </p>
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <button
          type="button"
          onClick={start}
          disabled={saving}
          style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 44, alignSelf: "flex-start", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Starting…" : "Start offboarding"}
        </button>
      </Card>

      <p style={sectionLabel}>On notice</p>
      {notice && <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 8px" }}>{notice}</p>}
      {leaving === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : leaving.length === 0 ? (
        <Card style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nobody is serving notice.</p>
        </Card>
      ) : (
        <Card style={{ paddingTop: 0, paddingBottom: 0 }}>
          {leaving.map((l, i) => (
            <div
              key={l.id}
              style={{
                ...TILE_ROW_STYLE,
                ...(i === 0 ? { borderTop: "none" } : {}),
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => onOpen(l.id)}
                style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: t.edgeStrong }}>{l.name}</span>
                  <span style={{ fontSize: 12, color: t.edge2 }}>
                    Last day {fmtShort(l.last_working_day)} · {l.remaining} task{l.remaining === 1 ? "" : "s"} left
                  </span>
                </span>
                <ChevronRight size={16} color={t.edge2} style={{ flexShrink: 0 }} />
              </button>
              <button
                type="button"
                onClick={() => retain(l)}
                disabled={retainingId === l.id}
                onBlur={() => setConfirmRetainId((id) => (id === l.id ? null : id))}
                style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, flexShrink: 0, opacity: retainingId === l.id ? 0.6 : 1 }}
              >
                {confirmRetainId === l.id ? "Confirm retain" : "Retain"}
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

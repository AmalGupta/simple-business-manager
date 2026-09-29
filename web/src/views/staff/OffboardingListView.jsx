import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { t } from "../../theme.js";
import { fmtShort, todayIso } from "../../lib/dates.js";
import { PRIMARY_BUTTON_STYLE, TEXT_INPUT_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { fetchOffboardingList, fetchStaffRoster, postStartOffboarding } from "../../lib/api.js";
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
   pick a staff member and their last working day. */
export function OffboardingListView({ onBack, onOpen }) {
  const [leaving, setLeaving] = useState(null);
  const [roster, setRoster] = useState([]);
  const [staffId, setStaffId] = useState("");
  const [lwd, setLwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchOffboardingList()
      .then(setLeaving)
      .catch((err) => {
        console.error("[sbm] failed to load offboarding list", err);
        setLeaving([]);
      });
    fetchStaffRoster()
      .then(setRoster)
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  }, []);

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

      <p style={sectionLabel}>Leaving</p>
      {leaving === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : leaving.length === 0 ? (
        <Card style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nobody is serving notice.</p>
        </Card>
      ) : (
        <Card style={{ paddingTop: 0, paddingBottom: 0 }}>
          {leaving.map((l, i) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onOpen(l.id)}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                width: "100%",
                minHeight: 44,
                ...TILE_ROW_STYLE,
                ...(i === 0 ? { borderTop: "none" } : {}),
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: t.edgeStrong }}>{l.name}</span>
                <span style={{ fontSize: 12, color: t.edge2 }}>
                  Last day {fmtShort(l.last_working_day)} · {l.remaining} task{l.remaining === 1 ? "" : "s"} left
                </span>
              </span>
              <ChevronRight size={16} color={t.edge2} />
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

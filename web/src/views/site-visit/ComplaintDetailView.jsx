import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, MapPin, Star } from "lucide-react";
import { t } from "../../theme.js";
import { fmtDate, fmtShort, todayIso } from "../../lib/dates.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";
import { fetchComplaint, fetchStaffRoster, patchWork, postWorkHandoff } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { PassOnPicker } from "../work/AssignedWorkView.jsx";
import { urgentDeadline, fmtTimeLeft } from "../work/workDates.js";
import { ComplaintAssignControl, ComplaintFlags, ComplaintStatusLabel, siteDetailsLine } from "./ComplaintsHomeView.jsx";

const sectionLabel = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge,
  margin: "0 0 6px",
};

/* SBM-71 — one complaint: what was said (voice note + transcript), photos and
   videos, and who holds it. The assignee plans it onto a day or passes it on,
   like any task; an admin also assigns, flags urgent/important, and resolves.
   Urgent work is pinned to today and staff can't move it. */
export function ComplaintDetailView({ id, me, forUserId = null, staffRoster = [], onAssignComplaint, onBack, onOpenSite, onChanged }) {
  const [c, setC] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passing, setPassing] = useState(false);
  const [roster, setRoster] = useState([]);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const isAdmin = me?.role !== "staff";
  const today = todayIso();

  const load = useCallback(
    () =>
      fetchComplaint(id)
        .then(setC)
        .catch((err) => {
          console.error("[sbm] failed to load complaint", err);
          setError(err.message || "Couldn’t load this complaint.");
        }),
    [id]
  );

  useEffect(() => {
    load();
    fetchStaffRoster()
      .then(setRoster)
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  }, [load]);

  const act = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      console.error("[sbm] complaint update failed", err);
      setError(err.message || "That didn’t work — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!c) {
    return (
      <div>
        <BackLink onClick={onBack}>Complaints</BackLink>
        <p style={{ fontSize: 14, color: t.edge2 }}>{error || "Loading…"}</p>
      </div>
    );
  }

  const open = c.status === "open";
  const urgent = Boolean(c.urgent_at) && open;
  /* Plan / pass on act on the assignee's share: staff = themselves; admin = whoever holds it. */
  const holder = forUserId ?? (isAdmin ? c.assigned_to_user_id : me.id);
  const canWork = open && Boolean(holder) && (isAdmin || c.assigned_to_user_id === me.id);
  const workOpts = isAdmin && holder ? { forUserId: holder } : {};

  return (
    <div>
      <BackLink onClick={onBack}>Complaints</BackLink>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: "1rem" }}>
        <ComplaintFlags c={c} />
        <h1 style={{ fontFamily: t.display, fontSize: 20, fontWeight: 500, color: t.edge, margin: 0, lineHeight: 1.35 }}>{c.text}</h1>
        <span style={{ fontSize: 13, color: t.edge2 }}>
          Raised {fmtDate(c.created_at)}
          {c.created_by_name ? ` by ${c.created_by_name}` : ""}
          {c.installation_label ? ` · ${c.installation_label}` : ""}
        </span>
        <ComplaintStatusLabel status={c.status} closedAt={c.closed_at} />
        {!open && c.resolved_by_name && <span style={{ fontSize: 12, color: t.edge2 }}>Resolved by {c.resolved_by_name}</span>}
        {urgent && (
          <span style={{ fontSize: 12, fontWeight: 700, color: t.signal, display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={13} /> {fmtTimeLeft(urgentDeadline(c.urgent_at))} — finish today, can’t be moved
          </span>
        )}
      </div>

      {error && <p style={{ fontSize: 13, color: t.signal, margin: "0 0 1rem" }}>{error}</p>}

      <p style={sectionLabel}>Site</p>
      <Card style={{ marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: 4 }}>
        {c.site_name && onOpenSite ? (
          <button
            type="button"
            onClick={() => onOpenSite(c.site_name)}
            style={{ all: "unset", cursor: "pointer", color: t.accent, fontWeight: 600, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 5, minHeight: 32 }}
          >
            <MapPin size={14} /> {c.site_name}
          </button>
        ) : (
          <span style={{ fontSize: 15, fontWeight: 600, color: t.edge }}>{c.site_name ?? "No site"}</span>
        )}
        <span style={{ fontSize: 13, color: t.edge2 }}>{siteDetailsLine(c)}</span>
      </Card>

      {c.voice_call_id && (
        <>
          <p style={sectionLabel}>Voice note</p>
          <Card style={{ marginBottom: "1.25rem" }}>
            <AudioPlayer src={`/api/calls/${c.voice_call_id}/recording`} preload="none" />
            <p style={{ fontSize: 14, color: c.voice_transcript ? t.edge : t.edge2, lineHeight: 1.55, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
              {c.voice_transcript || "Transcript not ready yet."}
            </p>
          </Card>
        </>
      )}

      {c.media.length > 0 && (
        <>
          <p style={sectionLabel}>Photos & videos ({c.media.length})</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginBottom: "1.25rem" }}>
            {c.media.map((m) =>
              m.media_type === "video" ? (
                <video key={m.id} src={`/api/media/${m.id}`} controls preload="metadata" style={{ width: "100%", borderRadius: t.radiusButton, background: t.frost }} />
              ) : (
                <a key={m.id} href={`/api/media/${m.id}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/api/media/${m.id}`}
                    alt="Complaint attachment"
                    loading="lazy"
                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: t.radiusButton, border: `1px solid ${t.frost}`, display: "block" }}
                  />
                </a>
              )
            )}
          </div>
        </>
      )}

      <p style={sectionLabel}>Handling</p>
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {isAdmin && open ? (
          <ComplaintAssignControl
            complaint={c}
            staffRoster={staffRoster}
            onAssign={async (cid, staffId) => {
              await onAssignComplaint(cid, staffId);
              await load();
              onChanged?.();
            }}
          />
        ) : (
          <span style={{ fontSize: 13, color: t.edge2 }}>{c.assignee_name ? `Assigned to ${c.assignee_name}` : "Unassigned"}</span>
        )}

        {canWork && (
          <>
            {urgent && !isAdmin ? null : (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.edge2 }}>
                Plan for
                <input
                  type="date"
                  aria-label="Plan for date"
                  value={c.scheduled_for ?? ""}
                  min={isAdmin ? undefined : today}
                  disabled={busy}
                  onChange={(e) => act(() => patchWork("complaint", c.id, { scheduled_for: e.target.value || null }, workOpts))}
                  style={{ ...TEXT_INPUT_STYLE, minHeight: 44, flex: 1, minWidth: 0 }}
                />
              </label>
            )}
            {c.scheduled_for && c.scheduled_for < today && !urgent && (
              <span style={{ fontSize: 12, fontWeight: 700, color: t.putty }}>Planned {fmtShort(c.scheduled_for)}, not done</span>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setPassing((p) => !p)}
              style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <ArrowRightLeft size={14} /> Pass on
            </button>
            {passing && (
              <PassOnPicker
                roster={roster}
                selfId={holder}
                busy={busy}
                onCancel={() => setPassing(false)}
                onPick={async (to) => {
                  setBusy(true);
                  setError("");
                  try {
                    await postWorkHandoff("complaint", c.id, to, workOpts);
                    setPassing(false);
                    onChanged?.();
                    /* Staff lose sight of a complaint once it's someone else's — back to their list. */
                    if (!isAdmin) return onBack();
                    await load();
                  } catch (err) {
                    console.error("[sbm] pass on failed", err);
                    setError(err.message || "Couldn’t pass it on — try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </>
        )}

        {isAdmin && open && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderTop: `1px solid ${t.frost}`, paddingTop: 10 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => patchWork("complaint", c.id, { urgent: !c.urgent_at }))}
              style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, color: c.urgent_at ? t.signal : t.edge, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <AlertTriangle size={14} /> {c.urgent_at ? "Clear urgent" : "Mark urgent"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => patchWork("complaint", c.id, { important: !c.important_at }))}
              style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, color: c.important_at ? t.accent : t.edge, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <Star size={14} /> {c.important_at ? "Clear important" : "Mark important"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirmResolve) return setConfirmResolve(true);
                setConfirmResolve(false);
                act(() => patchWork("complaint", c.id, { status: "done" }));
              }}
              onBlur={() => setConfirmResolve(false)}
              style={{
                ...SMALL_SECONDARY_BUTTON_STYLE,
                gridColumn: "1 / -1",
                minHeight: 44,
                color: t.ok,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <Check size={14} /> {confirmResolve ? "Confirm — mark resolved" : "Resolve"}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

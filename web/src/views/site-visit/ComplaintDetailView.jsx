import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, MapPin } from "lucide-react";
import { t } from "../../theme.js";
import { todayIso } from "../../lib/dates.js";
import { fmtDateLang, fmtShortLang, fmtTimeLeftLang, useLang, useT } from "../../lib/i18n.jsx";
import { SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";
import { fetchComplaint, fetchStaffRoster, patchComplaintFields, patchWork, postWorkHandoff } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { PassOnPicker } from "../../components/work/PassOnPicker.jsx";
import { urgentDeadline } from "../work/workDates.js";
import { ComplaintFlags, ComplaintStatusLabel, siteDetailsLine } from "./ComplaintsHomeView.jsx";

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
   like any task; an admin also assigns, flags urgent, and resolves.
   Urgent work is pinned to today and staff can't move it. */
export function ComplaintDetailView({ id, me, staffRoster = [], onAssignComplaint, onBack, onOpenSite, onChanged }) {
  /* SBM-72: staff read this in their display language; admin-only controls stay English. */
  const tr = useT();
  const lang = useLang();
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
          setError(err.message || tr("couldntLoadComplaint"));
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
        <BackLink onClick={onBack}>{tr("complaints")}</BackLink>
        <p style={{ fontSize: 14, color: t.edge2 }}>{error || tr("loading")}</p>
      </div>
    );
  }

  const open = c.status === "open";
  const urgent = Boolean(c.urgent_at) && open;
  /* Plan / pass on act on the assignee's share: staff = themselves; admin = whoever holds it. */
  const holder = isAdmin ? c.assigned_to_user_id : me.id;
  const canWork = open && Boolean(holder) && (isAdmin || c.assigned_to_user_id === me.id);
  const workOpts = isAdmin && holder ? { forUserId: holder } : {};

  return (
    <div>
      <BackLink onClick={onBack}>{tr("complaints")}</BackLink>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: "1rem" }}>
        <ComplaintFlags c={c} />
        <h1 style={{ fontFamily: t.display, fontSize: 20, fontWeight: 500, color: t.edge, margin: 0, lineHeight: 1.35 }}>{c.text}</h1>
        <span style={{ fontSize: 13, color: t.edge2 }}>
          {c.created_by_name
            ? tr("raisedOnBy", { date: fmtDateLang(lang, c.created_at), name: c.created_by_name })
            : tr("raisedOn", { date: fmtDateLang(lang, c.created_at) })}
          {c.installation_label ? ` · ${c.installation_label}` : ""}
        </span>
        <ComplaintStatusLabel status={c.status} closedAt={c.closed_at} />
        {c.due_date && open && (
          <span style={{ fontSize: 13, fontWeight: 600, color: c.due_date < today ? t.putty : t.edge }}>
            {tr("deadline", { date: fmtShortLang(lang, c.due_date) })}
            {c.due_date < today ? ` — ${tr("overdue")}` : ""}
          </span>
        )}
        {!open && c.resolved_by_name && <span style={{ fontSize: 12, color: t.edge2 }}>{tr("resolvedBy", { name: c.resolved_by_name })}</span>}
        {urgent && (
          <span style={{ fontSize: 12, fontWeight: 700, color: t.signal, display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={13} /> {fmtTimeLeftLang(lang, urgentDeadline(c.urgent_at))} — {tr("urgentFinishToday")}
          </span>
        )}
      </div>

      {error && <p style={{ fontSize: 13, color: t.signal, margin: "0 0 1rem" }}>{error}</p>}

      <p style={sectionLabel}>{tr("site")}</p>
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
          <span style={{ fontSize: 15, fontWeight: 600, color: t.edge }}>{c.site_name ?? tr("noSite")}</span>
        )}
        <span style={{ fontSize: 13, color: t.edge2 }}>{siteDetailsLine(c, lang)}</span>
      </Card>

      {c.voice_call_id && (
        <>
          <p style={sectionLabel}>{tr("voiceNote")}</p>
          <Card style={{ marginBottom: "1.25rem" }}>
            <AudioPlayer src={`/api/calls/${c.voice_call_id}/recording`} preload="none" />
            <p style={{ fontSize: 14, color: c.voice_transcript ? t.edge : t.edge2, lineHeight: 1.55, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
              {c.voice_transcript || tr("transcriptNotReady")}
            </p>
          </Card>
        </>
      )}

      {c.media.length > 0 && (
        <>
          <p style={sectionLabel}>{tr("photosVideos", { n: c.media.length })}</p>
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

      <p style={sectionLabel}>{tr("handling")}</p>
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, color: t.edge2 }}>
          {c.assignee_name ? tr("assignedTo", { name: c.assignee_name }) : tr("notAssignedYet")}
          {!isAdmin && c.assigned_to_user_id !== me.id && c.created_by_user_id === me.id ? ` · ${tr("raisedByYou")}` : ""}
        </span>

        {canWork && !(urgent && !isAdmin) && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.edge2 }}>
            {tr("planFor")}
            <input
              type="date"
              aria-label={tr("planForDate")}
              value={c.scheduled_for ?? ""}
              min={isAdmin ? undefined : today}
              disabled={busy}
              onChange={(e) => act(() => patchWork("complaint", c.id, { scheduled_for: e.target.value || null }, workOpts))}
              style={{ ...TEXT_INPUT_STYLE, minHeight: 44, flex: 1, minWidth: 0 }}
            />
          </label>
        )}
        {canWork && c.scheduled_for && c.scheduled_for < today && !urgent && (
          <span style={{ fontSize: 12, fontWeight: 700, color: t.putty }}>{tr("plannedNotDone", { date: fmtShortLang(lang, c.scheduled_for) })}</span>
        )}

        {isAdmin && open && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.edge2 }}>
            Deadline
            <input
              type="date"
              aria-label="Deadline"
              value={c.due_date ?? ""}
              disabled={busy}
              onChange={(e) => act(() => patchComplaintFields(c.id, { due_date: e.target.value || null }))}
              style={{ ...TEXT_INPUT_STYLE, minHeight: 44, flex: 1, minWidth: 0 }}
            />
          </label>
        )}

        {/* Admin routes (assigns or reassigns) — works whether or not anyone holds it yet.
            Staff who hold it pass it on to a teammate. */}
        {open && (isAdmin || c.assigned_to_user_id === me.id) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setPassing((p) => !p)}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <ArrowRightLeft size={14} /> {isAdmin ? "Route to staff" : tr("passOn")}
          </button>
        )}
        {passing && (
          <PassOnPicker
            roster={isAdmin ? staffRoster : roster}
            selfId={c.assigned_to_user_id}
            busy={busy}
            placeholder={isAdmin ? "Route to…" : tr("passOnTo")}
            actionLabel={isAdmin ? "Route" : tr("passOn")}
            includeAdmins={!isAdmin}
            onCancel={() => setPassing(false)}
            onPick={async (to) => {
              setBusy(true);
              setError("");
              try {
                if (isAdmin) {
                  await onAssignComplaint(c.id, to);
                } else {
                  await postWorkHandoff("complaint", c.id, to, workOpts);
                }
                setPassing(false);
                onChanged?.();
                /* Staff lose the actions once it's someone else's — back to their list. */
                if (!isAdmin) return onBack();
                await load();
              } catch (err) {
                console.error("[sbm] route / pass on failed", err);
                setError(err.message || tr("failedTryAgain"));
              } finally {
                setBusy(false);
              }
            }}
          />
        )}

        {isAdmin && open && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderTop: `1px solid ${t.frost}`, paddingTop: 10 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => patchWork("complaint", c.id, { urgent: !c.urgent_at }))}
              style={{ ...SMALL_SECONDARY_BUTTON_STYLE, gridColumn: "1 / -1", minHeight: 44, color: c.urgent_at ? t.signal : t.edge, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
            >
              <AlertTriangle size={14} /> {c.urgent_at ? "Clear urgent" : "Mark urgent"}
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

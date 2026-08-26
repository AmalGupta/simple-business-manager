import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Check,
  FileText,
  Image,
  Video,
  Mic,
  Square,
  Users,
  Plus,
} from "lucide-react";
import { t } from "./theme.js";
import {
  today,
  dayKey,
  isoDate,
  daysUntil,
  fmtDate,
  fmtShort,
  fmtLong,
  isUrgent,
  isTaskDueDateUrgent,
} from "./lib/dates.js";
import { WORKFLOW_CATEGORIES, sortCalls } from "./lib/constants.js";
import { DownloadButton } from "./components/DownloadButton.jsx";
import { WaitingTag } from "./components/WaitingTag.jsx";
import { Card } from "./components/Card.jsx";
import { BackLink } from "./components/BackLink.jsx";
import { PhoneLink } from "./components/PhoneLink.jsx";
import { EmptyState } from "./components/EmptyState.jsx";
import { AudioPlayer } from "./components/AudioPlayer.jsx";
import { TileLabel } from "./components/TileLabel.jsx";
import { TodoRow, formatTodoSentence } from "./components/TodoRow.jsx";
import { CallHeading } from "./components/CallHeading.jsx";
import { CommitmentsList } from "./components/CommitmentsList.jsx";
import { CallTypeBadge } from "./components/CallTypeBadge.jsx";
import { CallCard } from "./components/CallCard.jsx";
import { StatCard } from "./components/StatCard.jsx";
import {
  TILE_ROW_STYLE,
  TILE_VALUE_ROW_STYLE,
  TILE_NUMBER_STYLE,
  TEXT_INPUT_STYLE,
  PRIMARY_BUTTON_STYLE,
} from "./styles.js";
import { AppHeader } from "./components/AppHeader.jsx";
import { LoginScreen } from "./views/auth/LoginScreen.jsx";
import { StaffTile } from "./views/staff/StaffTile.jsx";
import { WorkflowTilesRow } from "./views/home/WorkflowTilesRow.jsx";
import { WorkflowCategorySiteList } from "./views/home/WorkflowCategorySiteList.jsx";
import { SitesAttentionTile } from "./views/home/SitesAttentionTile.jsx";
import { EscalationsTile } from "./views/home/EscalationsTile.jsx";
import { StreakWall } from "./views/calls/StreakWall.jsx";
import {
  fetchCalls,
  fetchCall,
  fetchEscalations,
  fetchSitesAttention,
  fetchSites,
  fetchConfirmedSites,
  postCreateSite,
  patchSite,
  fetchSiteTeam,
  postSiteTeamMember,
  postSitesBackfill,
  postEscalation,
  closeEscalationApi,
  patchTodo,
  fetchMe,
  postLogout,
  postResetPin,
  postUpdateMyPhone,
  fetchStaff,
  fetchStaffRoster,
  postCreateStaff,
  patchStaffPhone,
  postResetStaffPin,
  fetchSiteMedia,
  postSiteMedia,
  postSiteVoiceNote,
  fetchSiteTimeline,
  fetchCallsCount,
  fetchOpenSiteTasks,
  fetchSiteTasks,
  fetchUnassignedSiteTasks,
  patchSiteTask,
} from "./lib/api.js";

/* ------------------------------------------------------------------
   Day view — calls recorded that day, plus everything closed that day
   regardless of which call it came from.
   ------------------------------------------------------------------ */
function DayView({ date, calls, onBack, onOpen, onToggle, onPark, busyIds }) {
  const dayCalls = useMemo(
    () => sortCalls(calls.filter((c) => dayKey(c.recorded_at) === date)),
    [calls, date]
  );

  const closures = useMemo(() => {
    const out = [];
    for (const c of calls)
      for (const td of c.todos)
        if (td.status === "done" && dayKey(td.completed_at) === date)
          out.push({ ...td, client_name: c.client_name });
    return out;
  }, [calls, date]);

  const minutes = dayCalls.reduce((n, c) => n + c.duration_s, 0) / 60;

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: "1.25rem" }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>
          {fmtLong(date)}
        </h1>
        <DownloadButton calls={dayCalls} label={date}>
          Day report
        </DownloadButton>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          paddingBottom: "1.5rem",
          marginBottom: "1.5rem",
          borderBottom: `1px solid ${t.frost}`,
        }}
      >
        {[
          [dayCalls.length, dayCalls.length === 1 ? "call" : "calls"],
          [closures.length, closures.length === 1 ? "item closed" : "items closed"],
          [Math.round(minutes), "minutes on calls"],
        ].map(([n, label]) => (
          <div key={label}>
            <div style={{ fontFamily: t.display, fontSize: 32, fontWeight: 500, lineHeight: 1, color: t.edge }}>
              {n}
            </div>
            <div style={{ fontSize: 13, color: t.edge2, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {closures.length > 0 && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: t.edge2, marginBottom: 4 }}>Closed on this day</div>
          {closures.map((td) => (
            <div
              key={td.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 0",
                borderTop: `1px solid ${t.frost}`,
                fontSize: 14,
              }}
            >
              <Check size={17} strokeWidth={2.5} color={t.edge2} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, color: t.edge2, textDecoration: "line-through" }}>{td.text}</span>
              <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>{td.client_name}</span>
            </div>
          ))}
        </Card>
      )}

      {dayCalls.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No calls recorded on this day.</p>
        </Card>
      ) : (
        dayCalls.map((call, i) => (
          <CallCard
            key={call.id}
            index={i}
            call={call}
            onOpen={onOpen}
            onToggle={onToggle}
            onPark={onPark}
            busyIds={busyIds}
          />
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function CallDetail({ call, onBack, onToggle, onPark, busyIds, canManage = true }) {
  const openTodos = call.todos.filter((td) => td.status !== "done");
  const doneTodos = call.todos.filter((td) => td.status === "done");
  const [openTranscript, setOpenTranscript] = useState(false);
  const [openTodosPanel, setOpenTodosPanel] = useState(false);

  const Section = ({ label, children }) => (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ fontSize: 12, color: t.edge2, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ paddingBottom: "1rem", borderBottom: `1px solid ${t.frost}`, marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {call.call_type === "internal" && call.sites?.length > 0 ? (
            <CallHeading call={call} />
          ) : (
            <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>
              {call.client_name}
            </h1>
          )}
          {call.customer_waiting ? <WaitingTag /> : null}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            marginTop: 6,
            fontSize: 13,
            color: t.edge2,
          }}
        >
          <span>
            {fmtDate(call.recorded_at)} · {Math.round(call.duration_s / 60)} min · {call.source}
          </span>
          <PhoneLink phone={call.client_phone} />
        </div>
      </div>

      <Section label="Summary">
        <p style={{ fontSize: 14, lineHeight: 1.7, color: t.edge, margin: 0 }}>{call.summary}</p>
      </Section>

      <Section label="Key takeaways">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.9, color: t.edge }}>
          {call.key_takeaways.map((k, i) => (
            <li key={i}>{k}</li>
          ))}
        </ul>
      </Section>

      {call.todos.length > 0 && (
        <Card style={{ marginBottom: "1.5rem" }}>
          <button
            onClick={() => setOpenTodosPanel((v) => !v)}
            aria-expanded={openTodosPanel}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: t.edge2,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <Check size={14} />
            {openTodosPanel ? "Hide todos" : `Show todos (${call.todos.length})`}
          </button>
          {openTodosPanel &&
            [...openTodos, ...doneTodos].map((td) => (
              <TodoRow
                key={td.id}
                todo={td}
                onToggle={onToggle}
                onPark={onPark}
                busy={busyIds.has(td.id)}
                readOnly={!canManage}
              />
            ))}
        </Card>
      )}

      {call.commitments?.length > 0 && (
        <Section label="Commitments">
          <CommitmentsList commitments={call.commitments} />
        </Section>
      )}

      {/* Unresolved is LLM output, never actionable — deliberately not checkboxes */}
      {call.unresolved.length > 0 && (
        <div style={{ borderLeft: `2px solid ${t.frost}`, paddingLeft: 14, marginBottom: "1.5rem" }}>
          <div style={{ fontSize: 12, color: t.edge2, marginBottom: 6 }}>Left unresolved on the call</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: t.edge2, display: "flex", flexDirection: "column", gap: 6 }}>
            {call.unresolved.map((u, i) => (
              <li key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <span>{u.item}</span>
                {u.blocked_on && (
                  <span style={{ fontSize: 11, color: t.putty, whiteSpace: "nowrap" }}>blocked on {u.blocked_on}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {call.material_needs?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "1.5rem" }}>
          {call.material_needs.map((m, i) => (
            <span
              key={i}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                border: `1px solid ${t.frost}`,
                borderRadius: t.radius,
                color: t.edge2,
              }}
            >
              {m}
            </span>
          ))}
        </div>
      )}

      {call.deadline && (
        <Card
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
          }}
        >
          <span style={{ fontSize: 13, color: t.edge2 }}>Deadline</span>
          <span
            style={{
              fontSize: 13,
              padding: "3px 10px",
              borderRadius: t.radius,
              color: daysUntil(call.deadline) <= 1 ? t.white : t.edge2,
              background: daysUntil(call.deadline) <= 1 ? t.signal : t.frost,
            }}
          >
            {fmtDate(call.deadline)}
          </span>
        </Card>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          borderTop: `1px solid ${t.frost}`,
          paddingTop: "1rem",
        }}
      >
        {call.transcript == null ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8, color: t.edge2, fontSize: 13 }}>
            <FileText size={16} />
            Transcription in progress
          </span>
        ) : (
          <button
            onClick={() => setOpenTranscript((v) => !v)}
            aria-expanded={openTranscript}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: t.edge2,
              fontSize: 13,
            }}
          >
            <FileText size={16} />
            {openTranscript ? "Hide transcript" : "Read full transcript"}
          </button>
        )}
        <DownloadButton calls={[call]} label={`${call.client_name.toLowerCase().replace(/\s+/g, "-")}-${dayKey(call.recorded_at)}`}>
          Call report
        </DownloadButton>
      </div>

      {call.transcript != null && openTranscript && (
        <p style={{ fontSize: 13, lineHeight: 1.8, color: t.edge2, marginTop: 12, whiteSpace: "pre-wrap" }}>
          {call.transcript}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ================================================================== */
/* Tiles 1 & 2 — a plain number readout, same card language as tiles 3 & 4. */

/* Popup for "Assign team" — see docs/ADDITIONAL_FEATURES_M0.md follow-up.
   Two fields, add-or-cancel — deliberately not a full contact form. */
/* Assigns a real staff account (dropdown, phone auto-filled from their
   profile) rather than free text — migration 0011. Staff with no phone on
   file yet are shown but disabled, since the backend rejects those. */
function AssignTeamModal({ onClose, onAdd }) {
  const [staff, setStaff] = useState(null);
  const [staffId, setStaffId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchStaffRoster()
      .then((data) => {
        if (cancelled) return;
        setStaff(data);
        setStaffId(data[0]?.id ?? "");
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = staff?.find((s) => s.id === staffId) ?? null;

  const submit = async () => {
    if (!staffId) {
      setError("Choose a staff member.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAdd(staffId);
      onClose();
    } catch (err) {
      console.error("[sbm] failed to add team member", err);
      setError(err.message || "Failed to add — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Assign team member"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Assign team member</span>
        {staff === null ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Loading staff…</p>
        ) : staff.length === 0 ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>No staff yet — add one from the Staff page first.</p>
        ) : (
          <>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={TEXT_INPUT_STYLE}>
              {/* A real, always-present option for the "" default — without
                  it, if the roster ever loads empty before staff is set, the
                  select's value matches no <option> at all, which leaves it
                  stuck showing the first entry and unresponsive to taps on
                  some mobile browsers. Every staff member is selectable
                  regardless of phone — it's addable later from the Staff
                  page without re-doing the assignment. */}
              <option value="" disabled>
                Choose a staff member…
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 13, color: t.edge2 }}>
              Phone: {selected?.phone || "not on file yet"}
            </div>
          </>
        )}
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: "0 16px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !staff?.length}
            style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !staff?.length ? 0.6 : 1 }}
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SMALL_SECONDARY_BUTTON_STYLE = {
  padding: "6px 12px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/* One stage row inside WorkTimelinePopup — status/assignee/timestamps, plus
   an inline assign-or-reassign control. Kept as its own component so each
   row manages its own "editing" state independently. */
function StageAssignRow({ task, onAssign }) {
  const [editing, setEditing] = useState(false);
  const [staff, setStaff] = useState(null);
  const [staffId, setStaffId] = useState(task.assigned_to_user_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing || staff !== null) return;
    fetchStaffRoster()
      .then((data) => {
        setStaff(data);
        setStaffId((current) => current || task.assigned_to_user_id || data[0]?.id || "");
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        setStaff([]);
      });
  }, [editing, staff, task.assigned_to_user_id]);

  const submit = async () => {
    if (!staffId) {
      setError("Choose a staff member.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onAssign(task.id, { assigned_to_user_id: staffId, due_date: dueDate || null });
      setEditing(false);
    } catch (err) {
      console.error("[sbm] failed to assign stage", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const dueUrgent = task.status !== "done" && isTaskDueDateUrgent(task.due_date);

  let statusLine;
  if (task.status === "done") {
    statusLine = `Done by ${task.completed_by_name ?? task.assignee_name ?? "—"}${task.completed_at ? ` · ${fmtShort(task.completed_at)}` : ""}`;
  } else if (task.assignee_name) {
    statusLine = (
      <>
        Assigned to {task.assignee_name}
        {task.assigned_at ? ` · ${fmtShort(task.assigned_at)}` : ""}
        {task.due_date && (
          <span style={{ color: dueUrgent ? t.signal : "inherit", fontWeight: dueUrgent ? 700 : 400 }}>
            {" "}
            · due {fmtShort(task.due_date)}
          </span>
        )}
      </>
    );
  } else {
    statusLine = "Unassigned";
  }

  return (
    <div style={TILE_ROW_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, color: t.edge }}>{task.stage_label}</div>
          <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>{statusLine}</div>
        </div>
        <button onClick={() => setEditing((v) => !v)} style={SMALL_SECONDARY_BUTTON_STYLE}>
          {editing ? "Cancel" : task.assignee_name ? "Reassign" : "Assign"}
        </button>
      </div>
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {staff === null ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Loading staff…</p>
          ) : staff.length === 0 ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>No staff yet — add one from the Staff page first.</p>
          ) : (
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={TEXT_INPUT_STYLE}>
              <option value="" disabled>
                Choose a staff member…
              </option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 }}>
            Due date (optional)
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={TEXT_INPUT_STYLE} />
          </label>
          {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
          <button
            onClick={submit}
            disabled={saving || !staff?.length}
            style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !staff?.length ? 0.6 : 1, alignSelf: "flex-start" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

/* Admin/superadmin-only popup from SiteView's "View work timeline" button —
   all 23 stages for this site, grouped by category (display order only, not
   a pipeline — see migration 0013), each with status/assignee/timestamps
   and an inline assign control. */
function WorkTimelinePopup({ site, onClose, onAssigned = () => {} }) {
  const [tasks, setTasks] = useState(null);

  const reload = useCallback(() => {
    if (!site?.id) return Promise.resolve();
    return fetchSiteTasks(site.id)
      .then(setTasks)
      .catch((err) => {
        console.error("[sbm] failed to load site tasks", err);
        setTasks([]);
      });
  }, [site?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const assign = async (taskId, patch) => {
    await patchSiteTask(taskId, patch);
    // Refreshes this popup's own list AND the app-level open-tasks cache the
    // home-page workflow tiles read from — without the second call, an
    // assignment made here doesn't show up on home until a full reload.
    await Promise.all([reload(), onAssigned()]);
  };

  const doneCount = tasks?.filter((tk) => tk.status === "done").length ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="View work timeline"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "85vh",
          overflowY: "auto",
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Work timeline</span>
          {tasks && (
            <span style={{ fontSize: 12, color: t.edge2 }}>
              {doneCount}/{tasks.length} done
            </span>
          )}
        </div>
        {tasks === null ? (
          <p style={{ fontSize: 13, color: t.edge2 }}>Loading…</p>
        ) : (
          WORKFLOW_CATEGORIES.map((cat) => {
            const rows = tasks.filter((tk) => tk.category === cat.key);
            if (rows.length === 0) return null;
            return (
              <div key={cat.key}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: t.edge2,
                    margin: "10px 0 0",
                  }}
                >
                  {cat.label}
                </div>
                {rows.map((task) => (
                  <StageAssignRow key={task.id} task={task} onAssign={assign} />
                ))}
              </div>
            );
          })
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <button onClick={onClose} style={SMALL_SECONDARY_BUTTON_STYLE}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* Staff-facing banner on their own SiteView — their open task(s) at this
   site, with a one-tap "Mark done" that then offers an immediate handoff to
   any other still-unassigned stage at the same site (no admin required for
   this specific handoff — see the narrow permission in
   isUserActiveOnSiteTasks). Stages carry no order, so the handoff picker
   lists every unassigned stage, not a system-computed "next" one. */
function MyTaskBanner({ siteId, myTasks, onChanged }) {
  const [completingId, setCompletingId] = useState(null);
  const [handoffFor, setHandoffFor] = useState(null); // the just-completed task, while picking a handoff
  const [unassigned, setUnassigned] = useState(null);
  const [pickedStageId, setPickedStageId] = useState("");
  const [staff, setStaff] = useState(null);
  const [staffId, setStaffId] = useState("");
  const [saving, setSaving] = useState(false);

  const markDone = async (task) => {
    setCompletingId(task.id);
    try {
      await patchSiteTask(task.id, { status: "done" });
      // Completion itself is done regardless of what follows — refresh
      // immediately so the app-level tile counts and this banner reflect it
      // even if the handoff picker below can't be offered for some reason.
      await onChanged();
      try {
        const [openStages, staffRoster] = await Promise.all([fetchUnassignedSiteTasks(siteId), fetchStaffRoster()]);
        if (openStages.length > 0) {
          setUnassigned(openStages);
          setStaff(staffRoster);
          setPickedStageId(openStages[0].id);
          setStaffId("");
          setHandoffFor(task);
        }
      } catch (err) {
        console.error("[sbm] failed to load handoff options — completion still succeeded", err);
      }
    } catch (err) {
      console.error("[sbm] failed to mark task done", err);
    } finally {
      setCompletingId(null);
    }
  };

  const submitHandoff = async () => {
    if (!pickedStageId || !staffId) return;
    setSaving(true);
    try {
      await patchSiteTask(pickedStageId, { assigned_to_user_id: staffId });
      await onChanged();
      setHandoffFor(null);
    } catch (err) {
      console.error("[sbm] failed to hand off stage", err);
    } finally {
      setSaving(false);
    }
  };

  const hasTasks = myTasks && myTasks.length > 0;

  return (
    <>
      {hasTasks && (
      <Card style={{ marginBottom: 12, borderColor: t.accent }}>
        <TileLabel>Your task{myTasks.length > 1 ? "s" : ""} here</TileLabel>
        {myTasks.map((task) => (
          <div key={task.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...TILE_ROW_STYLE }}>
            <div>
              <div style={{ fontSize: 14, color: t.edge }}>{task.stage_label}</div>
              {task.due_date && (
                <div style={{ fontSize: 12, color: isTaskDueDateUrgent(task.due_date) ? t.signal : t.edge2, marginTop: 2 }}>
                  Due {fmtShort(task.due_date)}
                </div>
              )}
            </div>
            <button
              onClick={() => markDone(task)}
              disabled={completingId === task.id}
              style={{ ...PRIMARY_BUTTON_STYLE, opacity: completingId === task.id ? 0.6 : 1, minHeight: 34, padding: "0 12px" }}
            >
              {completingId === task.id ? "Saving…" : "Mark done"}
            </button>
          </div>
        ))}
      </Card>
      )}

      {handoffFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hand off next stage"
          onClick={() => setHandoffFor(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,24,31,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: t.white,
              borderRadius: t.radiusCard,
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
              {handoffFor.stage_label} — done. Hand off the next stage?
            </span>
            <select value={pickedStageId} onChange={(e) => setPickedStageId(e.target.value)} style={TEXT_INPUT_STYLE}>
              {unassigned.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.stage_label}
                </option>
              ))}
            </select>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={TEXT_INPUT_STYLE}>
              <option value="" disabled>
                Choose a staff member…
              </option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={() => setHandoffFor(null)} style={SMALL_SECONDARY_BUTTON_STYLE}>
                Skip
              </button>
              <button
                onClick={submitHandoff}
                disabled={saving || !staffId}
                style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || !staffId ? 0.6 : 1 }}
              >
                {saving ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------
   Audio playback — voice notes and site memos. Thin native <audio>
   wrapper, no custom scrubber; the browser issues Range requests against
   the streaming endpoint (see src/lib/r2-stream.ts) for seeking.
   ------------------------------------------------------------------ */
function pickRecorderMimeType() {
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const c of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(c)) return c;
  }
  return "";
}

function extensionForMimeType(mimeType) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  return "m4a";
}

/* Popup for recording a voice note in-browser via MediaRecorder — record,
   stop, preview, save. No waveform — matches the app's "no new UI kit"
   restraint, same as AssignTeamModal above. */
function VoiceNoteModal({ onClose, onSave }) {
  const [status, setStatus] = useState("idle"); // idle | recording | recorded | saving
  const [elapsedS, setElapsedS] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const blobRef = useRef(null);
  const previewUrlRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/mp4" });
        blobRef.current = blob;
        previewUrlRef.current = URL.createObjectURL(blob);
        setStatus("recorded");
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus("recording");
      setElapsedS(0);
      timerRef.current = setInterval(() => setElapsedS((s) => s + 1), 1000);
    } catch (err) {
      console.error("[sbm] mic access failed", err);
      setError("Couldn't access the microphone — check permissions.");
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
  };

  const save = async () => {
    if (!blobRef.current) return;
    setStatus("saving");
    setError("");
    try {
      const ext = extensionForMimeType(blobRef.current.type);
      await onSave(blobRef.current, `voice-note.${ext}`);
      onClose();
    } catch (err) {
      console.error("[sbm] voice note upload failed", err);
      setError("Failed to save — try again.");
      setStatus("recorded");
    }
  };

  const mm = String(Math.floor(elapsedS / 60)).padStart(2, "0");
  const ss = String(elapsedS % 60).padStart(2, "0");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Record voice note"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Record voice note</span>

        {status === "idle" && (
          <button onClick={startRecording} style={{ ...PRIMARY_BUTTON_STYLE, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Mic size={16} /> Start recording
          </button>
        )}

        {status === "recording" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: t.display, fontSize: 22, color: t.signal }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.signal }} />
              {mm}:{ss}
            </div>
            <button
              onClick={stopRecording}
              style={{ ...PRIMARY_BUTTON_STYLE, background: t.edge, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <Square size={14} /> Stop
            </button>
          </>
        )}

        {status === "recorded" && previewUrlRef.current && (
          <>
            <AudioPlayer src={previewUrlRef.current} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{ minHeight: 40, padding: "0 16px", border: `1px solid ${t.frost}`, borderRadius: t.radiusButton, background: t.white, color: t.edge2, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Discard
              </button>
              <button onClick={save} style={PRIMARY_BUTTON_STYLE}>
                Save
              </button>
            </div>
          </>
        )}

        {status === "saving" && <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Saving…</p>}
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
      </div>
    </div>
  );
}

/* Add photo / video / voice note — sits at the top of SiteView. Photo/video
   upload immediately on file selection; voice note opens VoiceNoteModal. */
function SiteMediaUploadRow({ siteId, onUploaded, onVoiceNote }) {
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await postSiteMedia(siteId, file);
      await onUploaded?.();
    } catch (err) {
      console.error("[sbm] media upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const actionButtonStyle = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    minHeight: 40,
    border: `1px solid ${t.frost}`,
    borderRadius: t.radiusButton,
    background: t.white,
    color: t.edge,
    fontSize: 13,
    fontWeight: 600,
    cursor: uploading ? "wait" : "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button disabled={uploading} onClick={() => photoInputRef.current?.click()} style={actionButtonStyle}>
        <Image size={15} /> Add photo
      </button>
      <button disabled={uploading} onClick={() => videoInputRef.current?.click()} style={actionButtonStyle}>
        <Video size={15} /> Add video
      </button>
      <button disabled={uploading} onClick={() => setShowVoiceModal(true)} style={actionButtonStyle}>
        <Mic size={15} /> Add voice note
      </button>
      {showVoiceModal && (
        <VoiceNoteModal
          onClose={() => setShowVoiceModal(false)}
          onSave={async (blob, fileName) => {
            await onVoiceNote(blob, fileName);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Site timeline — unified activity feed (calls incl. voice notes, media
   uploads, team changes, site-detail edits), newest first. Extends the
   borderLeft rail idiom already used for CallDetail's unresolved-items
   block, with a dot marker per entry.
   ------------------------------------------------------------------ */
function timelineEntryIcon(entry) {
  if (entry.type === "call") return entry.ref?.is_voice_memo ? <Mic size={13} /> : <FileText size={13} />;
  if (entry.type === "media") return entry.ref?.media_type === "video" ? <Video size={13} /> : <Image size={13} />;
  if (entry.type === "team_added") return <Users size={13} />;
  return <FileText size={13} />;
}

function VoiceMemoDetail({ entryRef }) {
  if (entryRef.transcript === undefined) return null; // not sent to this session (staff) — nothing to show
  if (entryRef.transcript === null) return null; // still transcribing
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.edge2, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Transcript
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: t.edge2,
          background: t.frostSoft,
          border: `1px solid ${t.frost}`,
          borderRadius: t.radiusButton,
          padding: "10px 12px",
          maxHeight: 220,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {entryRef.transcript}
      </div>
      {entryRef.todos?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.edge2, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Todos
          </div>
          {entryRef.todos.map((td) => (
            <TodoRow key={td.id} todo={td} readOnly />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteTimelineEntry({ entry, onOpenCall, canManage }) {
  const content = () => {
    if (entry.type === "call") {
      // A site voice memo's transcript/todos are admin-only (see
      // isCallAccessibleToUser) — staff get the plain summary line, not a
      // link into a call detail the API would 403 on anyway.
      if (entry.ref?.is_voice_memo && !canManage) {
        return <span style={{ fontSize: 14, color: t.edge, lineHeight: 1.6 }}>{entry.summary}</span>;
      }
      return (
        <button
          onClick={() => onOpenCall(entry.ref.call_id)}
          style={{ display: "block", textAlign: "left", padding: 0, border: "none", background: "none", cursor: "pointer", color: t.edge, fontSize: 14, lineHeight: 1.6 }}
        >
          {entry.summary}
        </button>
      );
    }
    if (entry.type === "media") {
      return (
        <>
          <span style={{ fontSize: 14, color: t.edge }}>{entry.summary}</span>
          {entry.ref?.media_type === "photo" ? (
            <img
              src={`/api/media/${entry.ref.media_id}`}
              alt=""
              style={{ display: "block", marginTop: 6, maxWidth: "100%", maxHeight: 220, borderRadius: t.radiusButton, border: `1px solid ${t.frost}` }}
            />
          ) : (
            <video
              src={`/api/media/${entry.ref.media_id}`}
              controls
              style={{ display: "block", marginTop: 6, maxWidth: "100%", maxHeight: 220, borderRadius: t.radiusButton }}
            />
          )}
        </>
      );
    }
    return <span style={{ fontSize: 14, color: t.edge }}>{entry.summary}</span>;
  };

  return (
    <div style={{ position: "relative", paddingLeft: 20, paddingBottom: 18 }}>
      <span
        style={{
          position: "absolute",
          left: -4.5,
          top: 4,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: t.accent,
          border: `2px solid ${t.white}`,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.edge2, marginBottom: 3 }}>
        {timelineEntryIcon(entry)}
        <span>{fmtDate(entry.created_at)}</span>
        {entry.actor_name && <span>· {entry.actor_name}</span>}
      </div>
      {content()}
      {entry.type === "call" && entry.ref?.is_voice_memo && <AudioPlayer src={`/api/calls/${entry.ref.call_id}/recording`} />}
      {entry.type === "call" && entry.ref?.is_voice_memo && canManage && <VoiceMemoDetail entryRef={entry.ref} />}
    </div>
  );
}

function SiteTimeline({ entries, onOpenCall, canManage }) {
  if (entries === null) return <p style={{ fontSize: 13, color: t.edge2 }}>Loading…</p>;
  if (entries.length === 0) {
    return (
      <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing recorded for this site yet.</p>
      </Card>
    );
  }
  return (
    <div style={{ borderLeft: `2px solid ${t.frost}`, marginLeft: 4 }}>
      {entries.map((entry) => (
        <SiteTimelineEntry key={`${entry.type}-${entry.id}`} entry={entry} onOpenCall={onOpenCall} canManage={canManage} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   Site view — drilldown from Tile 3, the sites directory, or the
   review screen. Calls tagged to this site (same shape as DayView,
   filtered by site instead of date), plus always-editable site details
   and an always-editable team roster — see the conversation that added
   this: "Always available, not conditional" on call/item count.
   ------------------------------------------------------------------ */
function SiteView({
  site,
  siteRecord,
  calls,
  onBack,
  onOpen,
  onSiteUpdated,
  autoEditDetails = false,
  canManage = true,
  myOpenTasks = [],
  onTasksChanged = () => {},
}) {
  const [showWorkTimeline, setShowWorkTimeline] = useState(false);
  const siteCalls = useMemo(
    () => sortCalls(calls.filter((c) => c.sites?.includes(site))),
    [calls, site]
  );

  /* "Assign new site" only for a genuinely blank site — no details AND no
     call history yet. Anything with either already shows "Add more site
     details" instead, since it's not really a fresh/untouched site. */
  const hasDetails = Boolean(siteRecord?.address?.trim() || siteRecord?.poc_name?.trim());
  const isBlankSite = !hasDetails && siteCalls.length === 0;
  const daysMissed = siteRecord?.target_closure_date ? -daysUntil(siteRecord.target_closure_date) : 0;
  const targetMissed = daysMissed > 0;

  const [address, setAddress] = useState(siteRecord?.address ?? "");
  const [pocName, setPocName] = useState(siteRecord?.poc_name ?? "");
  const [targetDate, setTargetDate] = useState(siteRecord?.target_closure_date ?? "");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  // Landing here straight from "Add new site" (see onSiteCreated) opens the
  // details form immediately rather than requiring an extra tap, since the
  // whole point of that flow was to keep filling this site in.
  const [editingDetails, setEditingDetails] = useState(autoEditDetails && !hasDetails);

  const [team, setTeam] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [timeline, setTimeline] = useState(null);

  useEffect(() => {
    if (!siteRecord?.id) {
      setTeam([]);
      return;
    }
    let cancelled = false;
    fetchSiteTeam(siteRecord.id)
      .then((data) => {
        if (!cancelled) setTeam(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load site team", err);
        if (!cancelled) setTeam([]);
      });
    return () => {
      cancelled = true;
    };
  }, [siteRecord?.id]);

  const loadTimeline = useCallback(() => {
    if (!siteRecord?.id) {
      setTimeline([]);
      return Promise.resolve();
    }
    return fetchSiteTimeline(siteRecord.id)
      .then((data) => setTimeline(data))
      .catch((err) => {
        console.error("[sbm] failed to load site timeline", err);
        setTimeline([]);
      });
  }, [siteRecord?.id]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const saveDetails = async () => {
    if (!siteRecord?.id) return;
    setSavingDetails(true);
    setDetailsSaved(false);
    try {
      await patchSite(siteRecord.id, { address, poc_name: pocName, target_closure_date: targetDate || null });
      await onSiteUpdated?.();
      setDetailsSaved(true);
      setEditingDetails(false);
    } catch (err) {
      console.error("[sbm] failed to save site details", err);
    } finally {
      setSavingDetails(false);
    }
  };

  const addTeamMember = async (userId) => {
    const member = await postSiteTeamMember(siteRecord.id, userId);
    setTeam((current) => [...(current ?? []), member]);
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {site}
      </h1>

      {/* Staff have no visibility into the Sites-list red highlight (that's
          their own home page, not a management view) — this is their only
          signal that a target closure date has passed. Admin/superadmin get
          the list highlight instead; this banner would be redundant for
          them since they're the ones who set the date. */}
      {!canManage && targetMissed && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            marginBottom: "1.25rem",
            borderRadius: t.radiusCard,
            background: t.signalBg,
            color: t.signal,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          You've missed the target closure date by {daysMissed} day{daysMissed === 1 ? "" : "s"}.
        </div>
      )}

      {siteRecord?.id && (
        <SiteMediaUploadRow
          siteId={siteRecord.id}
          onUploaded={loadTimeline}
          onVoiceNote={async (blob, fileName) => {
            await postSiteVoiceNote(siteRecord.id, blob, fileName);
            await loadTimeline();
          }}
        />
      )}

      {siteRecord?.id && (
        <Card style={{ marginBottom: 12 }}>
          <TileLabel
            action={
              canManage ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {detailsSaved && !editingDetails && <span style={{ fontSize: 12, color: t.edge2 }}>Saved.</span>}
                  <button
                    onClick={() => {
                      setDetailsSaved(false);
                      setEditingDetails((v) => !v);
                    }}
                    style={{
                      padding: "6px 12px",
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
                    {editingDetails ? "Cancel" : isBlankSite ? "Assign new site" : "Add more site details"}
                  </button>
                </div>
              ) : undefined
            }
          >
            Site details
          </TileLabel>

          {canManage && editingDetails ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                <input
                  placeholder="Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={TEXT_INPUT_STYLE}
                />
                <input
                  placeholder="Point of contact name"
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                  style={TEXT_INPUT_STYLE}
                />
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 }}>
                  Target closure date
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    style={TEXT_INPUT_STYLE}
                  />
                </label>
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={saveDetails} disabled={savingDetails} style={{ ...PRIMARY_BUTTON_STYLE, opacity: savingDetails ? 0.6 : 1 }}>
                  {savingDetails ? "Saving…" : "Save details"}
                </button>
              </div>
            </>
          ) : (
            // Read-only summary of whatever's currently saved — shown for
            // everyone, not just staff, and not only while the edit form
            // happens to be open. Previously an admin had no way to see a
            // site's saved address/point-of-contact without re-opening the
            // edit form every visit, which read as "the details I added
            // aren't there when I come back."
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, color: t.edge }}>{siteRecord?.address?.trim() || "No address on file."}</span>
              {siteRecord?.poc_name?.trim() && (
                <span style={{ fontSize: 13, color: t.edge2 }}>Point of contact: {siteRecord.poc_name}</span>
              )}
              <span style={{ fontSize: 13, color: targetMissed ? t.signal : t.edge2, fontWeight: targetMissed ? 700 : 400 }}>
                {siteRecord?.target_closure_date
                  ? `Target closure date: ${fmtDate(siteRecord.target_closure_date)}${targetMissed ? ` — missed by ${daysMissed}d` : ""}`
                  : "No target closure date set."}
              </span>
            </div>
          )}
        </Card>
      )}

      {siteRecord?.id && (
        <Card style={{ marginBottom: 12 }}>
          <TileLabel
            action={
              canManage ? (
                <button
                  onClick={() => setShowAssignModal(true)}
                  style={{
                    padding: "6px 12px",
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
                  {team && team.length > 0 ? "Add more members" : "Assign team"}
                </button>
              ) : undefined
            }
          >
            Team
          </TileLabel>
          {team === null ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: "6px 0 0" }}>Loading…</p>
          ) : team.length === 0 ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: "6px 0 0" }}>No one assigned yet.</p>
          ) : (
            team.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", ...TILE_ROW_STYLE }}>
                <span style={{ fontSize: 14, color: t.edge }}>{m.name}</span>
                <span style={{ fontSize: 13, color: t.edge2 }}>{m.contact_number || "no phone on file"}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {siteRecord?.id && canManage && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowWorkTimeline(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
            View work timeline
          </button>
        </div>
      )}

      {siteRecord?.id && !canManage && (
        <MyTaskBanner siteId={siteRecord.id} myTasks={myOpenTasks} onChanged={onTasksChanged} />
      )}

      <TileLabel>Timeline</TileLabel>
      <div style={{ marginTop: 8 }}>
        <SiteTimeline entries={timeline} onOpenCall={onOpen} canManage={canManage} />
      </div>

      {showAssignModal && <AssignTeamModal onClose={() => setShowAssignModal(false)} onAdd={addTeamMember} />}
      {showWorkTimeline && (
        <WorkTimelinePopup site={siteRecord} onClose={() => setShowWorkTimeline(false)} onAssigned={onTasksChanged} />
      )}
    </div>
  );
}

/* Popup for "Add new site" — name plus the same optional address/POC
   fields SiteView's own details form uses (identical placeholders), so a
   site created here looks no different from one filled in afterward.
   Team assignment and photo/video/voice-note upload aren't collected here
   — creating the site hands off straight into SiteView, where that flow
   already exists, rather than duplicating it in this modal. */
function AddSiteModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [pocName, setPocName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a site name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onCreate(trimmedName, address.trim(), pocName.trim());
    } catch (err) {
      console.error("[sbm] failed to create site", err);
      setError("Failed to create site — try again.");
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add new site"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Add new site</span>
        <input
          autoFocus
          placeholder="Site name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          placeholder="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          placeholder="Point of contact name"
          value={pocName}
          onChange={(e) => setPocName(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: "0 16px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge2,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Adding…" : "Add site"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Sites directory — reached via the "N confirmed sites" rollup on Tile 3.
   Every confirmed site with its current open-item count, alphabetical — a
   reference list, unlike Tile 3 itself which only shows sites that need
   triage. Tapping a row reuses the same per-site drilldown (SiteView) Tile
   3's own rows link to. Also the entry point for "Add new site".
   ------------------------------------------------------------------ */
function SitesDirectoryView({ onBack, onOpenSite, onSiteCreated, canManage = true, isHome = false }) {
  const [sites, setSites] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchConfirmedSites()
      .then((data) => {
        if (!cancelled) setSites(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load confirmed sites", err);
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {!isHome && <BackLink onClick={onBack}>Back</BackLink>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Sites</h1>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
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
            <Plus size={14} /> Add new site
          </button>
        )}
      </div>

      {sites === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : sites.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No confirmed sites yet.</p>
        </Card>
      ) : (
        <Card>
          {sites.map((s) => {
            const missed = s.target_closure_date && daysUntil(s.target_closure_date) < 0;
            return (
              <button
                key={s.id}
                onClick={() => onOpenSite(s.name)}
                style={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: missed ? "12px 1.25rem" : "12px 0",
                  margin: missed ? "0 -1.25rem" : 0,
                  border: "none",
                  borderTop: `1px solid ${t.frost}`,
                  background: missed ? t.signalBg : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: t.body,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {s.unread_count > 0 && (
                    <span
                      className="sbm-unread-glow"
                      aria-label={`${s.unread_count} new since you last posted`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 20,
                        height: 20,
                        padding: "0 6px",
                        borderRadius: 999,
                        background: t.unread,
                        color: t.white,
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {s.unread_count}
                    </span>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 500, color: t.edgeStrong }}>{s.name}</span>
                  {s.target_closure_date && (
                    <span style={{ fontSize: 12, color: missed ? t.signal : t.edge2, fontWeight: missed ? 700 : 400 }}>
                      Due {fmtShort(s.target_closure_date)}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12, color: missed ? t.signal : t.edge2, fontWeight: missed ? 700 : 400 }}>
                  {missed ? `missed ${Math.abs(daysUntil(s.target_closure_date))}d` : `${s.open_count} open`}
                </span>
              </button>
            );
          })}
        </Card>
      )}

      {showAddModal && (
        <AddSiteModal
          onClose={() => setShowAddModal(false)}
          onCreate={async (name, address, pocName) => {
            const site = await onSiteCreated(name, address, pocName);
            setShowAddModal(false);
            return site;
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------
   Staff — admin/superadmin only (migration 0011). Lists every `staff`
   account plus the viewer's own row ("or himself" — see docs). PINs come
   back decrypted from GET /api/staff and are masked client-side behind a
   per-row reveal toggle; a null pin means the account predates reversible
   storage and needs a reset before it's viewable.
   ------------------------------------------------------------------ */
function StaffDirectoryView({ onBack }) {
  const [staff, setStaff] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [revealed, setRevealed] = useState(new Set());
  const [phoneDrafts, setPhoneDrafts] = useState({});
  const [confirmingResetId, setConfirmingResetId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    return fetchStaff()
      .then((data) => setStaff(data))
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        setStaff([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleReveal = (id) =>
    setRevealed((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const savePhone = async (id) => {
    const phone = phoneDrafts[id] ?? "";
    setBusyId(id);
    setError("");
    try {
      await patchStaffPhone(id, phone.trim());
      setPhoneDrafts((d) => {
        const { [id]: _drop, ...rest } = d;
        return rest;
      });
      await load();
    } catch (err) {
      console.error("[sbm] failed to save phone", err);
      setError("Failed to save phone — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const resetPin = async (id) => {
    if (confirmingResetId !== id) {
      setConfirmingResetId(id);
      return;
    }
    setConfirmingResetId(null);
    setBusyId(id);
    setError("");
    try {
      await postResetStaffPin(id);
      setRevealed((s) => new Set(s).add(id));
      await load();
    } catch (err) {
      console.error("[sbm] failed to reset pin", err);
      setError("Failed to reset PIN — try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Staff</h1>
        <button
          onClick={() => setShowAddModal(true)}
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
          <Plus size={14} /> Add staff
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: t.signal, marginTop: 0 }}>{error}</p>}

      {staff === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : staff.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No staff yet.</p>
        </Card>
      ) : (
        <Card>
          {staff.map((s) => {
            const draft = phoneDrafts[s.id] ?? s.phone ?? "";
            const dirty = draft !== (s.phone ?? "");
            const isRevealed = revealed.has(s.id);
            const busy = busyId === s.id;
            return (
              <div key={s.id} style={{ ...TILE_ROW_STYLE, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, color: t.edge, fontWeight: 600 }}>
                    {s.name}
                    {s.is_self && <span style={{ fontWeight: 400, color: t.edge2 }}> (you)</span>}
                  </span>
                  <span style={{ fontSize: 12, color: t.edge2, textTransform: "capitalize" }}>{s.role}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    placeholder="Phone"
                    value={draft}
                    onChange={(e) => setPhoneDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    style={{ ...TEXT_INPUT_STYLE, minHeight: 34, fontSize: 13, flex: 1 }}
                  />
                  {dirty && (
                    <button
                      onClick={() => savePhone(s.id)}
                      disabled={busy}
                      style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, opacity: busy ? 0.6 : 1 }}
                    >
                      Save
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: t.edge2, fontVariantNumeric: "tabular-nums" }}>
                    PIN: {s.pin ? (isRevealed ? s.pin : "••••") : "not recoverable"}
                  </span>
                  {s.pin && (
                    <button
                      onClick={() => toggleReveal(s.id)}
                      style={{ border: "none", background: "none", color: t.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
                    >
                      {isRevealed ? "Hide" : "Show"}
                    </button>
                  )}
                  <button
                    onClick={() => resetPin(s.id)}
                    disabled={busy}
                    style={{ border: "none", background: "none", color: t.edge2, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, opacity: busy ? 0.6 : 1 }}
                  >
                    {confirmingResetId === s.id ? "Click again to confirm" : "Reset PIN"}
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {showAddModal && (
        <AddStaffModal
          onClose={() => setShowAddModal(false)}
          onCreate={async (name, phone) => {
            const created = await postCreateStaff(name, phone);
            await load();
            setRevealed((s) => new Set(s).add(created.id));
            return created;
          }}
        />
      )}
    </div>
  );
}

/* "Add staff" — name + optional phone. The PIN is generated server-side and
   returned once here; it stays viewable afterward from the row's reveal
   toggle (see docs "PIN visibility" decision), so there's no separate
   one-time-only confirmation screen to build. */
function AddStaffModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await onCreate(trimmed, phone.trim());
      setCreated(result);
    } catch (err) {
      console.error("[sbm] failed to add staff", err);
      setError(err.message || "Failed to add — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add staff"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,31,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.25rem",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 360,
          background: t.white,
          borderRadius: t.radiusCard,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {created ? (
          <>
            <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>
              {created.name} added
            </span>
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>
              Share this PIN with {created.name} to log in. You can view it again later from the Staff page.
            </p>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 2, color: t.edge, fontVariantNumeric: "tabular-nums" }}>
              {created.pin}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
              <button onClick={onClose} style={PRIMARY_BUTTON_STYLE}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>Add staff</span>
            <input
              autoFocus
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={TEXT_INPUT_STYLE}
            />
            <input
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={TEXT_INPUT_STYLE}
            />
            {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                onClick={onClose}
                style={{
                  minHeight: 40,
                  padding: "0 16px",
                  border: `1px solid ${t.frost}`,
                  borderRadius: t.radiusButton,
                  background: t.white,
                  color: t.edge2,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button onClick={submit} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}>
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Site review — reached via "Show unconfirmed sites" below Tile 3.
   Every site (discovered by the main extraction or the Haiku site scan),
   with a Valid / Not valid toggle. Changes are local until "Update
   confirmed sites" — deliberately batched rather than saving per-toggle,
   so reviewing a dozen sites is a dozen taps, not a dozen round trips.
   ------------------------------------------------------------------ */
function SitesReviewView({ sites, onBack, onSaved }) {
  const [pending, setPending] = useState(() => Object.fromEntries(sites.map((s) => [s.id, s.is_confirmed])));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const runBackfill = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const result = await postSitesBackfill();
      await onSaved();
      setScanResult(
        result.scanned === 0
          ? "No untouched calls to scan."
          : `Scanned ${result.scanned} call${result.scanned === 1 ? "" : "s"} — found ${result.sitesFound.length ? result.sitesFound.join(", ") : "no sites"}.`
      );
    } catch (err) {
      console.error("[sbm] site backfill failed", err);
      setScanResult("Scan failed — see console.");
    } finally {
      setScanning(false);
    }
  };

  const dirty = sites.some((s) => pending[s.id] !== s.is_confirmed);

  const setChoice = (id, value) => {
    setSaved(false);
    setPending((p) => ({ ...p, [id]: p[id] === value ? null : value }));
  };

  const update = async () => {
    setSaving(true);
    try {
      const changed = sites.filter((s) => pending[s.id] !== s.is_confirmed);
      await Promise.all(changed.map((s) => patchSite(s.id, { is_confirmed: pending[s.id] })));
      await onSaved();
      setSaved(true);
    } catch (err) {
      console.error("[sbm] failed to update site confirmations", err);
    } finally {
      setSaving(false);
    }
  };

  const choiceButtonStyle = (active, kind) => ({
    flex: 1,
    padding: "8px 0",
    border: `1px solid ${active ? (kind === "Y" ? t.accent : t.putty) : t.frost}`,
    borderRadius: t.radiusButton,
    background: active ? (kind === "Y" ? t.accent : t.puttyBg) : t.white,
    color: active ? (kind === "Y" ? t.white : t.putty) : t.edge2,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Review sites</h1>
        <button
          onClick={runBackfill}
          disabled={scanning}
          style={{
            flexShrink: 0,
            padding: "7px 12px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            background: t.white,
            color: t.edge2,
            fontSize: 12,
            fontWeight: 600,
            cursor: scanning ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {scanning ? "Scanning…" : "Scan existing calls"}
        </button>
      </div>
      {scanResult && <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1rem" }}>{scanResult}</p>}

      {sites.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No sites yet.</p>
        </Card>
      ) : (
        <Card style={{ marginBottom: 12 }}>
          {sites.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderTop: `1px solid ${t.frost}`,
              }}
            >
              <span style={{ flex: 1, fontSize: 14, color: t.edge }}>{s.name}</span>
              <div style={{ display: "flex", gap: 6, width: 160 }}>
                <button onClick={() => setChoice(s.id, "Y")} style={choiceButtonStyle(pending[s.id] === "Y", "Y")}>
                  Valid
                </button>
                <button onClick={() => setChoice(s.id, "N")} style={choiceButtonStyle(pending[s.id] === "N", "N")}>
                  Not valid
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={update}
          disabled={!dirty || saving}
          style={{
            padding: "10px 18px",
            border: "none",
            borderRadius: t.radiusButton,
            background: t.accent,
            color: t.white,
            fontSize: 14,
            fontWeight: 700,
            cursor: !dirty || saving ? "not-allowed" : "pointer",
            opacity: !dirty || saving ? 0.5 : 1,
          }}
        >
          {saving ? "Updating…" : "Update confirmed sites"}
        </button>
        {saved && !dirty && <span style={{ fontSize: 13, color: t.edge2 }}>Updated.</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Login gate — name + short PIN, session cookie set by POST /api/login.
   See src/lib/auth.ts. Shown in place of the whole dashboard until
   GET /api/me succeeds.
   ------------------------------------------------------------------ */
/* Calls Transcripts page — everything that used to sit directly on the
   admin home feed, relocated behind the "Calls logged" tile. Adds the two
   summary tiles (Important/Regular — see CallTypeBadge above for the same
   split) and per-card badges; todo toggling, park, and download are
   unchanged from the old home feed. */
function CallsPageView({ calls, onBack, onOpen, onToggle, onPark, busyIds }) {
  const [filter, setFilter] = useState(null); // null = all, "important", "regular"

  const importantCalls = useMemo(() => calls.filter((c) => c.call_type !== "low_signal"), [calls]);
  const regularCalls = useMemo(() => calls.filter((c) => c.call_type === "low_signal"), [calls]);
  const shown = filter === "important" ? importantCalls : filter === "regular" ? regularCalls : calls;
  const ordered = useMemo(() => sortCalls(shown), [shown]);

  const toggle = (key) => setFilter((current) => (current === key ? null : key));

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>Calls</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <button onClick={() => toggle("important")} style={{ all: "unset", cursor: "pointer", display: "block" }}>
          <Card style={{ borderColor: filter === "important" ? t.accent : t.frost }}>
            <TileLabel>Important calls</TileLabel>
            <div style={{ ...TILE_ROW_STYLE, borderTop: "none", padding: "6px 0 0" }}>
              <span style={TILE_NUMBER_STYLE}>{importantCalls.length}</span>
            </div>
          </Card>
        </button>
        <button onClick={() => toggle("regular")} style={{ all: "unset", cursor: "pointer", display: "block" }}>
          <Card style={{ borderColor: filter === "regular" ? t.accent : t.frost }}>
            <TileLabel>Regular calls</TileLabel>
            <div style={{ ...TILE_ROW_STYLE, borderTop: "none", padding: "6px 0 0" }}>
              <span style={TILE_NUMBER_STYLE}>{regularCalls.length}</span>
            </div>
          </Card>
        </button>
      </div>

      {calls.length === 0 ? (
        <EmptyState />
      ) : ordered.length === 0 ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>No {filter} calls.</p>
      ) : (
        <>
          {ordered.map((call, i) => (
            <CallCard
              key={call.id}
              index={i}
              call={call}
              showTypeBadge
              onOpen={onOpen}
              onToggle={onToggle}
              onPark={onPark}
              busyIds={busyIds}
            />
          ))}
          <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
            <DownloadButton calls={ordered} label={filter ?? "all"}>
              Download {filter ?? "everything"}
            </DownloadButton>
          </div>
        </>
      )}
    </div>
  );
}

/* Recordings — admin/superadmin-only control, separate from the Calls page
   above. Where Calls is day-to-day todo triage (checklist rows, park/close),
   this is a review surface over the raw recordings themselves: play the
   audio back, see each extracted todo phrased as a plain sentence
   (formatTodoSentence) rather than a checkbox. Reuses the same `calls` list
   already loaded for an admin session — no separate fetch. Recording
   playback itself is scoped server-side (GET /api/calls/:id/recording,
   src/handlers/site-media.ts); this view is only ever reachable by
   admin/superadmin in the first place, same as CallsPageView. */
function RecordingsPageView({ calls, onBack, onOpen }) {
  const ordered = useMemo(() => sortCalls(calls), [calls]);

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        Recordings
      </h1>

      {ordered.length === 0 ? (
        <EmptyState />
      ) : (
        ordered.map((call) => (
          <Card key={call.id} style={{ marginBottom: 12 }}>
            <button
              onClick={() => onOpen(call.id)}
              style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 500, color: t.edge }}>
                  {call.client_name}
                </span>
                <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>
                  {fmtDate(call.recorded_at)}
                  {call.duration_s ? ` · ${Math.round(call.duration_s / 60)} min` : ""}
                </span>
              </div>
            </button>

            {call.transcript == null ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, color: t.edge2, fontSize: 13, marginTop: 8 }}>
                <FileText size={16} />
                Transcription in progress
              </span>
            ) : (
              <AudioPlayer src={`/api/calls/${call.id}/recording`} />
            )}

            {call.todos.length > 0 && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: t.edge2 }}>
                {call.todos.map((td) => (
                  <li key={td.id}>{formatTodoSentence(td)}</li>
                ))}
              </ul>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

export default function SimpleBusinessManager() {
  const [calls, setCalls] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [sitesAttention, setSitesAttention] = useState([]);
  const [allSites, setAllSites] = useState([]);
  const [staffCount, setStaffCount] = useState(0);
  const [callsCount, setCallsCount] = useState(0);
  /* Open (assigned, not done) site tasks — scoped server-side to "mine" for
     a staff session, or every open assignment business-wide for admin/
     superadmin. See fetchOpenSiteTasks and migration 0013. */
  const [openSiteTasks, setOpenSiteTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState({ name: "home" });
  const [busyIds, setBusyIds] = useState(new Set());

  /* Fetched on demand when a `staff` session opens a call from their site's
     timeline — their bulk `calls` list is never loaded (see the `me` effect
     below), so this is the only path to a call's transcript for them. */
  const [fetchedCall, setFetchedCall] = useState(null);

  /* undefined = checking, null = logged out, object = logged in. See
     src/lib/auth.ts / LoginScreen above — additive session-cookie auth,
     the whole dashboard is now gated behind it. */
  const [me, setMe] = useState(undefined);

  /* `staff` lands on their personal workflow tiles instead of the office
     dashboard — migration 0011 (role split) plus migration 0013 (the
     workflow tiles themselves). admin/superadmin get the dashboard unchanged. */
  const homeView = me?.role === "staff" ? { name: "staff-home" } : { name: "home" };

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch((err) => {
        console.error("[sbm] session check failed", err);
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    if (me.role === "staff") {
      // No calls/escalations/attention tile for staff — they only ever see
      // their own assigned sites and their own open workflow tasks, both
      // already filtered server-side.
      setView({ name: "staff-home" });
      Promise.all([fetchSites(), fetchOpenSiteTasks()])
        .then(([sitesData, tasksData]) => {
          if (cancelled) return;
          setAllSites(sitesData);
          setOpenSiteTasks(tasksData);
        })
        .catch((err) => {
          console.error("[sbm] failed to load sites", err);
          if (!cancelled) setLoadError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    setView({ name: "home" });
    Promise.all([
      fetchCalls(),
      fetchEscalations(),
      fetchSitesAttention(),
      fetchSites(),
      fetchStaffRoster(),
      fetchCallsCount(),
      fetchOpenSiteTasks(),
    ])
      .then(([callsData, escalationsData, attentionData, sitesData, staffData, callsCountData, tasksData]) => {
        if (cancelled) return;
        setCalls(callsData);
        setEscalations(escalationsData);
        setSitesAttention(attentionData);
        setAllSites(sitesData);
        setStaffCount(staffData.length);
        setCallsCount(callsCountData.count);
        setOpenSiteTasks(tasksData);
      })
      .catch((err) => {
        console.error("[sbm] failed to load calls", err);
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  const refreshOpenSiteTasks = useCallback(async () => {
    const tasksData = await fetchOpenSiteTasks();
    setOpenSiteTasks(tasksData);
  }, []);

  const onLogout = useCallback(async () => {
    await postLogout();
    setMe(null);
    setView({ name: "home" });
  }, []);

  const onResetPin = useCallback(async (currentPin, newPin) => {
    await postResetPin(currentPin, newPin);
  }, []);

  const onUpdatePhone = useCallback(async (phone) => {
    const result = await postUpdateMyPhone(phone);
    setMe((m) => (m ? { ...m, phone: result.phone } : m));
  }, []);

  const refreshSites = useCallback(async () => {
    const [sitesData, attentionData] = await Promise.all([fetchSites(), fetchSitesAttention()]);
    setAllSites(sitesData);
    setSitesAttention(attentionData);
  }, []);

  /* "Add new site": create, refresh the site list so SiteView can find the
     new record, then hand off straight into SiteView — team assignment and
     photo/video/voice-note upload already exist there, no need to
     duplicate that flow in the creation modal itself. */
  const onSiteCreated = useCallback(
    async (name, address, pocName) => {
      const site = await postCreateSite(name, address, pocName);
      await refreshSites();
      setView({ name: "site", site: site.name, from: { name: "sites-directory" }, autoEdit: true });
      return site;
    },
    [refreshSites]
  );

  const onAddEscalation = useCallback(async (text) => {
    const created = await postEscalation(text, null);
    setEscalations((es) => [...es, created]);
  }, []);

  const onCloseEscalation = useCallback(async (id) => {
    setEscalations((es) => es.filter((e) => e.id !== id));
    try {
      await closeEscalationApi(id);
    } catch (err) {
      console.error("[sbm] failed to close escalation", err);
      fetchEscalations().then(setEscalations).catch(() => {});
    }
  }, []);

  /* Tiles 1 & 2 — docs/ADDITIONAL_FEATURES_M0.md "Phase 1 home page".
     "Open" is a live snapshot (open items don't have a single day); "closed"
     is scoped to today specifically, via completed_at. */
  const todayCounts = useMemo(() => {
    const all = calls.flatMap((c) => c.todos);
    const now = today();
    const todayKey = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      open: all.filter((td) => td.status === "open").length,
      closed: all.filter((td) => td.status === "done" && dayKey(td.completed_at) === todayKey).length,
    };
  }, [calls]);

  /* Calendar month currently browsed — defaults to this month. Full month,
     not a rolling window: a fixed 28-day window didn't show a complete
     month and gave no way to look at an earlier one. */
  const [calMonth, setCalMonth] = useState(() => {
    const d = today();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const monthDays = useMemo(() => {
    const byDay = {};
    for (const c of calls) {
      const k = dayKey(c.recorded_at);
      byDay[k] = (byDay[k] ?? 0) + 1;
    }
    const now = today();
    const todayIso = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    const { year, month } = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoDate(year, month, day);
      const future = iso > todayIso;
      days.push({ date: iso, held: future ? null : true, calls: byDay[iso] ?? 0, future });
    }
    return days;
  }, [calls, calMonth]);

  const yearOptions = useMemo(() => {
    const current = today().getFullYear();
    const earliest = calls.reduce((min, c) => {
      const y = c.recorded_at ? new Date(c.recorded_at).getFullYear() : current;
      return Math.min(min, y);
    }, current);
    const out = [];
    for (let y = Math.min(earliest, current - 1); y <= current + 1; y++) out.push(y);
    return out;
  }, [calls]);

  const goToMonth = useCallback((year, month) => {
    if (month < 0) {
      year -= 1;
      month = 11;
    } else if (month > 11) {
      year += 1;
      month = 0;
    }
    setCalMonth({ year, month });
  }, []);

  /* Optimistic write, rolled back if D1 rejects it. */
  const mutate = useCallback(async (todo, patch) => {
    const prev = { status: todo.status, completed_at: todo.completed_at };
    setBusyIds((s) => new Set(s).add(todo.id));
    setCalls((cs) =>
      cs.map((c) => ({ ...c, todos: c.todos.map((td) => (td.id === todo.id ? { ...td, ...patch } : td)) }))
    );
    try {
      await patchTodo(todo.id, patch);
    } catch {
      setCalls((cs) =>
        cs.map((c) => ({ ...c, todos: c.todos.map((td) => (td.id === todo.id ? { ...td, ...prev } : td)) }))
      );
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(todo.id);
        return n;
      });
    }
  }, []);

  const onToggle = useCallback(
    (todo) =>
      mutate(
        todo,
        todo.status === "done"
          ? { status: "open", completed_at: null }
          : { status: "done", completed_at: new Date().toISOString() }
      ),
    [mutate]
  );

  const onPark = useCallback(
    (todo) => mutate(todo, { status: todo.status === "snoozed" ? "open" : "snoozed" }),
    [mutate]
  );

  const bulkCall = view.name === "call" ? calls.find((c) => c.id === view.id) : null;

  useEffect(() => {
    if (view.name !== "call" || bulkCall) {
      setFetchedCall(null);
      return;
    }
    // undefined = fetch in flight, distinct from null ("fetched, not found /
    // not permitted") so the render below can tell the two apart.
    setFetchedCall(undefined);
    let cancelled = false;
    fetchCall(view.id)
      .then((data) => {
        if (!cancelled) setFetchedCall(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load call", err);
        if (!cancelled) setFetchedCall(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.name, view.id, bulkCall]);

  const openCall = bulkCall ?? (view.name === "call" ? fetchedCall : null);

  const shell = (children) => (
    <div style={{ background: t.pane, minHeight: "100vh", fontFamily: t.body, color: t.edge }}>
      <style>{`
        *{box-sizing:border-box}
        button:focus-visible,a:focus-visible{outline:2px solid ${t.edge};outline-offset:2px}

        /* Cards read top-to-bottom in urgency order; the stagger says so. */
        @keyframes sbm-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .sbm-rise{animation:sbm-rise 260ms cubic-bezier(.22,.61,.36,1) both}

        /* Calendar days drawing in, staggered left to right. */
        @keyframes sbm-pane{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}
        .sbm-pane{animation:sbm-pane 300ms cubic-bezier(.22,.61,.36,1) both}

        .sbm-day{transition:border-color 140ms ease,background 140ms ease}
        @media (hover:hover){.sbm-day:hover{border-color:rgba(255,255,255,0.4)}}

        .sbm-tooltip{
          position:absolute;bottom:100%;left:50%;
          transform:translateX(-50%) translateY(-4px);
          margin-bottom:2px;padding:4px 8px;border-radius:4px;
          background:${t.white};color:${t.edge};
          font-size:11px;font-weight:500;white-space:nowrap;
          opacity:0;pointer-events:none;transition:opacity 120ms ease;z-index:10;
          box-shadow:0 2px 8px rgba(0,0,0,0.25);
        }
        @media (hover:hover){
          .sbm-tip:hover .sbm-tooltip{opacity:1}
        }
        .sbm-tip:focus-visible .sbm-tooltip{opacity:1}

        /* Unread-activity badge — the one deliberate pulse the design
           allows (CLAUDE.md): flags the other side having posted since you
           last did, stops the moment it's resolved (the badge just doesn't
           render once the count is back to zero). */
        @keyframes sbm-unread-pulse{
          0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.55)}
          50%{box-shadow:0 0 0 6px rgba(34,197,94,0)}
        }
        .sbm-unread-glow{animation:sbm-unread-pulse 2s ease-in-out infinite}

        /* Not a blanket kill: the frost must still change instantly, or
           completion becomes ambiguous. Only entrances are dropped. */
        @media (prefers-reduced-motion: reduce){
          .sbm-rise,.sbm-pane{animation:none}
          .sbm-day{transition:none}
          .sbm-unread-glow{animation:none;box-shadow:0 0 0 3px rgba(34,197,94,0.35)}
        }
      `}</style>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>{children}</main>
    </div>
  );

  if (me === undefined) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  if (me === null) return <LoginScreen onLogin={setMe} />;

  if (loading) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  if (loadError) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Couldn't load calls: {loadError}</p>);

  if (view.name === "call" && !bulkCall && fetchedCall === undefined) {
    return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  }

  if (openCall)
    return shell(
      <CallDetail
        call={openCall}
        onBack={() => setView(view.from ?? homeView)}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
        canManage={me.role !== "staff"}
      />
    );

  if (view.name === "call") {
    return shell(
      <div>
        <BackLink onClick={() => setView(view.from ?? homeView)}>Back</BackLink>
        <p style={{ fontSize: 14, color: t.edge2 }}>Couldn't load that call.</p>
      </div>
    );
  }

  if (view.name === "day")
    return shell(
      <DayView
        date={view.date}
        calls={calls}
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "day", date: view.date } })}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
      />
    );

  if (view.name === "site")
    return shell(
      <SiteView
        site={view.site}
        siteRecord={allSites.find((s) => s.name === view.site)}
        calls={calls}
        onBack={() => setView(view.from ?? homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "site", site: view.site, from: view.from } })}
        onSiteUpdated={refreshSites}
        autoEditDetails={Boolean(view.autoEdit)}
        canManage={me.role !== "staff"}
        myOpenTasks={openSiteTasks.filter((tk) => tk.site_name === view.site)}
        onTasksChanged={refreshOpenSiteTasks}
      />
    );

  if (view.name === "workflow-site-list")
    return shell(
      <WorkflowCategorySiteList
        tasks={openSiteTasks}
        category={view.category}
        onBack={() => setView(view.from ?? homeView)}
        onOpenSite={(site) => setView({ name: "site", site, from: view })}
      />
    );

  if (view.name === "calls")
    return shell(
      <CallsPageView
        calls={calls}
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "calls" } })}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
      />
    );

  if (view.name === "recordings")
    return shell(
      <RecordingsPageView
        calls={calls}
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "recordings" } })}
      />
    );

  if (view.name === "sites-review")
    return shell(<SitesReviewView sites={allSites} onBack={() => setView(homeView)} onSaved={refreshSites} />);

  if (view.name === "sites-directory")
    return shell(
      <>
        {me.role === "staff" && (
          <AppHeader me={me} onLogout={onLogout} onResetPin={onResetPin} onUpdatePhone={onUpdatePhone} />
        )}
        <SitesDirectoryView
          onBack={() => setView(homeView)}
          onOpenSite={(site) => setView({ name: "site", site, from: { name: "sites-directory" } })}
          onSiteCreated={onSiteCreated}
          canManage={me.role !== "staff"}
          isHome={me.role === "staff"}
        />
      </>
    );

  if (view.name === "staff-directory") return shell(<StaffDirectoryView onBack={() => setView(homeView)} />);

  if (view.name === "staff-home")
    return shell(
      <>
        <AppHeader me={me} onLogout={onLogout} onResetPin={onResetPin} onUpdatePhone={onUpdatePhone} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            marginBottom: "1.5rem",
          }}
        >
          <WorkflowTilesRow
            tasks={openSiteTasks}
            onOpenCategory={(category) => setView({ name: "workflow-site-list", category, from: { name: "staff-home" } })}
          />
        </div>

        {openSiteTasks.length === 0 && (
          <p style={{ fontSize: 14, color: t.edge2, marginBottom: "1.5rem" }}>Nothing assigned right now.</p>
        )}

        <button
          onClick={() => setView({ name: "sites-directory" })}
          style={{ all: "unset", cursor: "pointer", fontSize: 13, fontWeight: 600, color: t.accent }}
        >
          All my sites →
        </button>
      </>
    );

  return shell(
    <>
      <AppHeader
        me={me}
        onLogout={onLogout}
        onResetPin={onResetPin}
        onUpdatePhone={onUpdatePhone}
        right={<span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{fmtDate(new Date().toISOString())}</span>}
      >
        <StreakWall
          days={monthDays}
          onSelectDay={(date) => setView({ name: "day", date })}
          selected={null}
          year={calMonth.year}
          month={calMonth.month}
          yearOptions={yearOptions}
          onChangeYear={(y) => goToMonth(y, calMonth.month)}
          onChangeMonth={(m) => goToMonth(calMonth.year, m)}
          onPrevMonth={() => goToMonth(calMonth.year, calMonth.month - 1)}
          onNextMonth={() => goToMonth(calMonth.year, calMonth.month + 1)}
          todayIso={isoDate(today().getFullYear(), today().getMonth(), today().getDate())}
        />
      </AppHeader>

      {/* Home tile panel. Order (top to bottom): sites needing attention,
          escalations, staff, the dynamic workflow-category tiles (business-
          wide counts — see WorkflowTilesRow), then "open today" and "calls
          logged" at the very bottom. "Open today" moved off the top and the
          call-card feed moved to its own page (see "calls" view) — both per
          the admin-overview revision to this plan; "closed today" kept its
          original position. 2 columns on a phone; auto-widens toward one
          row as space allows. Every tile is fixed to --tile-height (see the
          Card `tile` variant) so the grid stays symmetrical regardless of
          content — list tiles (SitesAttentionTile, EscalationsTile) scroll
          internally instead of growing taller than their neighbours. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <StatCard value={todayCounts.closed} label="closed today" />
        <SitesAttentionTile
          sites={sitesAttention}
          onOpenSite={(site) => setView({ name: "site", site, from: { name: "home" } })}
          onReviewSites={() => setView({ name: "sites-review" })}
          onViewDirectory={() => setView({ name: "sites-directory" })}
          hasAnySites={allSites.length > 0}
          unconfirmedCount={allSites.filter((s) => s.is_confirmed === null).length}
          confirmedCount={allSites.filter((s) => s.is_confirmed === "Y").length}
        />
        <EscalationsTile
          escalations={escalations}
          onAdd={onAddEscalation}
          onClose={onCloseEscalation}
          busyIds={busyIds}
        />
        {(me.role === "admin" || me.role === "superadmin") && (
          <StaffTile count={staffCount} onOpen={() => setView({ name: "staff-directory" })} />
        )}
        <WorkflowTilesRow
          tasks={openSiteTasks}
          onOpenCategory={(category) => setView({ name: "workflow-site-list", category, from: { name: "home" } })}
        />
        <StatCard value={todayCounts.open} label="open today" />
        <button
          onClick={() => setView({ name: "calls" })}
          style={{ all: "unset", cursor: "pointer", display: "block" }}
          aria-label={`Calls logged — ${callsCount}`}
        >
          <Card tile>
            <TileLabel>calls logged</TileLabel>
            <div style={TILE_VALUE_ROW_STYLE}>
              <span style={TILE_NUMBER_STYLE}>{callsCount}</span>
            </div>
          </Card>
        </button>
        {/* Admin/superadmin only, same as "calls logged" — staff never load
            this home view at all (see homeView above). Separate control from
            Calls: recordings + sentence-format todos, not a todo checklist. */}
        <button
          onClick={() => setView({ name: "recordings" })}
          style={{ all: "unset", cursor: "pointer", display: "block" }}
          aria-label={`Recordings — ${callsCount}`}
        >
          <Card tile>
            <TileLabel>recordings</TileLabel>
            <div style={TILE_VALUE_ROW_STYLE}>
              <span style={TILE_NUMBER_STYLE}>{callsCount}</span>
            </div>
          </Card>
        </button>
      </div>
    </>
  );
}


import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { PRODUCTION_JOB_STATUS_LABEL, PRODUCTION_STEP_LABEL } from "../../lib/constants.js";
import {
  fetchProductionJob,
  fetchStaffRoster,
  patchProductionJobProblem,
  patchProductionStep,
  postProductionJobProblem,
} from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

const stepStatusMeta = {
  pending: { label: "Not started", color: t.edge2 },
  assigned: { label: "In progress", color: t.accent },
  done: { label: "Done", color: t.edge2 },
  blocked: { label: "Blocked", color: t.signal },
};

function StepAssignRow({ step, staffRoster, canAssign, waitingOn, onAssign }) {
  const [picking, setPicking] = useState(false);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!canAssign) return null;

  if (waitingOn) {
    return <p style={{ fontSize: 12, color: t.edge2, margin: "6px 0 0" }}>Waiting on “{waitingOn}”</p>;
  }

  if (!picking) {
    return (
      <button type="button" onClick={() => setPicking(true)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, marginTop: 6 }}>
        {step.status === "blocked" ? "Reassign" : step.assigned_to_user_id ? "Reassign" : "Assign"}
      </button>
    );
  }

  const submit = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setError("");
    try {
      await onAssign(userId);
      setPicking(false);
    } catch (err) {
      setError(err.message || "Failed to assign.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
        <option value="">Assign to…</option>
        {(staffRoster ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {error ? <span style={{ fontSize: 12, color: t.signal }}>{error}</span> : null}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" onClick={submit} disabled={!userId || saving} style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, opacity: !userId || saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setPicking(false)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 34 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function StepRow({ step, staffRoster, canAct, waitingOn, onAssign, onComplete, onBlock }) {
  const meta = stepStatusMeta[step.status] ?? stepStatusMeta.pending;
  const [blocking, setBlocking] = useState(false);
  const [blockedNote, setBlockedNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submitBlock = async () => {
    if (!blockedNote.trim() || busy) return;
    setBusy(true);
    try {
      await onBlock(blockedNote.trim());
      setBlocking(false);
      setBlockedNote("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${t.frost}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
            background: step.status === "done" ? t.accent : "transparent",
            color: step.status === "done" ? t.white : meta.color,
            border: step.status === "done" ? "none" : `1.5px solid ${meta.color}`,
          }}
        >
          {step.status === "done" ? <Check size={13} /> : step.step_order}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: t.edge }}>{PRODUCTION_STEP_LABEL[step.step_key] ?? step.step_key}</span>
          <span style={{ fontSize: 12, color: meta.color, marginLeft: 8 }}>{meta.label}</span>
        </div>
      </div>

      <div style={{ marginLeft: 34 }}>
        {step.assignee_name && (
          <p style={{ fontSize: 12, color: t.edge2, margin: "4px 0 0" }}>
            {step.status === "done" ? "Done by" : "Assigned to"} {step.status === "done" ? step.completed_by_name ?? step.assignee_name : step.assignee_name}
            {step.completed_at ? ` · ${fmtShort(step.completed_at)}` : ""}
          </p>
        )}
        {step.note && <p style={{ fontSize: 12, color: t.edge2, margin: "2px 0 0" }}>{step.note}</p>}
        {step.status === "blocked" && step.blocked_note && (
          <p style={{ fontSize: 12, color: t.signal, margin: "4px 0 0", display: "flex", alignItems: "flex-start", gap: 4 }}>
            <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {step.blocked_note}
          </p>
        )}

        {canAct && step.status !== "done" && (
          <StepAssignRow step={step} staffRoster={staffRoster} canAssign={true} waitingOn={waitingOn} onAssign={onAssign} />
        )}

        {canAct && step.status === "assigned" && !waitingOn && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button type="button" onClick={onComplete} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, borderColor: t.accent, color: t.accent }}>
              Mark done
            </button>
            {!blocking ? (
              <button type="button" onClick={() => setBlocking(true)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, borderColor: t.signal, color: t.signal }}>
                Block
              </button>
            ) : null}
          </div>
        )}

        {blocking && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <textarea
              value={blockedNote}
              onChange={(e) => setBlockedNote(e.target.value)}
              placeholder="Why is this step blocked?"
              style={{ ...TEXT_INPUT_STYLE, minHeight: 60, padding: "8px 10px", fontFamily: t.body }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={submitBlock} disabled={!blockedNote.trim() || busy} style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, background: t.signal, opacity: !blockedNote.trim() || busy ? 0.6 : 1 }}>
                {busy ? "Saving…" : "Confirm block"}
              </button>
              <button type="button" onClick={() => setBlocking(false)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 34 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProblemsPanel({ jobId, problems, onRaise, onResolve }) {
  const [raising, setRaising] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);

  const submit = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    try {
      await onRaise(description.trim());
      setDescription("");
      setRaising(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: t.edge }}>Site problems</span>
        {!raising && (
          <button type="button" onClick={() => setRaising(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
            + Raise
          </button>
        )}
      </div>

      {raising && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's wrong at site?"
            style={{ ...TEXT_INPUT_STYLE, minHeight: 60, padding: "8px 10px", fontFamily: t.body }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={submit} disabled={!description.trim() || busy} style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, background: t.signal, opacity: !description.trim() || busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Raise problem"}
            </button>
            <button type="button" onClick={() => setRaising(false)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 34 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(problems ?? []).length === 0 ? (
        <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>No problems raised.</p>
      ) : (
        problems.map((p) => (
          <div key={p.id} style={{ padding: "10px 0", borderTop: `1px solid ${t.frost}` }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <AlertTriangle size={14} color={p.status === "open" ? t.signal : t.edge2} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: t.edge, margin: 0 }}>{p.description}</p>
                <p style={{ fontSize: 11, color: t.edge2, margin: "2px 0 0" }}>
                  {p.raised_by_name ? `${p.raised_by_name} · ` : ""}
                  {fmtShort(p.raised_at)}
                  {p.status === "resolved" && p.resolved_at ? ` · resolved ${fmtShort(p.resolved_at)}` : ""}
                </p>
                {p.resolution_note && <p style={{ fontSize: 12, color: t.edge2, margin: "2px 0 0" }}>{p.resolution_note}</p>}
              </div>
              {p.status === "open" && (
                <button
                  type="button"
                  disabled={resolvingId === p.id}
                  onClick={async () => {
                    setResolvingId(p.id);
                    try {
                      await onResolve(p.id);
                    } finally {
                      setResolvingId(null);
                    }
                  }}
                  style={{ ...SMALL_SECONDARY_BUTTON_STYLE, flexShrink: 0 }}
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

/* Job detail — the step ladder (in order, sequentially gated) plus site
   problems (not gated on step order). Shared by admin and any staff
   member working the job. See migrations/0042_production_warehouse.sql. */
export function ProductionJobDetailView({ jobId, onBack }) {
  const [data, setData] = useState(null);
  const [staffRoster, setStaffRoster] = useState([]);

  const load = useCallback(() => {
    fetchProductionJob(jobId)
      .then(setData)
      .catch((err) => {
        console.error("[sbm] failed to load production job", err);
        setData(null);
      });
  }, [jobId]);

  useEffect(load, [load]);
  useEffect(() => {
    fetchStaffRoster()
      .then(setStaffRoster)
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  }, []);

  if (!data) {
    return (
      <div>
        <BackLink onClick={onBack}>Back</BackLink>
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      </div>
    );
  }

  const { job, steps, problems } = data;
  // Any session may act on a step's controls; the server enforces the
  // narrow handoff permission (isUserActiveOnProductionJob) for a staff
  // assign. `canAct` exists as one place to tighten this later if needed.
  const canAct = true;

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 20, fontWeight: 500, color: t.edge, margin: "0 0 2px" }}>{job.title}</h1>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 4px" }}>
        {job.site_name} · {PRODUCTION_JOB_STATUS_LABEL[job.status] ?? job.status}
      </p>
      {job.survey_note && <p style={{ fontSize: 13, color: t.edge, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{job.survey_note}</p>}

      <Card style={{ marginTop: 16 }}>
        {steps.map((step, i) => {
          const previous = steps[i - 1];
          const waitingOn = previous && previous.status !== "done" ? PRODUCTION_STEP_LABEL[previous.step_key] ?? previous.step_key : null;
          return (
            <StepRow
              key={step.id}
              step={step}
              staffRoster={staffRoster}
              canAct={canAct}
              waitingOn={step.status === "pending" || step.status === "blocked" ? waitingOn : null}
              onAssign={async (userId) => {
                await patchProductionStep(step.id, { assigned_to_user_id: userId });
                load();
              }}
              onComplete={async () => {
                await patchProductionStep(step.id, { status: "done" });
                load();
              }}
              onBlock={async (note) => {
                await patchProductionStep(step.id, { status: "blocked", blocked_note: note });
                load();
              }}
            />
          );
        })}
      </Card>

      <ProblemsPanel
        jobId={job.id}
        problems={problems}
        onRaise={async (description) => {
          await postProductionJobProblem(job.id, description);
          load();
        }}
        onResolve={async (problemId) => {
          await patchProductionJobProblem(problemId);
          load();
        }}
      />
    </div>
  );
}

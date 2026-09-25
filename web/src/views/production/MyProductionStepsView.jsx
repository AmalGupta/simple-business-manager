import { useState, useEffect } from "react";
import { t } from "../../theme.js";
import { PRODUCTION_STEP_LABEL } from "../../lib/constants.js";
import { fetchOpenProductionSteps } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* "My production steps" — every step currently assigned to me (or, for an
   admin viewing a staff bookmark, that staff member), grouped by job. Tap
   opens the full job so a junior sees the survey/prior-step context, not
   just their one row. */
export function MyProductionStepsView({ onBack, onOpenJob, forUserId = null }) {
  const [steps, setSteps] = useState(null);

  useEffect(() => {
    fetchOpenProductionSteps({ forUserId: forUserId || undefined })
      .then(setSteps)
      .catch((err) => {
        console.error("[sbm] failed to load my production steps", err);
        setSteps([]);
      });
  }, [forUserId]);

  const byJob = new Map();
  for (const step of steps ?? []) {
    if (!byJob.has(step.job_id)) byJob.set(step.job_id, { job_id: step.job_id, job_title: step.job_title, site_name: step.site_name, steps: [] });
    byJob.get(step.job_id).steps.push(step);
  }
  const groups = [...byJob.values()];

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>My production steps</h1>

      {steps === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : groups.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing assigned to you right now.</p>
        </Card>
      ) : (
        groups.map((group) => (
          <button
            key={group.job_id}
            type="button"
            onClick={() => onOpenJob({ id: group.job_id })}
            style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", marginBottom: 10 }}
          >
            <Card>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.edgeStrong }}>{group.job_title}</div>
              <div style={{ fontSize: 12, color: t.edge2, marginTop: 2, marginBottom: 6 }}>{group.site_name}</div>
              {group.steps.map((s) => (
                <div key={s.id} style={{ fontSize: 13, color: t.accent, fontWeight: 600 }}>
                  {PRODUCTION_STEP_LABEL[s.step_key] ?? s.step_key}
                </div>
              ))}
            </Card>
          </button>
        ))
      )}
    </div>
  );
}

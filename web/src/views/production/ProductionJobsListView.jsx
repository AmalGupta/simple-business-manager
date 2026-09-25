import { useState, useEffect } from "react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { PRODUCTION_JOB_STATUS_LABEL } from "../../lib/constants.js";
import { fetchProductionJobs, fetchSites } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { NewProductionJobModal } from "./NewProductionJobModal.jsx";

const STATUS_TABS = [
  { key: "active", label: "In progress" },
  { key: "ready_for_dispatch", label: "Ready for dispatch" },
  { key: "dispatched", label: "Dispatched" },
  { key: "completed", label: "Completed" },
];

const statusDotColor = (status) =>
  status === "ready_for_dispatch" ? t.accent : status === "dispatched" || status === "completed" ? t.edge2 : t.edge;

/* Admin/superadmin — every production job, tab-filtered by status. "+ New
   job" is the office's "hand over the survey" moment (migration 0041). */
export function ProductionJobsListView({ onBack, onOpenJob }) {
  const [tab, setTab] = useState("active");
  const [jobs, setJobs] = useState(null);
  const [sites, setSites] = useState([]);
  const [creating, setCreating] = useState(false);

  const load = (status) => {
    fetchProductionJobs(status)
      .then(setJobs)
      .catch((err) => {
        console.error("[sbm] failed to load production jobs", err);
        setJobs([]);
      });
  };

  useEffect(() => load(tab), [tab]);
  useEffect(() => {
    fetchSites()
      .then(setSites)
      .catch((err) => console.error("[sbm] failed to load sites", err));
  }, []);

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Production</h1>
        <button type="button" onClick={() => setCreating(true)} style={PRIMARY_BUTTON_STYLE}>
          + New job
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1rem" }}>
        {STATUS_TABS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setTab(s.key)}
            style={{
              padding: "6px 12px",
              borderRadius: t.radiusButton,
              border: `1px solid ${tab === s.key ? t.accent : t.frost}`,
              background: tab === s.key ? t.accent : t.white,
              color: tab === s.key ? t.white : t.edge,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {jobs === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : jobs.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No jobs here.</p>
        </Card>
      ) : (
        <Card>
          {jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onOpenJob(job)}
              style={{
                all: "unset",
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                cursor: "pointer",
                padding: "12px 0",
                borderTop: `1px solid ${t.frost}`,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: statusDotColor(job.status),
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.edgeStrong }}>{job.title}</div>
                <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
                  {job.site_name} · {PRODUCTION_JOB_STATUS_LABEL[job.status] ?? job.status} · {fmtShort(job.created_at)}
                </div>
              </div>
            </button>
          ))}
        </Card>
      )}

      {creating && (
        <NewProductionJobModal
          sites={sites}
          onClose={() => setCreating(false)}
          onCreated={(job) => {
            setCreating(false);
            setTab("active");
            load("active");
            onOpenJob(job);
          }}
        />
      )}
    </div>
  );
}

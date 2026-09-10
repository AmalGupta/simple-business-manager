import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { Mic } from "lucide-react";
import { t } from "../../theme.js";
import { PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { fetchAppRequests, postAppRequestVoiceNote } from "../../lib/api.js";
import { VoiceNoteModal } from "../sites/VoiceNoteModal.jsx";

ModuleRegistry.registerModules([AllCommunityModule]);

const STATUS_META = {
  submitted: { bg: t.frostSoft, fg: t.accent, label: "Filed" },
  pending: { bg: t.frost, fg: t.edge2, label: "Uploading…" },
  transcribing: { bg: t.frost, fg: t.edge2, label: "Processing…" },
  failed: { bg: t.signalBg, fg: t.signal, label: "Failed" },
};

const REQUESTS_GRID_CSS = `
.sbm-requests-grid.ag-theme-quartz {
  --ag-font-family: var(--font-body), system-ui, sans-serif;
  --ag-font-size: 13px;
  --ag-background-color: var(--color-surface);
  --ag-header-background-color: #DCE6FF;
  --ag-odd-row-background-color: var(--color-surface);
  --ag-even-row-background-color: color-mix(in srgb, #DCE6FF 35%, white);
  --ag-row-hover-color: color-mix(in srgb, var(--color-accent) 6%, white);
  --ag-border-color: var(--color-line);
  --ag-row-border-color: var(--color-line-soft);
  --ag-header-foreground-color: var(--color-ink);
  --ag-foreground-color: var(--color-ink);
  --ag-border-radius: 0;
  --ag-wrapper-border-radius: 0;
  --ag-cell-horizontal-padding: 12px;
  --ag-header-height: 42px;
  --ag-row-height: 48px;
  width: 100%;
  min-height: 200px;
}
.sbm-requests-grid .ag-header-cell-text {
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sbm-requests-grid .ag-cell {
  display: flex;
  align-items: center;
}
.sbm-requests-grid .ag-tooltip,
.sbm-requests-grid .ag-popup .ag-tooltip {
  display: none !important;
}
`;

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      style={{
        flexShrink: 0,
        padding: "2px 8px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.fg,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {meta.label}
    </span>
  );
}

function JiraCell({ data }) {
  if (data?.jira_issue_url && data?.jira_issue_key) {
    return (
      <a
        href={data.jira_issue_url}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 13, fontWeight: 600, color: t.accent }}
      >
        {data.jira_issue_key}
      </a>
    );
  }
  if (data?.status === "failed") return <span style={{ color: t.signal }}>Failed</span>;
  return <span style={{ color: t.edge2 }}>—</span>;
}

/* "Request or report an issue" — voice only, opened from the account menu.
   Spoken request → Sarvam → Claude (speaker / title / summary) → Jira.
   My requests is an AG Grid of those structured fields. */
export function RequestForm({ onBack }) {
  const gridRef = useRef(null);
  const [requests, setRequests] = useState(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [error, setError] = useState("");

  const refresh = () => {
    fetchAppRequests()
      .then(setRequests)
      .catch((err) => console.error("[sbm] failed to load requests", err));
  };

  useEffect(refresh, []);

  useEffect(() => {
    const inFlight = requests?.some((r) => r.status === "pending" || r.status === "transcribing");
    if (!inFlight) return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [requests]);

  const handleSave = async (blob, fileName) => {
    setError("");
    try {
      await postAppRequestVoiceNote(blob, fileName);
      refresh();
    } catch (err) {
      setError(err.message || "Couldn't send the request — try again.");
      throw err;
    }
  };

  const columnDefs = useMemo(
    () => [
      {
        headerName: "Speaker",
        colId: "speaker",
        width: 140,
        valueGetter: (p) => p.data?.speaker_name || p.data?.created_by_name || "—",
      },
      {
        headerName: "Request title",
        colId: "title",
        flex: 1.2,
        minWidth: 160,
        valueGetter: (p) => {
          if (p.data?.title) return p.data.title;
          if (p.data?.status === "pending" || p.data?.status === "transcribing") return "Processing…";
          if (p.data?.status === "failed") return "Failed to file";
          return "—";
        },
      },
      {
        headerName: "Request summary",
        colId: "summary",
        flex: 2,
        minWidth: 200,
        valueGetter: (p) => p.data?.summary || p.data?.text || "—",
        tooltipValueGetter: (p) => p.value,
      },
      {
        headerName: "Jira ID",
        colId: "jira",
        width: 120,
        cellRenderer: (p) => (p.data ? <JiraCell data={p.data} /> : null),
      },
      {
        headerName: "Jira status",
        colId: "jira_status",
        width: 120,
        valueGetter: (p) => p.data?.jira_status || (p.data?.status === "submitted" ? "—" : ""),
        valueFormatter: (p) => p.value || "—",
      },
      {
        headerName: "Pipeline",
        colId: "pipeline",
        width: 110,
        sortable: false,
        cellRenderer: (p) => (p.data?.status ? <StatusBadge status={p.data.status} /> : null),
      },
    ],
    []
  );

  const defaultColDef = useMemo(
    () => ({ sortable: true, resizable: true, suppressMovable: true, tooltipValueGetter: () => null }),
    []
  );
  const getRowId = useCallback((params) => params.data.id, []);

  return (
    <div>
      <style>{REQUESTS_GRID_CSS}</style>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        Request or report an issue
      </h1>

      <Card>
        <p style={{ fontSize: 14, color: t.edge2, margin: "0 0 12px", lineHeight: 1.5 }}>
          Record a voice note describing a bug, a missing feature, or anything you want changed. It&apos;s transcribed,
          summarised, and filed straight into Jira.
        </p>
        <button
          onClick={() => setShowRecorder(true)}
          style={{
            ...PRIMARY_BUTTON_STYLE,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Mic size={16} /> Record request
        </button>
        {error && <p style={{ fontSize: 12, color: t.signal, margin: "10px 0 0" }}>{error}</p>}
      </Card>

      <h2 style={{ fontFamily: t.display, fontSize: 16, fontWeight: 600, color: t.edge, margin: "1.5rem 0 0.75rem" }}>
        My requests
      </h2>
      {requests === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : (
        <div className="sbm-requests-grid ag-theme-quartz" style={{ height: Math.max(220, Math.min(520, 48 + requests.length * 48 + 8)) }}>
          <AgGridReact
            ref={gridRef}
            rowData={requests}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            rowHeight={48}
            animateRows={false}
            suppressCellFocus
            enableBrowserTooltips={false}
            overlayNoRowsTemplate="Nothing submitted yet."
          />
        </div>
      )}

      {showRecorder && <VoiceNoteModal onClose={() => setShowRecorder(false)} onSave={handleSave} />}
    </div>
  );
}

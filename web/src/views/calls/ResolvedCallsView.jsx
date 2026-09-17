import { useCallback, useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { t } from "../../theme.js";
import { fmtDate } from "../../lib/dates.js";
import { fetchResolvedCalls } from "../../lib/api.js";
import { BackLink } from "../../components/BackLink.jsx";
import { Card } from "../../components/Card.jsx";

ModuleRegistry.registerModules([AllCommunityModule]);

const GRID_CSS = `
.sbm-resolved-calls-grid.ag-theme-quartz {
  --ag-font-family: var(--font-body), system-ui, sans-serif;
  --ag-font-size: 13px;
  --ag-background-color: var(--color-surface);
  --ag-header-background-color: #DCE6FF;
  --ag-odd-row-background-color: var(--color-surface);
  --ag-even-row-background-color: color-mix(in srgb, #DCE6FF 35%, white);
  --ag-border-color: var(--color-line);
  --ag-row-border-color: var(--color-line-soft);
  --ag-header-foreground-color: var(--color-ink);
  --ag-foreground-color: var(--color-ink);
  --ag-header-height: 42px;
  --ag-row-height: 48px;
  width: 100%;
  height: 100%;
  min-height: 320px;
}
.sbm-resolved-calls-grid .ag-header-cell-label {
  font-family: var(--font-label), system-ui, sans-serif;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px;
}
`;

function fmtCellDate(value) {
  if (!value) return "—";
  try {
    return fmtDate(value);
  } catch {
    return String(value).slice(0, 16);
  }
}

/**
 * Admin list of calls resolved from Calls Needing Action — AG Grid rows,
 * newest resolve first. Row click opens call detail via onOpenCall.
 */
export function ResolvedCallsView({ onBack, onOpenCall, innerScrolls = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchResolvedCalls()
      .then((items) => {
        if (!cancelled) setRows(items);
      })
      .catch((err) => {
        console.error("[sbm] failed to load resolved calls", err);
        if (!cancelled) setError("Could not load resolved calls.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const columnDefs = useMemo(
    () => [
      {
        field: "client_name",
        headerName: "Caller",
        flex: 1.2,
        minWidth: 140,
      },
      {
        field: "recording_date",
        headerName: "Call date",
        width: 130,
        valueFormatter: (p) => fmtCellDate(p.data?.recording_date || p.data?.recorded_at),
      },
      {
        field: "resolved_at",
        headerName: "Resolved",
        width: 150,
        valueFormatter: (p) => fmtCellDate(p.value),
      },
      {
        field: "resolved_by_name",
        headerName: "Resolved by",
        width: 140,
        valueFormatter: (p) => p.value || "—",
      },
      {
        field: "todo_count",
        headerName: "Todos",
        width: 90,
        type: "numericColumn",
      },
      {
        field: "summary",
        headerName: "Summary",
        flex: 2,
        minWidth: 180,
        valueFormatter: (p) => {
          const s = (p.value || "").trim();
          if (!s) return "—";
          return s.length > 120 ? `${s.slice(0, 117)}…` : s;
        },
      },
    ],
    [],
  );

  const onRowClicked = useCallback(
    (e) => {
      if (e.data?.id) onOpenCall?.(e.data.id);
    },
    [onOpenCall],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: innerScrolls ? "100%" : undefined,
        minHeight: innerScrolls ? 0 : undefined,
      }}
    >
      <style>{GRID_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <BackLink onClick={onBack}>Back</BackLink>
        <h1 style={{ margin: 0, fontFamily: t.display, fontSize: 22, fontWeight: 500 }}>Resolved Calls</h1>
        <span style={{ fontSize: 13, color: t.edge2 }}>{loading ? "Loading…" : `${rows.length} call${rows.length === 1 ? "" : "s"}`}</span>
      </div>

      {error ? (
        <Card>
          <p style={{ margin: 0, color: t.signal, fontSize: 14 }}>{error}</p>
        </Card>
      ) : (
        <div
          className="sbm-resolved-calls-grid ag-theme-quartz"
          style={{
            flex: innerScrolls ? "1 1 auto" : undefined,
            minHeight: innerScrolls ? 0 : 420,
          }}
        >
          <AgGridReact
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, resizable: true, filter: true }}
            animateRows={false}
            suppressCellFocus
            onRowClicked={onRowClicked}
            getRowId={(p) => p.data.id}
            overlayNoRowsTemplate={loading ? "Loading…" : "No resolved calls yet"}
          />
        </div>
      )}
    </div>
  );
}

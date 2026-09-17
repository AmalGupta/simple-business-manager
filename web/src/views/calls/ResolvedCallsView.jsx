import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "../../theme.js";
import { fmtDate } from "../../lib/dates.js";
import { fetchResolvedCalls } from "../../lib/api.js";
import { BackLink } from "../../components/BackLink.jsx";
import { Card } from "../../components/Card.jsx";
import { AgGridPage, AgGridShell } from "../../components/ag-grid/AgGridShell.jsx";

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
 *
 * Height / scroll follows Site customization (inner_scrolls) via AgGridShell —
 * do not add local height:100% CSS here.
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
    <AgGridPage innerScrolls={innerScrolls}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <BackLink onClick={onBack}>Back</BackLink>
        <h1 style={{ margin: 0, fontFamily: t.display, fontSize: 22, fontWeight: 500 }}>Resolved Calls</h1>
        <span style={{ fontSize: 13, color: t.edge2 }}>
          {loading ? "Loading…" : `${rows.length} call${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {error ? (
        <Card>
          <p style={{ margin: 0, color: t.signal, fontSize: 14 }}>{error}</p>
        </Card>
      ) : (
        <AgGridShell
          innerScrolls={innerScrolls}
          clickableRows
          className="sbm-resolved-calls-grid"
          rowData={rows}
          columnDefs={columnDefs}
          onRowClicked={onRowClicked}
          getRowId={(p) => p.data.id}
          overlayNoRowsTemplate={loading ? "Loading…" : "No resolved calls yet"}
        />
      )}
    </AgGridPage>
  );
}

import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { Card } from "../../components/Card.jsx";
import {
  SITES_GRID_CSS,
  DateWindowFilter,
  FilterCount,
  SelectFilter,
  TextFilter,
  daysAgo,
  windowFor,
} from "./sitesGridChrome.jsx";

ModuleRegistry.registerModules([AllCommunityModule]);

/* ------------------------------------------------------------------
   The unconfirmed-sites review table. Same look and filter vocabulary
   as the confirmed-sites directory (sitesGridChrome.jsx), but the
   Valid / Not valid decision is a column rather than the whole point of
   a card row.

   This screen carries the volume — the pipeline discovers far more site
   names than get confirmed — so sorting and filtering matter more here
   than on the directory. The decision filter is the load-bearing one:
   "Undecided" turns a long backlog into just the rows still needing a
   judgement.

   Rows are deliberately not clickable. There is nowhere to navigate to
   for a site that may not be a real site, and a stray row click that
   silently marked something Valid would be worse than no affordance.
   ------------------------------------------------------------------ */

/* Filters on the PENDING decision, not the saved one, so a row you just
   marked leaves the "Undecided" view immediately — the list shortens as
   you work rather than only after saving. */
const DECISION_FILTERS = [
  { id: "any", label: "Any", test: () => true },
  { id: "undecided", label: "Undecided", test: (d) => d !== "Y" && d !== "N" },
  { id: "Y", label: "Valid", test: (d) => d === "Y" },
  { id: "N", label: "Not valid", test: (d) => d === "N" },
];

function callerLabel(site) {
  if (!site.discovered_from_call_id) return "No originating call";
  return site.discovered_from_caller_name || "Unknown caller";
}

function choiceButtonStyle(active, kind) {
  return {
    flex: 1,
    minWidth: 0,
    padding: "6px 0",
    border: `1px solid ${active ? (kind === "Y" ? t.accent : t.putty) : t.frost}`,
    borderRadius: t.radiusButton,
    background: active ? (kind === "Y" ? t.accent : t.puttyBg) : t.white,
    color: active ? (kind === "Y" ? t.white : t.putty) : t.edge2,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function FilterBar({ filters, setFilters, shown, total }) {
  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <div className="sbm-sites-filters">
      <TextFilter label="Site" value={filters.name} onChange={(v) => set("name", v)} placeholder="Search name…" />
      <TextFilter
        label="Discovered by"
        value={filters.caller}
        onChange={(v) => set("caller", v)}
        placeholder="Search caller…"
      />
      <DateWindowFilter label="Call date" value={filters.callDate} onChange={(v) => set("callDate", v)} />
      <SelectFilter
        label="Decision"
        value={filters.decision}
        onChange={(v) => set("decision", v)}
        options={DECISION_FILTERS}
      />
      <FilterCount shown={shown} total={total} />
    </div>
  );
}

const EMPTY_FILTERS = { name: "", caller: "", callDate: "any", decision: "any" };

/**
 * `pending` maps site id -> "Y" | "N" | null, owned by SitesReviewView so
 * the save stays batched. `onChoose(id, value)` toggles one row.
 */
export function SitesReviewGrid({ sites, pending, onChoose }) {
  const gridRef = useRef(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* The pending decision is folded into row data rather than read from
     grid context, so changing it produces new row objects that AG Grid
     diffs against getRowId and refreshes on its own — no manual
     refreshCells call, and the decision column stays sortable. */
  const rows = useMemo(
    () => (sites ?? []).map((s) => ({ ...s, decision: pending[s.id] ?? null })),
    [sites, pending]
  );

  const filtered = useMemo(() => {
    const name = filters.name.trim().toLowerCase();
    const caller = filters.caller.trim().toLowerCase();
    const callDateWindow = windowFor(filters.callDate);
    const decisionFilter = DECISION_FILTERS.find((d) => d.id === filters.decision) ?? DECISION_FILTERS[0];

    return rows.filter((s) => {
      if (name && !s.name.toLowerCase().includes(name)) return false;
      if (caller && !callerLabel(s).toLowerCase().includes(caller)) return false;
      if (!callDateWindow.test(daysAgo(s.discovered_from_call_date))) return false;
      if (!decisionFilter.test(s.decision)) return false;
      return true;
    });
  }, [rows, filters]);

  const columnDefs = useMemo(() => {
    const decisionCol = {
      headerName: "Valid?",
      colId: "decision",
      width: narrow ? 150 : 176,
      suppressSizeToFit: true,
      sortable: true,
      cellClass: "sbm-scol-decision",
      /* "" for undecided sorts before "N" and "Y", so one click on this
         header brings everything still needing a judgement to the top. */
      valueGetter: (p) => p.data?.decision ?? "",
      cellRenderer: (p) => {
        const id = p.data?.id;
        if (!id) return null;
        return (
          <span style={{ display: "flex", gap: 6, width: "100%" }}>
            <button
              type="button"
              aria-pressed={p.data.decision === "Y"}
              aria-label={`Mark ${p.data.name} valid`}
              onClick={() => onChoose(id, "Y")}
              style={choiceButtonStyle(p.data.decision === "Y", "Y")}
            >
              Valid
            </button>
            <button
              type="button"
              aria-pressed={p.data.decision === "N"}
              aria-label={`Mark ${p.data.name} not valid`}
              onClick={() => onChoose(id, "N")}
              style={choiceButtonStyle(p.data.decision === "N", "N")}
            >
              Not valid
            </button>
          </span>
        );
      },
    };

    /* On a phone there isn't room for four columns, so the evidence
       collapses into the site cell as a second line — which is what the
       old card list showed — leaving name and decision side by side. */
    if (narrow) {
      return [
        {
          headerName: "Site",
          colId: "name",
          flex: 1,
          minWidth: 120,
          cellClass: "sbm-scol-name",
          autoHeight: true,
          wrapText: true,
          valueGetter: (p) => p.data?.name ?? "",
          cellRenderer: (p) => (
            <span style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
              <span>{p.data?.name}</span>
              <span style={{ fontSize: 11, fontWeight: 400, color: t.edge2 }}>
                {callerLabel(p.data ?? {})}
                {p.data?.discovered_from_call_date ? ` · ${fmtShort(p.data.discovered_from_call_date)}` : ""}
              </span>
            </span>
          ),
        },
        decisionCol,
      ];
    }

    return [
      {
        headerName: "Site",
        colId: "name",
        flex: 1.5,
        minWidth: 140,
        cellClass: "sbm-scol-name",
        valueGetter: (p) => p.data?.name ?? "",
      },
      {
        headerName: "Discovered by",
        colId: "caller",
        flex: 1.4,
        minWidth: 150,
        cellClass: (p) => (p.data?.discovered_from_call_id ? "sbm-scol-caller" : "sbm-scol-caller sbm-no-origin"),
        valueGetter: (p) => callerLabel(p.data ?? {}),
      },
      {
        headerName: "Call date",
        colId: "callDate",
        width: 118,
        suppressSizeToFit: true,
        cellClass: "sbm-scol-calldate",
        valueGetter: (p) => p.data?.discovered_from_call_date ?? "",
        valueFormatter: (p) => (p.value ? fmtShort(p.value) : "—"),
        comparator: (a, b) => (a || "").localeCompare(b || ""),
      },
      decisionCol,
    ];
  }, [narrow, onChoose]);

  const defaultColDef = useMemo(
    () => ({
      resizable: !narrow,
      sortable: true,
      suppressMovable: true,
      tooltipValueGetter: () => null,
    }),
    [narrow]
  );

  const getRowId = useCallback((params) => params.data.id, []);

  const onGridReady = useCallback((params) => {
    params.api.sizeColumnsToFit();
  }, []);

  const onGridSizeChanged = useCallback((params) => {
    params.api.sizeColumnsToFit();
  }, []);

  useEffect(() => {
    gridRef.current?.api?.sizeColumnsToFit();
    gridRef.current?.api?.resetRowHeights();
  }, [narrow, filtered]);

  return (
    <>
      <style>{SITES_GRID_CSS}</style>
      <FilterBar filters={filters} setFilters={setFilters} shown={filtered.length} total={rows.length} />
      <Card
        style={{
          padding: 0,
          overflow: "visible",
          marginBottom: 12,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="sbm-sites-grid-wrap">
          <div className="sbm-sites-grid ag-theme-quartz">
            <AgGridReact
              ref={gridRef}
              rowData={filtered}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              getRowId={getRowId}
              rowHeight={narrow ? 64 : 56}
              suppressHorizontalScroll
              domLayout="autoHeight"
              animateRows={false}
              suppressCellFocus
              enableBrowserTooltips={false}
              overlayNoRowsTemplate="No sites match these filters."
            />
          </div>
        </div>
      </Card>
    </>
  );
}

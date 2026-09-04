import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { t } from "../../theme.js";
import { fmtDate } from "../../lib/dates.js";
import { Card } from "../../components/Card.jsx";
import { TEXT_INPUT_STYLE } from "../../styles.js";

ModuleRegistry.registerModules([AllCommunityModule]);

const PAGE_SIZES = [10, 20, 50, 100];
const DEFAULT_PAGE_SIZE = 20;

/* Header: light blue — softer than AppHeader accent (#2E5AF7). */
const GRID_CSS = `
.sbm-calls-grid-wrap {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.sbm-calls-grid.ag-theme-quartz {
  --ag-font-family: var(--font-body), system-ui, sans-serif;
  --ag-font-size: 13px;
  --ag-background-color: var(--color-surface);
  --ag-header-background-color: #DCE6FF;
  --ag-odd-row-background-color: var(--color-surface);
  --ag-even-row-background-color: color-mix(in srgb, #DCE6FF 35%, white);
  --ag-row-hover-color: transparent;
  --ag-selected-row-background-color: color-mix(in srgb, var(--color-accent) 14%, white);
  --ag-border-color: var(--color-line);
  --ag-row-border-color: var(--color-line-soft);
  --ag-header-foreground-color: var(--color-ink);
  --ag-foreground-color: var(--color-ink);
  --ag-secondary-foreground-color: var(--color-slate);
  --ag-border-radius: 0;
  --ag-wrapper-border-radius: 0;
  --ag-cell-horizontal-padding: 14px;
  --ag-header-height: 46px;
  --ag-row-height: 64px;
  --ag-icon-size: 14px;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}
.sbm-calls-grid .ag-root-wrapper {
  border: none;
  height: 100%;
  background: var(--color-surface);
}
.sbm-calls-grid .ag-header {
  border-bottom: 1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-line));
  background: #DCE6FF !important;
}
.sbm-calls-grid .ag-header-cell {
  background: #DCE6FF !important;
}
.sbm-calls-grid .ag-header-cell-label {
  font-family: var(--font-label), system-ui, sans-serif;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px;
  color: var(--color-ink);
}
.sbm-calls-grid .ag-grid-viewport {
  overflow-y: auto !important;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-line)) transparent;
}
.sbm-calls-grid .ag-grid-viewport::-webkit-scrollbar {
  width: 8px;
}
.sbm-calls-grid .ag-grid-viewport::-webkit-scrollbar-track {
  background: color-mix(in srgb, #DCE6FF 40%, white);
}
.sbm-calls-grid .ag-grid-viewport::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-accent) 45%, var(--color-line));
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: content-box;
}
@media (max-width: 640px) {
  .sbm-calls-grid-wrap {
    overscroll-behavior: none;
    touch-action: manipulation;
  }
  .sbm-calls-grid.ag-theme-quartz {
    --ag-row-height: 74px;
    overscroll-behavior: none;
  }
  .sbm-calls-grid .ag-grid-viewport {
    overflow-y: scroll !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    touch-action: pan-y;
    scrollbar-gutter: stable;
    scrollbar-width: thin !important;
    -ms-overflow-style: auto !important;
  }
  .sbm-calls-grid .ag-grid-viewport::-webkit-scrollbar {
    display: block !important;
    -webkit-appearance: none;
  }
  /* Fake scrollbar track — don't let it become a second touch scroller. */
  .sbm-calls-grid .ag-body-vertical-scroll-viewport {
    overscroll-behavior: none;
    pointer-events: none;
  }
}
.sbm-calls-grid .ag-row {
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 160ms ease, background-color 120ms ease;
  transform-origin: center center;
  will-change: transform;
}
@media (hover: hover) {
  .sbm-calls-grid .ag-row:hover {
    transform: scale(1.012);
    z-index: 3;
    background-color: color-mix(in srgb, var(--color-accent) 8%, white) !important;
    box-shadow: 0 2px 10px rgba(46, 90, 247, 0.12);
  }
}
.sbm-calls-grid .ag-row-selected::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--color-accent);
  z-index: 1;
}
.sbm-calls-grid .ag-cell {
  display: flex;
  align-items: center;
  line-height: 1.45;
  border-right: none !important;
}
.sbm-calls-grid .ag-cell-wrapper,
.sbm-calls-grid .ag-cell-value {
  width: 100%;
}
.sbm-calls-grid .sbm-col-sl {
  font-variant-numeric: tabular-nums;
  color: var(--color-slate);
  font-size: 12px;
  font-weight: 600;
}
.sbm-calls-grid .sbm-col-date {
  font-variant-numeric: tabular-nums;
  color: var(--color-slate);
  white-space: nowrap;
  font-weight: 500;
}
.sbm-calls-grid .sbm-col-caller {
  font-weight: 700;
  color: var(--color-ink-emphasis);
}
.sbm-calls-grid .sbm-col-type {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-slate);
  white-space: nowrap;
}
.sbm-calls-grid .sbm-col-summary .ag-cell-value,
.sbm-calls-grid .sbm-col-summary .ag-cell-wrapper {
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important;
  line-height: 1.45;
  color: var(--color-ink);
}
.sbm-calls-grid .sbm-col-summary {
  align-items: flex-start;
  padding-top: 12px !important;
  padding-bottom: 12px !important;
}

/* Kill transparent / distracting tooltips on this grid. */
.ag-tooltip,
.ag-popup .ag-tooltip,
div.ag-tooltip {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

.sbm-calls-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--color-line);
  background: #EEF3FF;
  flex-shrink: 0;
}
.sbm-calls-pager-meta {
  font-size: 12px;
  color: var(--color-slate);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.sbm-calls-pager-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.sbm-calls-pager label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-slate);
  font-weight: 600;
}
.sbm-calls-pager-btns {
  display: inline-flex;
  gap: 4px;
}
.sbm-calls-pager-btns button {
  min-width: 32px;
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-button);
  background: var(--color-surface);
  color: var(--color-ink);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.sbm-calls-pager-btns button:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.sbm-calls-pager-btns button:disabled {
  opacity: 0.4;
  cursor: default;
}
.sbm-calls-pager-btns button[data-active="true"] {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}
@media (max-width: 640px) {
  .sbm-calls-pager {
    flex-direction: column;
    align-items: stretch;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sbm-calls-grid .ag-row,
  .sbm-calls-grid .ag-row:hover {
    transition: none;
    transform: none;
  }
}
`;

function pageNumbers(current, total) {
  if (total <= 1) return [0];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set([0, total - 1, current, current - 1, current + 1]);
  if (current <= 2) {
    pages.add(2);
    pages.add(3);
  }
  if (current >= total - 3) {
    pages.add(total - 3);
    pages.add(total - 4);
  }
  return [...pages].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
}

/**
 * Viewport-filling grid: internal body scroll only, no cell tooltips,
 * mild hover zoom, light-blue header (vs home accent panel).
 */
export function CallsGrid({ rows, selectedId, onSelect, serverPagination = null }) {
  const gridRef = useRef(null);
  const serverMode = Boolean(serverPagination);
  const [pageSize, setPageSize] = useState(serverMode ? rows?.length || DEFAULT_PAGE_SIZE : DEFAULT_PAGE_SIZE);
  const [pageState, setPageState] = useState({ page: 0, pageCount: 1, rowCount: 0 });
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

  const syncPageState = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    setPageState({
      page: api.paginationGetCurrentPage(),
      pageCount: Math.max(1, api.paginationGetTotalPages()),
      rowCount: api.getDisplayedRowCount(),
    });
  }, []);

  const columnDefs = useMemo(() => {
    const cols = [
      {
        headerName: "Sl.",
        colId: "sl",
        width: narrow ? 52 : 68,
        maxWidth: narrow ? 56 : 80,
        sortable: false,
        filter: false,
        suppressSizeToFit: true,
        cellClass: "sbm-col-sl",
        valueGetter: (p) => {
          if (p.node?.rowIndex == null || !p.api) return "";
          const base = serverPagination?.offset ?? 0;
          if (serverMode) return base + p.node.rowIndex + 1;
          return p.api.paginationGetCurrentPage() * p.api.paginationGetPageSize() + p.node.rowIndex + 1;
        },
      },
      {
        headerName: "Date",
        colId: "date",
        width: narrow ? 96 : 128,
        maxWidth: narrow ? 110 : 150,
        suppressSizeToFit: true,
        cellClass: "sbm-col-date",
        valueGetter: (p) => p.data?.meta?.callDateIso,
        valueFormatter: (p) => fmtDate(p.value),
        comparator: (a, b) => (a || "").localeCompare(b || ""),
        sort: "desc",
      },
      {
        headerName: "Caller",
        colId: "caller",
        flex: narrow ? 1.1 : 1,
        minWidth: narrow ? 100 : 140,
        cellClass: "sbm-col-caller",
        valueGetter: (p) => p.data?.meta?.caller ?? "Unknown caller",
      },
      {
        headerName: "Type",
        colId: "type",
        width: narrow ? 104 : 118,
        maxWidth: narrow ? 118 : 140,
        suppressSizeToFit: true,
        cellClass: "sbm-col-type",
        valueGetter: (p) => p.data?.meta?.entryTypeLabel ?? "Voice Call",
        comparator: (a, b) => (a || "").localeCompare(b || ""),
      },
    ];
    if (!narrow) {
      cols.push({
        headerName: "Summary",
        field: "summary",
        colId: "summary",
        flex: 2.4,
        minWidth: 220,
        cellClass: "sbm-col-summary",
        wrapText: true,
        autoHeight: true,
        valueFormatter: (p) => p.value || "—",
      });
    }
    return cols;
  }, [narrow, serverMode, serverPagination?.offset]);

  const defaultColDef = useMemo(
    () => ({
      resizable: !narrow,
      sortable: true,
      suppressMovable: true,
      tooltipValueGetter: () => null,
    }),
    [narrow]
  );

  const onRowClicked = useCallback(
    (event) => {
      if (event.data?.id) onSelect(event.data.id);
    },
    [onSelect]
  );

  const getRowId = useCallback((params) => params.data.id, []);

  const onGridReady = useCallback(
    (params) => {
      params.api.sizeColumnsToFit();
      syncPageState();
      if (!selectedId) return;
      params.api.forEachNode((node) => {
        if (node.data?.id === selectedId) node.setSelected(true);
      });
    },
    [selectedId, syncPageState]
  );

  const onGridSizeChanged = useCallback((params) => {
    params.api.sizeColumnsToFit();
  }, []);

  const onPaginationChanged = useCallback(() => {
    syncPageState();
    gridRef.current?.api?.refreshCells({ columns: ["sl"], force: true });
  }, [syncPageState]);

  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    if (serverMode) {
      api.setGridOption("pagination", false);
    } else {
      api.setGridOption("pagination", true);
      api.setGridOption("paginationPageSize", pageSize);
      api.paginationGoToFirstPage();
    }
    syncPageState();
    api.refreshCells({ columns: ["sl"], force: true });
  }, [pageSize, syncPageState, serverMode]);

  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    if (!serverMode) api.paginationGoToFirstPage();
    syncPageState();
    api.sizeColumnsToFit();
    api.resetRowHeights();
    if (rows?.length) api.ensureIndexVisible(0, "top");
  }, [rows, syncPageState, serverMode]);

  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.setGridOption("rowHeight", narrow ? 74 : 64);
    api.resetRowHeights();
    api.sizeColumnsToFit();
  }, [narrow]);

  const goTo = (page) => {
    gridRef.current?.api?.paginationGoToPage(page);
  };

  const { page, pageCount, rowCount } = pageState;
  const serverTotal = serverPagination?.total ?? 0;
  const serverOffset = serverPagination?.offset ?? 0;
  const from =
    serverMode && rowCount > 0 ? serverOffset + 1 : rowCount === 0 ? 0 : page * pageSize + 1;
  const to = serverMode
    ? Math.min(serverTotal, serverOffset + rowCount)
    : Math.min(rowCount, (page + 1) * pageSize);
  const displayTotal = serverMode ? serverTotal : rowCount;
  const pages = pageNumbers(page, pageCount);

  return (
    <Card
      style={{
        padding: 0,
        overflow: "hidden",
        marginBottom: 0,
        flex: "1 1 auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{GRID_CSS}</style>
      <div className="sbm-calls-grid-wrap">
        <div className="sbm-calls-grid ag-theme-quartz">
          <AgGridReact
            ref={gridRef}
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
            onRowClicked={onRowClicked}
            onGridReady={onGridReady}
            onGridSizeChanged={onGridSizeChanged}
            onPaginationChanged={serverMode ? undefined : onPaginationChanged}
            pagination={!serverMode}
            paginationPageSize={pageSize}
            suppressPaginationPanel
            rowHeight={narrow ? 74 : 64}
            alwaysShowVerticalScroll={narrow}
            animateRows={false}
            suppressCellFocus
            enableBrowserTooltips={false}
            tooltipShowDelay={999999}
            overlayNoRowsTemplate="No calls match these filters."
          />
        </div>

        <div className="sbm-calls-pager">
          <div className="sbm-calls-pager-meta">
            {displayTotal === 0 ? "0 calls" : `Showing ${from}–${to} of ${displayTotal}`}
          </div>
          <div className="sbm-calls-pager-controls">
            {!serverMode ? (
              <label>
                Rows
                <select
                  aria-label="Calls per page"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={{ ...TEXT_INPUT_STYLE, minHeight: 32, width: "auto" }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="sbm-calls-pager-btns" role="navigation" aria-label="Pagination">
              {serverMode ? (
                <>
                  <button
                    type="button"
                    disabled={!serverPagination?.hasPrev}
                    onClick={() => serverPagination?.onPrev?.()}
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    disabled={!serverPagination?.hasNext}
                    onClick={() => serverPagination?.onNext?.()}
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </>
              ) : (
                <>
                  <button type="button" disabled={page <= 0} onClick={() => goTo(page - 1)} aria-label="Previous page">
                    ‹
                  </button>
                  {pages.map((p, i) => {
                    const prev = pages[i - 1];
                    const gap = prev != null && p - prev > 1;
                    return (
                      <span key={p} style={{ display: "inline-flex", gap: 4 }}>
                        {gap ? (
                          <button type="button" disabled style={{ border: "none", background: "transparent" }}>
                            …
                          </button>
                        ) : null}
                        <button
                          type="button"
                          data-active={p === page ? "true" : "false"}
                          onClick={() => goTo(p)}
                          aria-label={`Page ${p + 1}`}
                          aria-current={p === page ? "page" : undefined}
                        >
                          {p + 1}
                        </button>
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    disabled={page >= pageCount - 1}
                    onClick={() => goTo(page + 1)}
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

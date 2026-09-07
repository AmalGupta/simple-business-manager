import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { t } from "../../theme.js";
import { fmtShort, fmtAgo, daysUntil } from "../../lib/dates.js";
import { Card } from "../../components/Card.jsx";
import { TEXT_INPUT_STYLE } from "../../styles.js";

ModuleRegistry.registerModules([AllCommunityModule]);

/* ------------------------------------------------------------------
   Sites table. Replaces the card list, which had no sort, no search
   and no way to see a site's contacts or how long it had been quiet.

   Conventions copied from CallsGrid: AllCommunityModule registered at
   module scope, the legacy quartz CSS themes rather than the v33+
   Theming API, and one scoped <style> literal mapping AG Grid's --ag-*
   variables onto the app's --color-* tokens. Selectors are
   .sbm-sites-grid so nothing collides with .sbm-calls-grid.
   ------------------------------------------------------------------ */

const GRID_CSS = `
.sbm-sites-grid.ag-theme-quartz {
  --ag-font-family: var(--font-body), system-ui, sans-serif;
  --ag-font-size: 13px;
  --ag-background-color: var(--color-surface);
  /* Same light blue as the calls grid — softer than the AppHeader accent. */
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
  --ag-row-height: 56px;
  --ag-icon-size: 14px;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}
.sbm-sites-grid .ag-header-cell-text {
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sbm-sites-grid-wrap {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
/* inner_scrolls off (default): no inner scrollbar, the page scrolls. */
[data-inner-scrolls="0"] .sbm-sites-grid .ag-body-viewport {
  overflow-y: visible !important;
}
[data-inner-scrolls="0"] .sbm-sites-grid-wrap {
  overflow: visible;
  flex: 0 0 auto;
}
[data-inner-scrolls="0"] .sbm-sites-grid.ag-theme-quartz {
  height: auto !important;
  min-height: 160px;
}
/* horizontal_scrolls off (default): wrap instead of scrolling sideways. */
[data-horizontal-scrolls="0"] .sbm-sites-grid .ag-body-viewport {
  overflow-x: hidden !important;
}
[data-horizontal-scrolls="0"] .sbm-sites-grid .sbm-scol-contacts {
  white-space: normal !important;
  overflow-wrap: anywhere;
}
.sbm-sites-grid .ag-row {
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 160ms ease, background-color 120ms ease;
  transform-origin: center center;
}
@media (hover: hover) {
  .sbm-sites-grid .ag-row:hover {
    transform: scale(1.012);
    z-index: 3;
    background-color: color-mix(in srgb, var(--color-accent) 8%, white) !important;
    box-shadow: 0 2px 10px rgba(46, 90, 247, 0.12);
  }
}
.sbm-sites-grid .sbm-scol-name {
  color: var(--color-ink-emphasis);
  font-weight: 700;
}
.sbm-sites-grid .sbm-scol-open,
.sbm-sites-grid .sbm-scol-activity,
.sbm-sites-grid .sbm-scol-discovered,
.sbm-sites-grid .sbm-scol-target {
  font-variant-numeric: tabular-nums;
  color: var(--color-slate);
}
.sbm-sites-grid .sbm-scol-contacts {
  color: var(--color-slate);
}
/* The one place red is allowed here: a target closure date already past.
   Never decorative — see CLAUDE.md. */
.sbm-sites-grid .sbm-scol-target.sbm-missed {
  color: var(--color-danger);
  font-weight: 700;
}
.sbm-sites-grid .ag-cell {
  display: flex;
  align-items: center;
}
/* Kill transparent / distracting tooltips, same as the calls grid. */
.sbm-sites-grid .ag-tooltip,
.sbm-sites-grid .ag-popup .ag-tooltip {
  display: none !important;
}
.sbm-sites-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.sbm-sites-filters label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-slate);
}
`;

/* Shared by both date filters. `max` is inclusive days-ago; null means
   "no upper bound", which is how "Over 30 days" and "Never" are
   expressed without a second field. */
const DATE_WINDOWS = [
  { id: "any", label: "Any time", test: () => true },
  { id: "7", label: "Last 7 days", test: (days) => days !== null && days <= 7 },
  { id: "30", label: "Last 30 days", test: (days) => days !== null && days <= 30 },
  { id: "over30", label: "Over 30 days", test: (days) => days !== null && days > 30 },
  { id: "none", label: "Nothing recorded", test: (days) => days === null },
];

/** Whole days between an ISO date/timestamp and today, or null if absent. */
function daysAgo(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return -daysUntil(String(iso).slice(0, 10));
}

function contactsLabel(site) {
  const list = site.contacts ?? [];
  if (list.length === 0) return "";
  return list.map((c) => c.name).join(", ");
}

function discoveredLabel(site) {
  if (!site.discovered_from_caller_name && !site.discovered_from_call_date) return "";
  const caller = site.discovered_from_caller_name || "Unknown caller";
  const date = fmtShort(site.discovered_from_call_date);
  return date ? `${caller} · ${date}` : caller;
}

function FilterBar({ filters, setFilters, shown, total }) {
  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <div className="sbm-sites-filters">
      <label>
        Site
        <input
          value={filters.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Search name…"
          style={{ ...TEXT_INPUT_STYLE, minWidth: 150 }}
        />
      </label>
      <label>
        Contact
        <input
          value={filters.contact}
          onChange={(e) => set("contact", e.target.value)}
          placeholder="Search contact…"
          style={{ ...TEXT_INPUT_STYLE, minWidth: 150 }}
        />
      </label>
      <label>
        Last activity
        <select value={filters.activity} onChange={(e) => set("activity", e.target.value)} style={TEXT_INPUT_STYLE}>
          {DATE_WINDOWS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Discovered
        <select value={filters.discovered} onChange={(e) => set("discovered", e.target.value)} style={TEXT_INPUT_STYLE}>
          {DATE_WINDOWS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
      <span style={{ alignSelf: "flex-end", fontSize: 12, color: t.edge2, paddingBottom: 12 }}>
        {shown === total ? `${total} site${total === 1 ? "" : "s"}` : `${shown} of ${total}`}
      </span>
    </div>
  );
}

const EMPTY_FILTERS = { name: "", contact: "", activity: "any", discovered: "any" };

export function SitesGrid({ rows, onOpenSite, innerScrolls = false, horizontalScrolls = false }) {
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

  /* Filtered client-side rather than through AG Grid's own filter model or
     a server round trip: this endpoint already returns every confirmed
     site the viewer can see in one payload, so there's nothing to fetch,
     and four plain controls are easier to reason about than four column
     filter instances. */
  const filtered = useMemo(() => {
    if (!rows) return null;
    const name = filters.name.trim().toLowerCase();
    const contact = filters.contact.trim().toLowerCase();
    const activityWindow = DATE_WINDOWS.find((w) => w.id === filters.activity) ?? DATE_WINDOWS[0];
    const discoveredWindow = DATE_WINDOWS.find((w) => w.id === filters.discovered) ?? DATE_WINDOWS[0];

    return rows.filter((s) => {
      if (name && !s.name.toLowerCase().includes(name)) return false;
      if (contact) {
        const hit = (s.contacts ?? []).some(
          (c) => c.name.toLowerCase().includes(contact) || (c.phone ?? "").includes(contact)
        );
        if (!hit) return false;
      }
      if (!activityWindow.test(daysAgo(s.last_activity_at))) return false;
      if (!discoveredWindow.test(daysAgo(s.discovered_from_call_date))) return false;
      return true;
    });
  }, [rows, filters]);

  const columnDefs = useMemo(() => {
    const cols = [
      {
        headerName: "Site",
        colId: "name",
        flex: narrow ? 1.4 : 1.5,
        minWidth: 130,
        cellClass: "sbm-scol-name",
        valueGetter: (p) => p.data?.name ?? "",
        /* The only cell renderer in the app. The unread badge can't be a
           valueFormatter because it's a styled pill, and it's documented
           as never-decorative — it means "new since you last posted". */
        cellRenderer: (p) => {
          const count = p.data?.unread_count ?? 0;
          if (count <= 0) return p.value;
          return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                className="sbm-unread-glow"
                aria-label={`${count} new since you last posted`}
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
                {count}
              </span>
              {p.value}
            </span>
          );
        },
      },
      {
        headerName: "Last activity",
        colId: "activity",
        width: narrow ? 110 : 130,
        suppressSizeToFit: true,
        cellClass: "sbm-scol-activity",
        valueGetter: (p) => p.data?.last_activity_at ?? "",
        valueFormatter: (p) => (p.value ? fmtAgo(p.value) : "—"),
        comparator: (a, b) => (a || "").localeCompare(b || ""),
        sort: "desc",
      },
      {
        headerName: "Open",
        colId: "open",
        width: 84,
        suppressSizeToFit: true,
        cellClass: "sbm-scol-open",
        valueGetter: (p) => p.data?.open_count ?? 0,
      },
    ];

    if (!narrow) {
      cols.splice(1, 0, {
        headerName: "Contacts",
        colId: "contacts",
        flex: 1.4,
        minWidth: 140,
        cellClass: "sbm-scol-contacts",
        valueGetter: (p) => contactsLabel(p.data ?? {}),
        valueFormatter: (p) => p.value || "—",
        wrapText: !horizontalScrolls,
        autoHeight: !horizontalScrolls,
      });
      cols.push(
        {
          headerName: "Discovered",
          colId: "discovered",
          flex: 1.2,
          minWidth: 140,
          cellClass: "sbm-scol-discovered",
          valueGetter: (p) => discoveredLabel(p.data ?? {}),
          valueFormatter: (p) => p.value || "—",
        },
        {
          headerName: "Target closure",
          colId: "target",
          width: 130,
          suppressSizeToFit: true,
          cellClass: (p) => {
            const iso = p.data?.target_closure_date;
            const missed = iso && daysUntil(iso) < 0;
            return missed ? "sbm-scol-target sbm-missed" : "sbm-scol-target";
          },
          valueGetter: (p) => p.data?.target_closure_date ?? "",
          valueFormatter: (p) => {
            if (!p.value) return "—";
            const overdue = daysUntil(p.value) < 0;
            return overdue ? `${fmtShort(p.value)} · missed ${Math.abs(daysUntil(p.value))}d` : fmtShort(p.value);
          },
          comparator: (a, b) => (a || "").localeCompare(b || ""),
        }
      );
    }
    return cols;
  }, [narrow, horizontalScrolls]);

  const defaultColDef = useMemo(
    () => ({
      resizable: !narrow,
      sortable: true,
      suppressMovable: true,
      tooltipValueGetter: () => null,
    }),
    [narrow]
  );

  /* onOpenSite takes the site NAME, not the id — the view state machine in
     Dashboard.jsx keys the site drilldown by name. getRowId still uses id,
     which is what AG Grid needs to be stable. */
  const onRowClicked = useCallback(
    (event) => {
      if (event.data?.name) onOpenSite(event.data.name);
    },
    [onOpenSite]
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
      <style>{GRID_CSS}</style>
      <FilterBar filters={filters} setFilters={setFilters} shown={filtered?.length ?? 0} total={rows?.length ?? 0} />
      <Card
        style={{
          padding: 0,
          overflow: innerScrolls ? "hidden" : "visible",
          marginBottom: 0,
          flex: innerScrolls ? "1 1 auto" : "0 0 auto",
          minHeight: 0,
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
              rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
              onRowClicked={onRowClicked}
              onGridReady={onGridReady}
              onGridSizeChanged={onGridSizeChanged}
              rowHeight={narrow ? 64 : 56}
              suppressHorizontalScroll={!horizontalScrolls}
              domLayout={innerScrolls ? "normal" : "autoHeight"}
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

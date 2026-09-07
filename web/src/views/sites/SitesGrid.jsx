import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { t } from "../../theme.js";
import { fmtShort, fmtAgo, daysUntil } from "../../lib/dates.js";
import { Card } from "../../components/Card.jsx";
import {
  SITES_GRID_CSS,
  DateWindowFilter,
  FilterCount,
  TextFilter,
  daysAgo,
  windowFor,
} from "./sitesGridChrome.jsx";

ModuleRegistry.registerModules([AllCommunityModule]);

/* ------------------------------------------------------------------
   Sites table — the confirmed-sites directory. Replaces the card list,
   which had no sort, no search and no way to see a site's contacts or
   how long it had been quiet.

   The look, the date-window vocabulary and the filter controls are
   shared with the review grid via sitesGridChrome.jsx.
   ------------------------------------------------------------------ */

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
      <TextFilter label="Site" value={filters.name} onChange={(v) => set("name", v)} placeholder="Search name…" />
      <TextFilter
        label="Contact"
        value={filters.contact}
        onChange={(v) => set("contact", v)}
        placeholder="Search contact…"
      />
      <DateWindowFilter label="Last activity" value={filters.activity} onChange={(v) => set("activity", v)} />
      <DateWindowFilter label="Discovered" value={filters.discovered} onChange={(v) => set("discovered", v)} />
      <FilterCount shown={shown} total={total} />
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
    const activityWindow = windowFor(filters.activity);
    const discoveredWindow = windowFor(filters.discovered);

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
        /* The unread badge can't be a valueFormatter because it's a styled
           pill, and it's documented as never-decorative — it means "new
           since you last posted". */
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
      <style>{SITES_GRID_CSS}</style>
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
          <div className="sbm-sites-grid ag-theme-quartz" data-clickable-rows="1">
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

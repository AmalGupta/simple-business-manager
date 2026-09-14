import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { t } from "../../theme.js";
import { BackLink } from "../../components/BackLink.jsx";
import { Card } from "../../components/Card.jsx";
import {
  fetchSiteContactProposals,
  postSiteContactMappings,
  refreshContactsDirectory,
} from "../../lib/api.js";
import "../callers/CallersDirectoryView.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const SOURCE_LABELS = {
  poc_name: "POC name",
  site_name_being_used: "Site display (| CL.)",
  poc_contact_number: "POC contact field",
  discovered_from_caller_name: "Call discovery (name)",
  discovered_from_caller_phone: "Call discovery (phone)",
};

export function MaintenanceSiteContactView({ onBack, innerScrolls }) {
  const gridRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [fetchedOnce, setFetchedOnce] = useState(false);

  const markMapped = useCallback((siteId, callerName) => {
    setRows((prev) =>
      prev.map((r) =>
        r.site_id === siteId
          ? {
              ...r,
              status: "already_linked",
              linked_caller_names: callerName ?? r.caller_name ?? r.linked_caller_names,
              caller_id: null,
            }
          : r
      )
    );
    gridRef.current?.api?.deselectAll();
  }, []);

  const refreshContactsCaches = useCallback(async () => {
    await Promise.all([
      refreshContactsDirectory({ bucket: "saved" }),
      refreshContactsDirectory({ bucket: "saved", linkedSitesOnly: true }),
      refreshContactsDirectory({ bucket: "unsaved" }),
    ]).catch(() => {});
  }, []);

  const runFetch = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchSiteContactProposals();
      setRows(data.proposals ?? []);
      setFetchedOnce(true);
      gridRef.current?.api?.deselectAll();
      setSelectedCount(0);
    } catch (err) {
      console.error("[sbm] site-contact proposals", err);
      setError("Could not load proposals — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const mapSelected = useCallback(async () => {
    const api = gridRef.current?.api;
    if (!api) return;
    const selected = api.getSelectedRows().filter((r) => r.status === "proposed" && r.caller_id);
    if (!selected.length) {
      setError("Select one or more sites, then Map these sites.");
      return;
    }
    setBulkBusy(true);
    setError("");
    try {
      await postSiteContactMappings(
        selected.map((r) => ({ site_id: r.site_id, caller_id: r.caller_id }))
      );
      for (const r of selected) markMapped(r.site_id, r.caller_name);
      await refreshContactsCaches();
    } catch (err) {
      console.error("[sbm] bulk map site-contact", err);
      setError("Bulk mapping failed — try again.");
    } finally {
      setBulkBusy(false);
    }
  }, [markMapped, refreshContactsCaches]);

  const onSelectionChanged = useCallback(() => {
    const api = gridRef.current?.api;
    setSelectedCount(api ? api.getSelectedRows().length : 0);
  }, []);

  const columnDefs = useMemo(
    () => [
      {
        field: "site_name",
        headerName: "Site",
        flex: 0.9,
        minWidth: 120,
        cellStyle: { fontWeight: 600 },
      },
      {
        field: "site_display_name",
        headerName: "Display name",
        flex: 1.4,
        minWidth: 200,
        valueFormatter: (p) => p.value?.trim() || p.data?.site_name || "—",
      },
      {
        field: "client_name",
        headerName: "Client",
        flex: 1,
        minWidth: 140,
        valueFormatter: (p) => p.value?.trim() || "—",
      },
      {
        field: "caller_name",
        headerName: "Contact",
        flex: 1.1,
        minWidth: 150,
        valueGetter: (p) => {
          const d = p.data;
          if (!d) return "";
          if (d.status === "already_linked") return d.linked_caller_names ?? "—";
          if (!d.caller_name) return "—";
          return d.caller_phone ? `${d.caller_name} · ${d.caller_phone}` : d.caller_name;
        },
      },
      {
        field: "client_source",
        headerName: "Match from",
        flex: 1,
        minWidth: 130,
        valueFormatter: (p) => SOURCE_LABELS[p.value] ?? p.value ?? "—",
      },
      {
        headerName: "",
        checkboxSelection: true,
        headerCheckboxSelection: true,
        headerCheckboxSelectionFilteredOnly: true,
        width: 48,
        maxWidth: 48,
        pinned: "right",
        suppressMenu: true,
        sortable: false,
        filter: false,
      },
    ],
    []
  );

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      suppressHeaderMenuButton: true,
    }),
    []
  );

  const proposedCount = rows.filter((r) => r.status === "proposed" && r.caller_id).length;

  const onGridReady = useCallback(() => {
    gridRef.current?.api?.sizeColumnsToFit?.();
  }, []);

  useEffect(() => {
    if (!rows.length) return;
    const id = requestAnimationFrame(() => {
      gridRef.current?.api?.sizeColumnsToFit?.();
    });
    return () => cancelAnimationFrame(id);
  }, [rows, innerScrolls]);

  const gridMinHeight = Math.max(280, 48 + rows.length * 48 + 50);

  return (
    <div
      className="sbm-callers-page"
      style={{
        display: "flex",
        flexDirection: "column",
        height: innerScrolls ? "100%" : undefined,
        minHeight: innerScrolls ? 0 : undefined,
        overflow: innerScrolls ? "hidden" : undefined,
        gap: 10,
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <BackLink onClick={onBack}>Back</BackLink>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 600, color: t.ink, margin: "0.75rem 0 0.25rem" }}>
          Associate site – contact
        </h1>
        <p style={{ margin: "0 0 1rem", fontSize: 13, color: t.edge2, maxWidth: 640 }}>
          Proposes links for confirmed sites only, using POC / display-name client fields and call discovery. Mapped contacts show linked
          sites in the Contacts directory.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 0, flexShrink: 0 }}>
        <button
          type="button"
          onClick={runFetch}
          disabled={loading}
          style={{
            padding: "8px 14px",
            border: "none",
            borderRadius: t.radiusButton,
            background: t.accent,
            color: t.white,
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Fetching…" : fetchedOnce ? "Refresh proposals" : "Fetch backfill data"}
        </button>
        <button
          type="button"
          onClick={mapSelected}
          disabled={bulkBusy || !fetchedOnce || selectedCount === 0}
          style={{
            padding: "8px 14px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            background: t.white,
            color: t.edge,
            fontSize: 13,
            fontWeight: 600,
            cursor: bulkBusy ? "wait" : "pointer",
          }}
        >
          {bulkBusy ? "Mapping…" : "Map these sites"}
        </button>
        {fetchedOnce ? (
          <span style={{ fontSize: 12, color: t.edge2 }}>
            {proposedCount} mappable · {selectedCount} selected
          </span>
        ) : null}
      </div>

      {error ? <p style={{ color: t.signal, fontSize: 13, margin: "0 0 8px", flexShrink: 0 }}>{error}</p> : null}

      <Card
        className="sbm-maintenance-grid-card"
        style={{
          padding: "12px 14px",
          marginBottom: 0,
          flex: innerScrolls ? "1 1 auto" : undefined,
          minHeight: innerScrolls ? 0 : undefined,
          display: "flex",
          flexDirection: "column",
          overflow: innerScrolls ? "hidden" : undefined,
        }}
      >
        <div
          className="sbm-contacts-grid-wrap"
          style={{ flex: innerScrolls ? "1 1 auto" : undefined, minHeight: innerScrolls ? 0 : undefined }}
        >
          <div
            className="sbm-contacts-grid ag-theme-quartz"
            style={
              innerScrolls
                ? { flex: "1 1 auto", minHeight: 0, height: "100%" }
                : { minHeight: fetchedOnce && rows.length ? gridMinHeight : 280 }
            }
          >
            <AgGridReact
              ref={gridRef}
              rowData={rows}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              getRowId={(p) => p.data.site_id}
              onGridReady={onGridReady}
              onSelectionChanged={onSelectionChanged}
              rowHeight={48}
              rowSelection="multiple"
              suppressRowClickSelection
              suppressCellFocus
              domLayout={innerScrolls ? "normal" : "autoHeight"}
              isRowSelectable={(p) => p.data?.status === "proposed" && Boolean(p.data?.caller_id)}
              animateRows={false}
              overlayNoRowsTemplate={
                fetchedOnce
                  ? '<span class="ag-overlay-no-rows-center">No rows</span>'
                  : '<span class="ag-overlay-no-rows-center">Click “Fetch backfill data” to load proposals</span>'
              }
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

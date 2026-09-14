import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus } from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE } from "../../styles.js";
import {
  postCreateCaller,
  patchCaller,
  loadContactsDirectory,
  refreshContactsDirectory,
  getCachedContactsDirectory,
} from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { AddCallerModal } from "./AddCallerModal.jsx";
import "./CallersDirectoryView.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const BUCKETS = [
  { id: "saved", label: "Saved contacts" },
  { id: "unsaved", label: "Unsaved contacts" },
  { id: "spam", label: "Spam" },
];

const TYPE_OPTIONS = [
  { value: "client", label: "Client" },
  { value: "family", label: "Family" },
  { value: "staff", label: "Staff" },
];

const CATEGORY_SELECT_STYLE = {
  minHeight: 32,
  width: "100%",
  maxWidth: 120,
  padding: "0 8px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const PAGE_SIZE = 100;

const EMPTY_BUCKET_COUNTS = { saved: 0, unsaved: 0, spam: 0 };

function TypeCell({ data, bucket, busyId, onChangeCategory }) {
  if (!data) return null;
  if (bucket === "spam") {
    return <span style={{ fontSize: 13, color: t.edge2 }}>Spam</span>;
  }
  const busy = busyId === data.id;
  const category = TYPE_OPTIONS.some((o) => o.value === data.category) ? data.category : "client";
  return (
    <select
      value={category}
      disabled={busy}
      aria-label={`Type for ${data.name}`}
      onChange={(e) => onChangeCategory(data.id, e.target.value)}
      style={{ ...CATEGORY_SELECT_STYLE, opacity: busy ? 0.6 : 1 }}
    >
      {TYPE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function LinkedSitesCell({ sites, bucket, onSiteClick }) {
  if (!sites?.length) return <span style={{ color: t.edge2 }}>—</span>;
  if (bucket !== "saved") {
    return (
      <span style={{ color: t.edge2, fontSize: 13 }}>
        {sites.map((s) => s.name).join(", ")}
      </span>
    );
  }
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
      {sites.map((site, i) => (
        <span key={site.id}>
          {i > 0 && <span style={{ color: t.edge2 }}>, </span>}
          <button type="button" className="sbm-contacts-site-link" onClick={() => onSiteClick(site)}>
            {site.name}
          </button>
        </span>
      ))}
    </span>
  );
}

function listQueryOpts({ bucket, siteFilter, q, pageIndex }) {
  return {
    bucket,
    siteId: bucket === "saved" && siteFilter ? siteFilter.id : undefined,
    q: q.trim() || undefined,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  };
}

/* Contacts directory — admin/superadmin. Three bookmark tabs + AG Grid. */
export function CallersDirectoryView({ onBack, innerScrolls = false }) {
  const gridRef = useRef(null);
  const [bucket, setBucket] = useState("saved");
  const [siteFilter, setSiteFilter] = useState(null);
  const [q, setQ] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [bucketCounts, setBucketCounts] = useState(EMPTY_BUCKET_COUNTS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const queryOpts = useMemo(
    () => listQueryOpts({ bucket, siteFilter, q, pageIndex }),
    [bucket, siteFilter, q, pageIndex]
  );

  const applyData = useCallback((data) => {
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
    setBucketCounts({ ...EMPTY_BUCKET_COUNTS, ...(data.bucket_counts ?? {}) });
  }, []);

  const load = useCallback(
    (opts, forceRefresh = false) => {
      const loader = forceRefresh ? refreshContactsDirectory : loadContactsDirectory;
      return loader(opts)
        .then(applyData)
        .catch((err) => {
          console.error("[sbm] failed to load contacts", err);
          setRows([]);
          setTotal(0);
        });
    },
    [applyData]
  );

  useEffect(() => {
    const hit = getCachedContactsDirectory(queryOpts);
    if (hit) applyData(hit);
    else setRows(null);
    load(queryOpts);
  }, [queryOpts, load, applyData]);

  const changeCategory = useCallback(
    async (id, nextCategory) => {
      setBusyId(id);
      setError("");
      try {
        await patchCaller(id, { category: nextCategory });
        await load(queryOpts, true);
      } catch (err) {
        console.error("[sbm] failed to update contact type", err);
        setError("Failed to update type — try again.");
      } finally {
        setBusyId(null);
      }
    },
    [load, queryOpts]
  );

  const onSiteClick = useCallback((site) => {
    setSiteFilter(site);
    setPageIndex(0);
  }, []);

  const columnDefs = useMemo(
    () => [
      {
        headerName: "Name",
        colId: "name",
        flex: 1.2,
        minWidth: 140,
        valueGetter: (p) => p.data?.name ?? "—",
      },
      {
        headerName: "Phone number",
        colId: "phone",
        width: 130,
        valueGetter: (p) => p.data?.phone || "—",
      },
      {
        headerName: "Type",
        colId: "type",
        width: 130,
        cellRenderer: (p) =>
          p.data ? (
            <TypeCell
              data={p.data}
              bucket={bucket}
              busyId={busyId}
              onChangeCategory={changeCategory}
            />
          ) : null,
      },
      {
        headerName: "Linked site",
        colId: "sites",
        flex: 1.5,
        minWidth: 160,
        sortable: false,
        cellRenderer: (p) =>
          p.data ? (
            <LinkedSitesCell sites={p.data.linked_sites} bucket={bucket} onSiteClick={onSiteClick} />
          ) : null,
      },
    ],
    [bucket, busyId, onSiteClick, changeCategory]
  );

  const defaultColDef = useMemo(
    () => ({ sortable: true, resizable: true, suppressMovable: true }),
    []
  );
  const getRowId = useCallback((p) => p.data.id, []);

  const onGridReady = useCallback(() => {
    gridRef.current?.api?.sizeColumnsToFit?.();
  }, []);

  useEffect(() => {
    if (!rows?.length) return;
    const id = requestAnimationFrame(() => {
      gridRef.current?.api?.sizeColumnsToFit?.();
    });
    return () => cancelAnimationFrame(id);
  }, [rows, bucket, innerScrolls]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (pageIndex + 1) * PAGE_SIZE);

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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem", gap: 12 }}>
          <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Contacts</h1>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.edge,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={14} /> Add contact
          </button>
        </div>
      </div>

      <div
        className="sbm-contacts-index"
        style={{
          flex: innerScrolls ? "1 1 auto" : undefined,
          minHeight: innerScrolls ? 0 : undefined,
          display: "flex",
          flexDirection: "column",
          overflow: innerScrolls ? "hidden" : undefined,
        }}
      >
          <div className="sbm-contacts-index__tabs" role="tablist" aria-label="Contact lists">
            {BUCKETS.map((tab) => {
              const selected = bucket === tab.id;
              const count = bucketCounts[tab.id] ?? 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className="sbm-contacts-index__tab"
                  onClick={() => {
                    setBucket(tab.id);
                    setSiteFilter(null);
                    setPageIndex(0);
                    setQ("");
                  }}
                >
                  {tab.label}
                  <span className="sbm-contacts-index__tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          <Card
            className="sbm-contacts-index__page"
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
            {bucket === "saved" && siteFilter && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                  fontSize: 13,
                  color: t.edge,
                }}
              >
                <span>
                  Site: <strong>{siteFilter.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSiteFilter(null);
                    setPageIndex(0);
                  }}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: t.accent,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontFamily: t.label, fontSize: 11, fontWeight: 700, color: t.edge2, textTransform: "uppercase" }}>
                Search
              </span>
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPageIndex(0);
                }}
                placeholder="Name or phone…"
                style={{ ...TEXT_INPUT_STYLE, marginTop: 6, width: "100%", maxWidth: 320 }}
              />
            </label>

            {error && <p style={{ fontSize: 12, color: t.signal, margin: "0 0 10px" }}>{error}</p>}

            {rows === null ? (
              <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
            ) : rows.length === 0 ? (
              <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No contacts in this list.</p>
            ) : (
              <div
                className="sbm-contacts-grid-wrap"
                style={{ flex: innerScrolls ? "1 1 auto" : undefined, minHeight: innerScrolls ? 0 : undefined }}
              >
                <div
                  className="sbm-contacts-grid ag-theme-quartz"
                  style={
                    innerScrolls
                      ? { flex: "1 1 auto", minHeight: 0, height: "100%" }
                      : { minHeight: Math.max(280, 48 + rows.length * 48 + 50) }
                  }
                >
                  <AgGridReact
                    ref={gridRef}
                    rowData={rows}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    getRowId={getRowId}
                    onGridReady={onGridReady}
                    rowHeight={48}
                    animateRows={false}
                    suppressCellFocus
                    domLayout={innerScrolls ? "normal" : "autoHeight"}
                    overlayNoRowsTemplate="No contacts in this list."
                  />
                </div>
                {total > PAGE_SIZE && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginTop: 12,
                      fontSize: 13,
                      color: t.edge2,
                    }}
                  >
                    <span>
                      {rangeStart}–{rangeEnd} of {total}
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        disabled={pageIndex <= 0}
                        onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                        style={{
                          padding: "6px 12px",
                          border: `1px solid ${t.frost}`,
                          borderRadius: t.radiusButton,
                          background: t.white,
                          cursor: pageIndex <= 0 ? "not-allowed" : "pointer",
                          opacity: pageIndex <= 0 ? 0.5 : 1,
                        }}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={pageIndex >= pageCount - 1}
                        onClick={() => setPageIndex((p) => p + 1)}
                        style={{
                          padding: "6px 12px",
                          border: `1px solid ${t.frost}`,
                          borderRadius: t.radiusButton,
                          background: t.white,
                          cursor: pageIndex >= pageCount - 1 ? "not-allowed" : "pointer",
                          opacity: pageIndex >= pageCount - 1 ? 0.5 : 1,
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
      </div>

      {showAddModal && (
        <AddCallerModal
          onClose={() => setShowAddModal(false)}
          onCreate={async (input) => {
            const created = await postCreateCaller(input);
            await load(queryOpts, true);
            await refreshContactsDirectory({
              bucket: input.category === "spam" ? "spam" : "unsaved",
              limit: PAGE_SIZE,
              offset: 0,
            }).catch(() => {});
            return created;
          }}
        />
      )}
    </div>
  );
}

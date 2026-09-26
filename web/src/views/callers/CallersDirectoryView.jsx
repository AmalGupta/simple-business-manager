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
  postPromoteCallerStaff,
  postConfirmCallerStaffPromotion,
} from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { AddCallerModal } from "./AddCallerModal.jsx";
import { ManageAliasesModal } from "./ManageAliasesModal.jsx";
import { PromoteStaffConfirmModal } from "./PromoteStaffConfirmModal.jsx";
import "./CallersDirectoryView.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const BUCKETS = [
  { id: "saved", label: "Saved contacts" },
  { id: "unsaved", label: "Unsaved contacts" },
  { id: "staff", label: "Staff" },
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

const EMPTY_BUCKET_COUNTS = { saved: 0, unsaved: 0, spam: 0, staff: 0 };

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
  if (bucket !== "saved" && bucket !== "staff") {
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

function AliasesCell({ aliases, onManage }) {
  const preview = aliases?.length ? aliases.join(", ") : "—";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 13,
          color: aliases?.length ? t.edge : t.edge2,
        }}
        title={aliases?.length ? aliases.join(", ") : undefined}
      >
        {preview}
      </span>
      <button
        type="button"
        onClick={onManage}
        style={{
          flexShrink: 0,
          padding: "4px 8px",
          border: `1px solid ${t.frost}`,
          borderRadius: t.radiusButton,
          background: t.white,
          color: t.edge,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {aliases?.length ? "Manage" : "Add alias"}
      </button>
    </span>
  );
}

function listQueryOpts({ bucket, siteFilter, linkedSitesOnly, q, pageIndex }) {
  const siteBuckets = bucket === "saved" || bucket === "staff";
  return {
    bucket,
    siteId: siteBuckets && siteFilter ? siteFilter.id : undefined,
    linkedSitesOnly: siteBuckets && linkedSitesOnly && !siteFilter ? true : undefined,
    includeLinkedSites: true,
    includeAliases: true,
    q: q.trim() || undefined,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  };
}

/* Contacts directory — admin/superadmin. Bookmark tabs + AG Grid. */
export function CallersDirectoryView({ onBack, innerScrolls = false }) {
  const gridRef = useRef(null);
  const [bucket, setBucket] = useState("saved");
  const [siteFilter, setSiteFilter] = useState(null);
  const [linkedSitesOnly, setLinkedSitesOnly] = useState(false);
  const [q, setQ] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [bucketCounts, setBucketCounts] = useState(EMPTY_BUCKET_COUNTS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [aliasCaller, setAliasCaller] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const queryOpts = useMemo(
    () => listQueryOpts({ bucket, siteFilter, linkedSitesOnly, q, pageIndex }),
    [bucket, siteFilter, linkedSitesOnly, q, pageIndex]
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

  const runPromoteFlow = useCallback(async (callerId) => {
    const result = await postPromoteCallerStaff(callerId);
    setPromotion(result);
    return result;
  }, []);

  const changeCategory = useCallback(
    async (id, nextCategory) => {
      setBusyId(id);
      setError("");
      try {
        if (nextCategory === "staff") {
          await runPromoteFlow(id);
          await load(queryOpts, true);
          await refreshContactsDirectory({ bucket: "staff", limit: PAGE_SIZE, offset: 0 }).catch(() => {});
        } else {
          await patchCaller(id, { category: nextCategory });
          await load(queryOpts, true);
        }
      } catch (err) {
        console.error("[sbm] failed to update contact type", err);
        setError(err.message || "Failed to update type — try again.");
      } finally {
        setBusyId(null);
      }
    },
    [load, queryOpts, runPromoteFlow]
  );

  const onSiteClick = useCallback((site) => {
    setSiteFilter(site);
    setPageIndex(0);
  }, []);

  const onManageAliases = useCallback((caller) => {
    setAliasCaller(caller);
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
        headerName: "Sites",
        colId: "sites",
        flex: 1.4,
        minWidth: 160,
        cellRenderer: (p) => (
          <LinkedSitesCell sites={p.data?.linked_sites} bucket={bucket} onSiteClick={onSiteClick} />
        ),
      },
      {
        headerName: "Aliases",
        colId: "aliases",
        flex: 1,
        minWidth: 160,
        cellRenderer: (p) =>
          p.data ? (
            <AliasesCell aliases={p.data.aliases} onManage={() => onManageAliases(p.data)} />
          ) : null,
      },
      ...(bucket === "staff"
        ? [
            {
              headerName: "Login",
              colId: "staff_login",
              width: 160,
              cellRenderer: (p) => {
                if (!p.data) return null;
                if (p.data.staff_user_name) {
                  return <span style={{ fontSize: 13 }}>{p.data.staff_user_name}</span>;
                }
                const busy = busyId === p.data.id;
                return (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => changeCategory(p.data.id, "staff")}
                    style={{
                      padding: "4px 8px",
                      border: `1px solid ${t.frost}`,
                      borderRadius: t.radiusButton,
                      background: t.white,
                      color: t.accent,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: busy ? "not-allowed" : "pointer",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    Set up login
                  </button>
                );
              },
            },
          ]
        : []),
    ],
    [bucket, busyId, changeCategory, onSiteClick, onManageAliases]
  );

  const defaultColDef = useMemo(
    () => ({
      sortable: false,
      filter: false,
      resizable: true,
      suppressMovable: true,
    }),
    []
  );

  const getRowId = useCallback((p) => p.data.id, []);

  const onGridReady = useCallback((params) => {
    params.api.sizeColumnsToFit?.();
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      gridRef.current?.api?.sizeColumnsToFit?.();
    });
    return () => cancelAnimationFrame(id);
  }, [rows, bucket, innerScrolls]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (pageIndex + 1) * PAGE_SIZE);
  const siteFilterBuckets = bucket === "saved" || bucket === "staff";

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
                  setLinkedSitesOnly(false);
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
          style={{
            flex: innerScrolls ? "1 1 auto" : undefined,
            minHeight: innerScrolls ? 0 : undefined,
            display: "flex",
            flexDirection: "column",
            overflow: innerScrolls ? "hidden" : undefined,
            padding: "1rem 1.1rem 1.15rem",
          }}
        >
          {siteFilter && siteFilterBuckets && (
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

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: "12px 20px",
              marginBottom: 12,
            }}
          >
            <label style={{ display: "block", flex: "0 1 320px" }}>
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
            {siteFilterBuckets && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 6,
                  fontSize: 13,
                  color: t.edge,
                  cursor: "pointer",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                <input
                  type="checkbox"
                  checked={linkedSitesOnly}
                  onChange={(e) => {
                    setLinkedSitesOnly(e.target.checked);
                    setPageIndex(0);
                  }}
                  style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }}
                />
                Show contacts with linked sites only
              </label>
            )}
          </div>

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
            if (input.category === "staff") {
              await runPromoteFlow(created.id);
              setBucket("staff");
              setPageIndex(0);
            }
            await load(
              input.category === "staff"
                ? listQueryOpts({
                    bucket: "staff",
                    siteFilter: null,
                    linkedSitesOnly: false,
                    q: "",
                    pageIndex: 0,
                  })
                : queryOpts,
              true
            );
            await refreshContactsDirectory({
              bucket: input.category === "spam" ? "spam" : input.category === "staff" ? "staff" : "unsaved",
              limit: PAGE_SIZE,
              offset: 0,
            }).catch(() => {});
            return created;
          }}
        />
      )}

      {promotion && (
        <PromoteStaffConfirmModal
          promotion={promotion}
          onClose={() => setPromotion(null)}
          onConfirm={async (fields) => {
            await postConfirmCallerStaffPromotion(promotion.caller_id, fields);
            await load(queryOpts, true);
            await refreshContactsDirectory({ bucket: "staff", limit: PAGE_SIZE, offset: 0 }).catch(() => {});
          }}
        />
      )}

      {aliasCaller && (
        <ManageAliasesModal
          caller={aliasCaller}
          onClose={() => setAliasCaller(null)}
          onChanged={() => load(queryOpts, true)}
        />
      )}
    </div>
  );
}

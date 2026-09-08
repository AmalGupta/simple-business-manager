import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { Check } from "lucide-react";
import { t } from "../../theme.js";
import { fetchCallers } from "../../lib/api.js";
import { Modal } from "../../components/Modal.jsx";
import { PRIMARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";

ModuleRegistry.registerModules([AllCommunityModule]);

/* ------------------------------------------------------------------
   "Associate contacts" — the + on a Review sites row (SitesReviewGrid).
   Picks Callers Directory rows to link to one site via caller_sites.

   A grid rather than AddPeopleModal's plain list, because this screen's
   job is bulk: the reviewer is going down a backlog of sites and wants
   to search, tick several clients, and move on. The list in
   AddPeopleModal stays as it is — it's a two-tab staff/contact picker
   opened from a single site's page, a different errand.

   Clients only. The directory is a ~3.3k-row phone-contacts import
   whose other categories are staff, family and spam; none of those is a
   site contact. Filtering to one category also makes it small enough to
   load whole and filter in the browser, which is what makes typing feel
   instant.

   Its own scoped CSS block rather than SITES_GRID_CSS: same convention
   the calls grid follows (one --ag-* mapping per grid, scoped so the
   selectors can't collide), and this one needs a fixed-height scrolling
   body inside a dialog rather than the page-scrolling behaviour the
   sites grids are tuned for.
   ------------------------------------------------------------------ */

const CONTACTS_GRID_CSS = `
.sbm-contacts-grid.ag-theme-quartz {
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
  --ag-row-height: 44px;
  --ag-icon-size: 14px;
  width: 100%;
  height: 340px;
}
.sbm-contacts-grid .ag-header-cell-text {
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sbm-contacts-grid .ag-cell {
  display: flex;
  align-items: center;
}
.sbm-contacts-grid .sbm-ccol-phone {
  font-variant-numeric: tabular-nums;
  color: var(--color-slate);
}
.sbm-contacts-grid .sbm-ccol-add {
  padding-top: 0;
  padding-bottom: 0;
  justify-content: center;
}
/* A ticked row greys out — the spec's "the row greys out" — so a long
   filtered list still shows at a glance what has already been picked. */
.sbm-contacts-grid .ag-row.sbm-crow-chosen .ag-cell {
  color: var(--color-slate);
  opacity: 0.6;
}
.sbm-contacts-grid .ag-tooltip,
.sbm-contacts-grid .ag-popup .ag-tooltip {
  display: none !important;
}
`;

function CheckBox({ checked, disabled, label, onToggle }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        padding: 0,
        border: `1px solid ${checked ? t.accent : t.frost}`,
        borderRadius: 4,
        background: checked ? t.accent : t.white,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {checked && <Check size={12} color={t.white} />}
    </button>
  );
}

/**
 * `onSave(callerIds)` does the write and resolves to the site's full
 * contact list — SitesReviewGrid owns it, the same way SiteView owns the
 * write behind AddPeopleModal.
 */
export function AssociateContactsModal({ site, existingContactIds = [], onClose, onSave }) {
  const gridRef = useRef(null);
  const [clients, setClients] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /* Set once the write lands: the dialog then shows only the confirmation,
     so the reviewer reads what happened before the grid comes back. */
  const [confirmation, setConfirmation] = useState(null);

  const alreadyLinked = useMemo(() => new Set(existingContactIds), [existingContactIds]);

  useEffect(() => {
    let cancelled = false;
    fetchCallers({ category: "client" })
      .then((data) => {
        if (!cancelled) setClients(data.items ?? []);
      })
      .catch((err) => {
        console.error("[sbm] failed to load clients for site contacts", err);
        if (!cancelled) {
          setClients([]);
          setError("Couldn't load the client list — try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* Selection folded into row data rather than read from grid context, so
     ticking a box produces new row objects AG Grid diffs against
     getRowId — same approach as the decision column on the review grid. */
  const rows = useMemo(
    () =>
      (clients ?? []).map((c) => ({
        ...c,
        linked: alreadyLinked.has(c.id),
        chosen: alreadyLinked.has(c.id) || selected.has(c.id),
      })),
    [clients, alreadyLinked, selected]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q));
  }, [rows, query]);

  const columnDefs = useMemo(
    () => [
      {
        headerName: "Name",
        colId: "name",
        flex: 1,
        minWidth: 140,
        cellClass: "sbm-ccol-name",
        valueGetter: (p) => p.data?.name ?? "",
      },
      {
        headerName: "Phone",
        colId: "phone",
        width: 150,
        suppressSizeToFit: true,
        cellClass: "sbm-ccol-phone",
        valueGetter: (p) => p.data?.phone ?? "",
        valueFormatter: (p) => p.value || "—",
      },
      {
        headerName: "Add to site",
        colId: "add",
        width: 104,
        suppressSizeToFit: true,
        sortable: false,
        resizable: false,
        cellClass: "sbm-ccol-add",
        cellRenderer: (p) =>
          p.data?.id ? (
            <CheckBox
              checked={p.data.chosen}
              disabled={p.data.linked}
              label={p.data.linked ? `${p.data.name} is already on this site` : `Add ${p.data.name} to this site`}
              onToggle={() => toggle(p.data.id)}
            />
          ) : null,
      },
    ],
    [toggle]
  );

  const defaultColDef = useMemo(
    () => ({ sortable: true, resizable: false, suppressMovable: true, tooltipValueGetter: () => null }),
    []
  );

  const getRowId = useCallback((params) => params.data.id, []);
  const getRowClass = useCallback((params) => (params.data?.chosen ? "sbm-crow-chosen" : undefined), []);

  const submit = async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      setError("Tick at least one contact.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(ids);
      const names = (clients ?? []).filter((c) => selected.has(c.id)).map((c) => c.name);
      setConfirmation(names);
    } catch (err) {
      console.error("[sbm] failed to associate contacts", err);
      setError(err.message || "Couldn't add these contacts — try again.");
    } finally {
      setSaving(false);
    }
  };

  if (confirmation) {
    return (
      <Modal label="Contacts added" title="Contacts added" onClose={onClose} width={420}>
        <p style={{ fontSize: 14, color: t.edge, margin: 0 }}>
          {confirmation.length === 1 ? "1 contact is" : `${confirmation.length} contacts are`} now associated with{" "}
          <strong>{site.name}</strong>.
        </p>
        <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>{confirmation.join(", ")}</p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={PRIMARY_BUTTON_STYLE}>
            Close
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      label={`Associate contacts with ${site.name}`}
      title={`Associate contacts — ${site.name}`}
      onClose={onClose}
      width={720}
    >
      <style>{CONTACTS_GRID_CSS}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or phone…"
          aria-label="Search contacts"
          autoFocus
          style={{ ...TEXT_INPUT_STYLE, flex: 1, minWidth: 180 }}
        />
        <span style={{ fontSize: 12, color: t.edge2 }}>
          {clients === null
            ? "Loading clients…"
            : filtered.length === rows.length
              ? `${rows.length} client${rows.length === 1 ? "" : "s"}`
              : `${filtered.length} of ${rows.length}`}
        </span>
      </div>

      <div className="sbm-contacts-grid ag-theme-quartz">
        <AgGridReact
          ref={gridRef}
          rowData={filtered}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          getRowClass={getRowClass}
          rowHeight={44}
          animateRows={false}
          suppressCellFocus
          enableBrowserTooltips={false}
          overlayNoRowsTemplate={clients === null ? "Loading…" : "No clients match this search."}
        />
      </div>

      {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 12, color: t.edge2 }}>
          {selected.size === 0 ? "Nothing ticked yet." : `${selected.size} ticked.`}
        </span>
        <button
          onClick={submit}
          disabled={saving || selected.size === 0}
          style={{
            ...PRIMARY_BUTTON_STYLE,
            cursor: saving || selected.size === 0 ? "not-allowed" : "pointer",
            opacity: saving || selected.size === 0 ? 0.5 : 1,
          }}
        >
          {saving ? "Adding…" : "Add to site"}
        </button>
      </div>
    </Modal>
  );
}

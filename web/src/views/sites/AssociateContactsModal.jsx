import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { Check } from "lucide-react";
import { t } from "../../theme.js";
import { fetchCallers, postCreateCaller, patchCaller, refreshCallersByCategory } from "../../lib/api.js";
import { isPhoneLikeName, needlesFromSite, newContactOffer, rankContactMatches } from "../../lib/contactMatch.js";
import { Modal } from "../../components/Modal.jsx";
import { PRIMARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";

ModuleRegistry.registerModules([AllCommunityModule]);

/* ------------------------------------------------------------------
   "Associate contacts" — the + on a Review sites row (SitesReviewGrid).
   Picks Callers Directory rows to link to one site via caller_sites.

   Opens with a smart lookup: the discovering caller / contact person are
   scored against the clients directory, and the top hits land under
   "Most likely matches" (name + phone + tick). When the identified
   contact isn't in the directory — or only exists as a digits-only
   Cube ACR name — "Add a new contact" creates or renames the directory
   row, then ticks it for association. The full directory sits below.

   Clients only. The directory is a ~3.3k–4k-row phone-contacts import
   whose other categories are staff, family and spam; none of those is a
   site contact. The grid is server-paginated (same pattern as Add people)
   so opening the modal does not download the whole category. Likely matches
   use a few targeted `q=` fetches from the site's known names/phones, then
   rank in-memory. Linked sites are not hydrated here — Contacts directory
   only.
   ------------------------------------------------------------------ */

const CONTACT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;

/** Small candidate set for "Most likely matches" — not the full directory. */
async function fetchLikelyMatchCandidates(site) {
  const needles = needlesFromSite(site);
  const queries = new Set();
  for (const phone of needles.phones.slice(0, 2)) {
    if (phone.length >= 7) queries.add(phone);
  }
  for (const name of needles.names.slice(0, 2)) {
    const token = name.split(/\s+/).find((w) => w.length >= 3) || name;
    if (token.length >= 2) queries.add(token);
  }
  if (queries.size === 0) return [];
  const pages = await Promise.all(
    [...queries].map((q) => fetchCallers({ category: "client", q, limit: CONTACT_PAGE_SIZE }))
  );
  const byId = new Map();
  for (const page of pages) {
    for (const item of page.items ?? []) byId.set(item.id, item);
  }
  return [...byId.values()];
}

const CONTACTS_GRID_CSS = `
.sbm-associate-contacts-grid.ag-theme-quartz {
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
  height: 260px;
  min-height: 260px;
  flex: 0 0 auto;
}
.sbm-associate-contacts-grid .ag-root-wrapper {
  height: 100%;
}
.sbm-associate-contacts-grid .ag-header-cell-text {
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sbm-associate-contacts-grid .ag-cell {
  display: flex;
  align-items: center;
}
.sbm-associate-contacts-grid .sbm-ccol-phone {
  font-variant-numeric: tabular-nums;
  color: var(--color-slate);
}
.sbm-associate-contacts-grid .sbm-ccol-add {
  padding-top: 0;
  padding-bottom: 0;
  justify-content: center;
}
.sbm-associate-contacts-grid .ag-row.sbm-crow-chosen .ag-cell {
  color: var(--color-slate);
  opacity: 0.6;
}
.sbm-associate-contacts-grid .ag-tooltip,
.sbm-associate-contacts-grid .ag-popup .ag-tooltip {
  display: none !important;
}
`;

const sectionLabelStyle = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: t.edge2,
  margin: 0,
};

const linkButtonStyle = {
  border: "none",
  background: "none",
  padding: 0,
  color: t.accent,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  whiteSpace: "nowrap",
};

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
  const seededStrong = useRef(false);
  const searchSeq = useRef(0);
  const [clients, setClients] = useState(null);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [matchCandidates, setMatchCandidates] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [selectedNames, setSelectedNames] = useState(() => ({}));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  /* After a successful create/rename, stop offering until the modal reopens. */
  const [newContactDone, setNewContactDone] = useState(false);

  const alreadyLinked = useMemo(() => new Set(existingContactIds), [existingContactIds]);

  /* Likely-match candidates — a few targeted searches, not the full category. */
  useEffect(() => {
    let cancelled = false;
    fetchLikelyMatchCandidates(site)
      .then((list) => {
        if (!cancelled) setMatchCandidates(list);
      })
      .catch((err) => {
        console.error("[sbm] failed to load likely contact matches", err);
        if (!cancelled) setMatchCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [site]);

  /* Debounced server-side search for the grid (Add-people pattern). */
  useEffect(() => {
    const mySeq = ++searchSeq.current;
    const timer = setTimeout(() => {
      fetchCallers({
        category: "client",
        q: query.trim() || undefined,
        limit: CONTACT_PAGE_SIZE,
      })
        .then((data) => {
          if (searchSeq.current !== mySeq) return;
          setClients(data.items ?? []);
          setClientsTotal(data.total ?? 0);
        })
        .catch((err) => {
          console.error("[sbm] failed to load clients for site contacts", err);
          if (searchSeq.current !== mySeq) return;
          setClients([]);
          setClientsTotal(0);
          setError("Couldn't load the client list — try again.");
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const likelyMatches = useMemo(() => {
    if (!matchCandidates) return [];
    return rankContactMatches(site, matchCandidates, { excludeIds: alreadyLinked, limit: 5 });
  }, [matchCandidates, site, alreadyLinked]);

  const offer = useMemo(() => {
    if (!matchCandidates || newContactDone) return null;
    return newContactOffer(site, matchCandidates, likelyMatches);
  }, [matchCandidates, site, likelyMatches, newContactDone]);

  useEffect(() => {
    if (!matchCandidates || seededStrong.current) return;
    seededStrong.current = true;
    /* Don't auto-tick digits-only directory rows — those need a real name
       via "Add a new contact" before they're useful as site contacts. */
    const auto = likelyMatches
      .filter((m) => m.strong && !isPhoneLikeName(m.caller.name))
      .map((m) => m.caller);
    if (auto.length === 0) return;
    setSelected((current) => {
      const next = new Set(current);
      for (const c of auto) next.add(c.id);
      return next;
    });
    setSelectedNames((current) => {
      const next = { ...current };
      for (const c of auto) next[c.id] = c.name;
      return next;
    });
  }, [matchCandidates, likelyMatches]);

  const openNewContactForm = () => {
    if (!offer) return;
    setNewName(offer.identified.suggestedName || "");
    setNewPhone(offer.identified.phoneDisplay || offer.identified.phone || "");
    setCreateError("");
    setAddingNew(true);
  };

  const saveNewContact = async () => {
    const name = newName.trim();
    if (!name) {
      setCreateError("Enter a name for this contact.");
      return;
    }
    if (isPhoneLikeName(name)) {
      setCreateError("Use a person's name, not a phone number.");
      return;
    }
    const phone = newPhone.trim() || null;
    setCreating(true);
    setCreateError("");
    try {
      let saved;
      if (offer?.existingCallerId) {
        /* Phone-as-name row already owns this number — rename it rather
           than fighting UNIQUE(phone) with a second insert. */
        saved = await patchCaller(offer.existingCallerId, { name, phone });
      } else {
        saved = await postCreateCaller({ name, phone, category: "client" });
      }
      setMatchCandidates((current) => {
        const list = current ?? [];
        const idx = list.findIndex((c) => c.id === saved.id);
        if (idx >= 0) {
          const next = list.slice();
          next[idx] = saved;
          return next;
        }
        return [saved, ...list];
      });
      setClients((current) => {
        const list = current ?? [];
        const idx = list.findIndex((c) => c.id === saved.id);
        if (idx >= 0) {
          const next = list.slice();
          next[idx] = saved;
          return next;
        }
        return [saved, ...list];
      });
      setSelected((current) => {
        const next = new Set(current);
        next.add(saved.id);
        return next;
      });
      setSelectedNames((current) => ({ ...current, [saved.id]: saved.name }));
      setAddingNew(false);
      setNewContactDone(true);
      /* Keep the Callers Directory screen's cache honest if it's open later. */
      refreshCallersByCategory("client").catch(() => {});
    } catch (err) {
      console.error("[sbm] failed to add contact from site association", err);
      setCreateError(err.message || "Couldn't save this contact — try again.");
    } finally {
      setCreating(false);
    }
  };

  const toggle = useCallback((caller) => {
    if (!caller?.id) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(caller.id)) next.delete(caller.id);
      else next.add(caller.id);
      return next;
    });
    setSelectedNames((current) => {
      const next = { ...current };
      if (next[caller.id]) delete next[caller.id];
      else next[caller.id] = caller.name;
      return next;
    });
  }, []);

  const rows = useMemo(
    () =>
      (clients ?? []).map((c) => ({
        ...c,
        linked: alreadyLinked.has(c.id),
        chosen: alreadyLinked.has(c.id) || selected.has(c.id),
      })),
    [clients, alreadyLinked, selected]
  );

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
              onToggle={() => toggle(p.data)}
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
      const names = ids.map((id) => selectedNames[id]).filter(Boolean);
      setConfirmation(names.length > 0 ? names : ids.map(() => "Contact"));
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
      scroll
    >
      <style>{CONTACTS_GRID_CSS}</style>

      {matchCandidates !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {offer && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px 12px",
                border: `1px solid ${t.frost}`,
                background: "color-mix(in srgb, var(--color-accent) 4%, white)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={sectionLabelStyle}>Identified contact</span>
                  <span style={{ fontSize: 14, color: t.edge, fontWeight: 500 }}>
                    {offer.identified.label}
                    {offer.identified.phoneDisplay && !isPhoneLikeName(offer.identified.label) ? (
                      <span style={{ fontWeight: 400, color: t.edge2, marginLeft: 8 }}>
                        {offer.identified.phoneDisplay}
                      </span>
                    ) : null}
                  </span>
                  <span style={{ fontSize: 12, color: t.edge2 }}>
                    {offer.reason === "phone_only"
                      ? "Listed in the directory as a phone number only — give them a name to add as a contact."
                      : "Not found as a named contact in the directory."}
                  </span>
                </div>
                {!addingNew && (
                  <button type="button" onClick={openNewContactForm} style={linkButtonStyle}>
                    Add a new contact
                  </button>
                )}
              </div>

              {addingNew && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Contact name"
                      aria-label="New contact name"
                      autoFocus
                      style={{ ...TEXT_INPUT_STYLE, flex: 1, minWidth: 160 }}
                    />
                    <input
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      aria-label="New contact phone"
                      style={{ ...TEXT_INPUT_STYLE, flex: 1, minWidth: 140 }}
                    />
                  </div>
                  {createError && <span style={{ fontSize: 12, color: t.signal }}>{createError}</span>}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingNew(false);
                        setCreateError("");
                      }}
                      style={{
                        minHeight: 36,
                        padding: "0 14px",
                        border: `1px solid ${t.frost}`,
                        borderRadius: t.radiusButton,
                        background: t.white,
                        color: t.edge2,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveNewContact}
                      disabled={creating}
                      style={{
                        ...PRIMARY_BUTTON_STYLE,
                        minHeight: 36,
                        opacity: creating ? 0.6 : 1,
                      }}
                    >
                      {creating
                        ? "Saving…"
                        : offer.existingCallerId
                          ? "Save to directory"
                          : "Add to directory"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <h3 style={sectionLabelStyle}>Most likely matches</h3>
          {likelyMatches.length === 0 ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>
              No close matches in the directory
              {site.discovered_from_caller_name || site.poc_name
                ? ` for ${[site.discovered_from_caller_name, site.poc_name].filter(Boolean).join(" / ")}`
                : ""}
              . Pick from the list below
              {offer ? ", or add a new contact above" : ""}.
            </p>
          ) : (
            <div
              role="list"
              aria-label="Most likely contact matches"
              style={{
                border: `1px solid ${t.frost}`,
                background: t.white,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 150px 104px",
                  gap: 0,
                  padding: "8px 12px",
                  background: "#DCE6FF",
                  borderBottom: `1px solid ${t.frost}`,
                }}
              >
                <span style={{ ...sectionLabelStyle, color: t.edge }}>Name</span>
                <span style={{ ...sectionLabelStyle, color: t.edge }}>Phone</span>
                <span style={{ ...sectionLabelStyle, color: t.edge, textAlign: "center" }}>Add</span>
              </div>
              {likelyMatches.map(({ caller, strong }) => {
                const linked = alreadyLinked.has(caller.id);
                const chosen = linked || selected.has(caller.id);
                const phoneOnly = isPhoneLikeName(caller.name);
                return (
                  <div
                    key={caller.id}
                    role="listitem"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 150px 104px",
                      alignItems: "center",
                      gap: 0,
                      padding: "10px 12px",
                      borderBottom: `1px solid ${t.frostSoft}`,
                      opacity: chosen ? 0.65 : 1,
                      background: strong && !linked && !phoneOnly ? "color-mix(in srgb, var(--color-accent) 4%, white)" : t.white,
                    }}
                  >
                    <span style={{ fontSize: 13, color: t.edge, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {caller.name}
                      {phoneOnly ? (
                        <span style={{ marginLeft: 6, fontSize: 11, color: t.edge2 }}>(phone only)</span>
                      ) : null}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        color: t.edge2,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {caller.phone || "—"}
                    </span>
                    <span style={{ display: "flex", justifyContent: "center" }}>
                      <CheckBox
                        checked={chosen}
                        disabled={linked}
                        label={
                          linked
                            ? `${caller.name} is already on this site`
                            : `Add ${caller.name} to this site`
                        }
                        onToggle={() => toggle(caller)}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={sectionLabelStyle}>Select existing contacts</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or phone…"
            aria-label="Search contacts"
            autoFocus={!offer}
            style={{ ...TEXT_INPUT_STYLE, flex: 1, minWidth: 180 }}
          />
          <span style={{ fontSize: 12, color: t.edge2 }}>
            {clients === null
              ? "Loading clients…"
              : clientsTotal > rows.length
                ? `Showing ${rows.length} of ${clientsTotal}${query.trim() ? " matching" : ""}`
                : `${clientsTotal} client${clientsTotal === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="sbm-associate-contacts-grid ag-theme-quartz">
          <AgGridReact
            ref={gridRef}
            rowData={rows}
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

import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { Mic, Plus } from "lucide-react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { postSiteContacts, postSiteVoiceNote } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { VoiceNoteModal } from "./VoiceNoteModal.jsx";
import { AssociateContactsModal } from "./AssociateContactsModal.jsx";
import { SiteDetailsModal } from "./SiteDetailsModal.jsx";
import {
  SITES_GRID_CSS,
  DateWindowFilter,
  FilterCount,
  SelectFilter,
  SiteDisplayName,
  TextFilter,
  daysAgo,
  siteDisplayName,
  siteSearchText,
  windowFor,
} from "./sitesGridChrome.jsx";

ModuleRegistry.registerModules([AllCommunityModule]);

/* ------------------------------------------------------------------
   The unconfirmed-sites review table. Same look and filter vocabulary
   as the confirmed-sites directory (sitesGridChrome.jsx), but the
   validity decision is a column — an Is Valid switch — rather than the
   whole point of a card row, with a mic beside it for a voice note on
   the sites that survive the decision.

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

function contactsLabel(site) {
  return (site.contacts ?? []).map((c) => c.name).join(", ");
}

/* The name is the row's one piece of prose, so it doubles as the way in
   to the details form — a discovered site arrives as a bare string, and
   this is where the H.No, sector and contact that make it a real record
   get filled in, and where the string itself gets corrected if the call
   was misheard. Staff see plain text: PATCH /api/sites/:id is admin-only,
   so a link would open a dialog that can't save. */
function SiteNameCell({ site, canManage, onOpenDetails }) {
  if (!canManage) return <SiteDisplayName site={site} />;
  return (
    <button
      type="button"
      className="sbm-site-link"
      onClick={() => onOpenDetails(site)}
      title="Add site details and mark it valid"
    >
      <SiteDisplayName site={site} />
    </button>
  );
}

/* Accent rather than the grey the other row affordances use: it's the
   only control here that adds data instead of judging what's already
   there, and at 24px next to two lines of text a hairline grey square
   read as decoration. Outline, not filled — one per row, and a column
   of filled blue would shout over the decision switch. */
function AssociateButton({ site, onAssociate }) {
  return (
    <button
      type="button"
      onClick={() => onAssociate(site)}
      aria-label={`Add associated contacts to ${site.name}`}
      title="Add associated contacts"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: 24,
        height: 24,
        border: `1px solid ${t.accent}`,
        borderRadius: t.radiusButton,
        background: t.white,
        color: t.accent,
        cursor: "pointer",
        padding: 0,
      }}
    >
      <Plus size={14} />
    </button>
  );
}

/* Who the site was first heard from, and who it belongs to, in one cell:
   the discovering caller reads as evidence for the validity decision,
   the linked contacts as the answer to "whose site is this". Two lines
   rather than two columns because the second is usually empty — most
   rows here have never been curated. */
function CallerCell({ site, canManage, onAssociate }) {
  const contacts = contactsLabel(site);
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0 }}>
      <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {callerLabel(site)}
        </span>
        {contacts && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: t.edge2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {contacts}
          </span>
        )}
      </span>
      {canManage && <AssociateButton site={site} onAssociate={onAssociate} />}
    </span>
  );
}

/* "Call date" is the date of the call the site name was extracted from,
   not the site's most recent call — a distinction nothing on the row
   makes on its own. The grid suppresses AG Grid's own tooltips (see
   SITES_GRID_CSS and enableBrowserTooltips below), so this is a native
   title on a custom header rather than `headerTooltip`, which would
   render nothing. The class keeps the shared header typography. */
function CallDateHeader() {
  return (
    <span
      className="ag-header-cell-text"
      title="Date of the call that helped discover this site"
      style={{ cursor: "help" }}
    >
      Call date
    </span>
  );
}

/* One switch rather than the Valid / Not valid button pair, but the
   decision still has three states — a row nobody has judged yet is not
   the same as one judged invalid, and the "Undecided" filter is what
   makes the backlog workable. So "off" carries two appearances: warn
   tint for an explicit N, plain grey for untouched. The caption spells
   out which, because a switch alone can only say on or off. */
const DECISION_LOOK = {
  Y: { caption: "Valid", track: t.accent, border: t.accent, knob: t.white, captionColor: t.accent },
  N: { caption: "Not valid", track: t.puttyBg, border: t.putty, knob: t.putty, captionColor: t.putty },
  null: { caption: "Undecided", track: t.white, border: t.frost, knob: t.frost, captionColor: t.edge2 },
};

function ValidSwitch({ site, decision, onChoose }) {
  const look = DECISION_LOOK[decision ?? "null"];
  const on = decision === "Y";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0 }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${site.name} is valid`}
        onClick={() => onChoose(site.id, on ? "N" : "Y")}
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: on ? "flex-end" : "flex-start",
          width: 38,
          height: 22,
          padding: 2,
          border: `1px solid ${look.border}`,
          borderRadius: 999,
          background: look.track,
          cursor: "pointer",
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: "50%", background: look.knob }} />
      </button>
      <span style={{ fontSize: 11, fontWeight: 600, color: look.captionColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {look.caption}
      </span>
    </span>
  );
}

/* Gated on the pending decision, not the saved one: a voice note fans a
   task out to the site's staff, which is only a sane thing to do once
   someone has said the site is real. Marking a row Valid enables the mic
   immediately rather than after the batched save, so the two decisions
   can be made in one pass. */
function AddNoteButton({ site, decision, onOpen }) {
  const enabled = decision === "Y";
  return (
    <button
      type="button"
      onClick={() => onOpen(site)}
      disabled={!enabled}
      aria-label={enabled ? `Add voice note to ${site.name}` : `Mark ${site.name} valid to add notes`}
      title={enabled ? "Add voice note" : "Mark the site valid to add notes"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        border: `1px solid ${t.frost}`,
        borderRadius: t.radiusButton,
        background: t.white,
        color: t.edge2,
        cursor: enabled ? "pointer" : "not-allowed",
        opacity: enabled ? 1 : 0.4,
      }}
    >
      <Mic size={14} />
    </button>
  );
}

function FilterBar({ filters, setFilters, shown, total }) {
  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <div className="sbm-sites-filters">
      <TextFilter label="Site" value={filters.name} onChange={(v) => set("name", v)} placeholder="Search name…" />
      <TextFilter
        label="Caller/Contact"
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
export function SitesReviewGrid({ sites, pending, onChoose, canManage = true, onContactsChanged, onDetailsSaved }) {
  const gridRef = useRef(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  /* The recording modal is owned here rather than by the mic cell: every
     decision change rebuilds the row objects, so a cell-local state would
     be thrown away mid-recording. */
  const [noteSite, setNoteSite] = useState(null);
  const [noteNotice, setNoteNotice] = useState("");
  const [contactsSite, setContactsSite] = useState(null);
  const [detailsSite, setDetailsSite] = useState(null);
  /* The POST returns the site's full contact list, so hold it here and let
     it win over the fetched row: the names appear the moment the dialog
     closes rather than after the parent's refetch lands. */
  const [contactsBySite, setContactsBySite] = useState({});
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
    () =>
      (sites ?? []).map((s) => ({
        ...s,
        decision: pending[s.id] ?? null,
        contacts: contactsBySite[s.id] ?? s.contacts ?? [],
      })),
    [sites, pending, contactsBySite]
  );

  const filtered = useMemo(() => {
    const name = filters.name.trim().toLowerCase();
    const caller = filters.caller.trim().toLowerCase();
    const callDateWindow = windowFor(filters.callDate);
    const decisionFilter = DECISION_FILTERS.find((d) => d.id === filters.decision) ?? DECISION_FILTERS[0];

    return rows.filter((s) => {
      if (name && !siteSearchText(s).includes(name)) return false;
      if (caller && !callerLabel(s).toLowerCase().includes(caller)) return false;
      if (!callDateWindow.test(daysAgo(s.discovered_from_call_date))) return false;
      if (!decisionFilter.test(s.decision)) return false;
      return true;
    });
  }, [rows, filters]);

  const openNote = useCallback((site) => {
    setNoteNotice("");
    setNoteSite(site);
  }, []);

  const openContacts = useCallback((site) => setContactsSite(site), []);

  const openDetails = useCallback((site) => setDetailsSite(site), []);

  const saveContacts = async (callerIds) => {
    const contacts = await postSiteContacts(contactsSite.id, callerIds);
    setContactsBySite((current) => ({ ...current, [contactsSite.id]: contacts }));
    // Server truth for every other screen reading this list (and for a
    // later remount of this one) — the local override is only the bridge.
    await onContactsChanged?.();
  };

  /* Same route the site page uses: the memo becomes a call on the site,
     is transcribed, and fans a task out to whoever is assigned. None of
     that is visible from this screen, so say how many people got it
     rather than letting the save look like it only filed an audio clip. */
  const saveNote = async (blob, fileName) => {
    const result = await postSiteVoiceNote(noteSite.id, blob, fileName);
    const count = result?.assignedTo?.length ?? 0;
    setNoteNotice(
      count > 0
        ? `Voice note saved to ${noteSite.name} and assigned to ${count} ${count === 1 ? "person" : "people"}.`
        : `Voice note saved to ${noteSite.name}. No one is assigned to this site yet, so it wasn't given to anyone.`
    );
  };

  const columnDefs = useMemo(() => {
    const decisionCol = {
      headerName: "Is Valid",
      colId: "decision",
      width: narrow ? 128 : 132,
      suppressSizeToFit: true,
      sortable: true,
      cellClass: "sbm-scol-decision",
      /* "" for undecided sorts before "N" and "Y", so one click on this
         header brings everything still needing a judgement to the top. */
      valueGetter: (p) => p.data?.decision ?? "",
      cellRenderer: (p) =>
        p.data?.id ? <ValidSwitch site={p.data} decision={p.data.decision} onChoose={onChoose} /> : null,
    };

    const notesCol = {
      /* Short label on a phone: at the width a 32px button needs, the
         full "Add notes" only ever renders as "ADD N…". */
      headerName: narrow ? "Notes" : "Add notes",
      colId: "notes",
      /* 56 on a phone is the 32px button plus its 8px cell padding and a
         hair over for the "Notes" label — the 12px this gives back to the
         site column is what keeps "No originating call" off the ellipsis
         now that the + shares that line. */
      width: narrow ? 56 : 104,
      suppressSizeToFit: true,
      sortable: false,
      resizable: false,
      cellClass: "sbm-scol-notes",
      cellRenderer: (p) =>
        p.data?.id ? <AddNoteButton site={p.data} decision={p.data.decision} onOpen={openNote} /> : null,
    };

    /* On a phone there isn't room for the evidence columns, so they
       collapse into the site cell as a second line — which is what the
       old card list showed — leaving name, decision and mic side by
       side. The last two are narrow enough to survive the squeeze. */
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
          valueGetter: (p) => siteDisplayName(p.data),
          /* The + sits inline after the caller line rather than at the
             right edge of the cell, where the decision and mic columns
             squeezed it out of the viewport on a phone. Beside the name
             it reads as belonging to the contacts, and it can't be
             clipped: the text ellipsises around it. */
          cellRenderer: (p) => (
            <span
              style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", width: "100%", minWidth: 0 }}
            >
              <span>
                {p.data?.id ? (
                  <SiteNameCell site={p.data} canManage={canManage} onOpenDetails={openDetails} />
                ) : null}
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  minWidth: 0,
                  fontSize: 11,
                  fontWeight: 400,
                  color: t.edge2,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {callerLabel(p.data ?? {})}
                  {p.data?.discovered_from_call_date ? ` · ${fmtShort(p.data.discovered_from_call_date)}` : ""}
                </span>
                {canManage && p.data?.id && (
                  <AssociateButton site={p.data} onAssociate={openContacts} />
                )}
              </span>
              {contactsLabel(p.data ?? {}) && (
                <span style={{ fontSize: 11, fontWeight: 400, color: t.edge2 }}>
                  {contactsLabel(p.data)}
                </span>
              )}
            </span>
          ),
        },
        decisionCol,
        notesCol,
      ];
    }

    return [
      {
        headerName: "Site",
        colId: "name",
        flex: 1,
        minWidth: 120,
        cellClass: "sbm-scol-name",
        valueGetter: (p) => siteDisplayName(p.data),
        cellRenderer: (p) =>
          p.data?.id ? <SiteNameCell site={p.data} canManage={canManage} onOpenDetails={openDetails} /> : null,
      },
      {
        headerName: "Caller/Contact",
        colId: "caller",
        flex: 1.4,
        minWidth: 170,
        cellClass: (p) =>
          p.data?.discovered_from_call_id || (p.data?.contacts ?? []).length > 0
            ? "sbm-scol-caller"
            : "sbm-scol-caller sbm-no-origin",
        /* Sorts and filters on the caller, not the contacts — the column
           is still primarily the provenance of the row. */
        valueGetter: (p) => callerLabel(p.data ?? {}),
        cellRenderer: (p) =>
          p.data?.id ? <CallerCell site={p.data} canManage={canManage} onAssociate={openContacts} /> : null,
      },
      {
        headerName: "Call date",
        colId: "callDate",
        width: 118,
        suppressSizeToFit: true,
        headerComponent: CallDateHeader,
        cellClass: "sbm-scol-calldate",
        valueGetter: (p) => p.data?.discovered_from_call_date ?? "",
        valueFormatter: (p) => (p.value ? fmtShort(p.value) : "—"),
        comparator: (a, b) => (a || "").localeCompare(b || ""),
      },
      decisionCol,
      notesCol,
    ];
  }, [narrow, onChoose, openNote, openContacts, openDetails, canManage]);

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
      {noteNotice && <p style={{ fontSize: 12, color: t.edge2, margin: "0 0 12px" }}>{noteNotice}</p>}
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
      {noteSite && <VoiceNoteModal onClose={() => setNoteSite(null)} onSave={saveNote} />}
      {contactsSite && (
        <AssociateContactsModal
          site={contactsSite}
          existingContactIds={(contactsBySite[contactsSite.id] ?? contactsSite.contacts ?? []).map(
            (c) => c.caller_id
          )}
          onClose={() => setContactsSite(null)}
          onSave={saveContacts}
        />
      )}
      {detailsSite && (
        <SiteDetailsModal
          site={detailsSite}
          /* Title is the name as it stands, so the row you clicked is still
             identifiable once you've edited the field below it. Editable
             here and nowhere else: this is the screen where a name the
             extraction misheard gets corrected. */
          title={detailsSite.name}
          intro="Correct the name if the call got it wrong. Saving marks this site valid and adds it to the confirmed sites list."
          saveLabel="Save site"
          extraPatch={{ is_confirmed: "Y" }}
          editableName
          onClose={() => setDetailsSite(null)}
          onSave={(patch) => onDetailsSaved(detailsSite, patch)}
        />
      )}
    </>
  );
}

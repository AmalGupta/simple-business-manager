/* ------------------------------------------------------------------
   Shared chrome for the two sites grids: the confirmed-sites directory
   (SitesGrid) and the unconfirmed-sites review screen (SitesReviewGrid).

   Extracted rather than giving SitesGrid a `mode` prop, because the two
   share almost no columns and nothing of their row interaction — the
   directory navigates on row click, review toggles a decision — so a
   single component would branch on mode in every callback. What they do
   need to share is the look and the filter vocabulary, which is what
   lives here.

   Conventions inherited from CallsGrid: the legacy quartz CSS themes
   rather than the v33+ Theming API, and one scoped <style> literal
   mapping AG Grid's --ag-* variables onto the app's --color-* tokens.
   Selectors stay .sbm-sites-grid so nothing collides with
   .sbm-calls-grid.
   ------------------------------------------------------------------ */

import { t } from "../../theme.js";
import { daysUntil } from "../../lib/dates.js";
import { TEXT_INPUT_STYLE } from "../../styles.js";

export const SITES_GRID_CSS = `
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
/* Row affordances only where a row actually goes somewhere. The review
   grid's rows aren't navigable — its buttons are the interaction — so
   pointer cursor and lift-on-hover would both be lying. */
.sbm-sites-grid[data-clickable-rows="1"] .ag-row {
  cursor: pointer;
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 160ms ease, background-color 120ms ease;
  transform-origin: center center;
}
@media (hover: hover) {
  .sbm-sites-grid[data-clickable-rows="1"] .ag-row:hover {
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
/* The site name as a link: inherits the cell's own weight and colour so
   the column still reads as a column, with the underline as the only hint
   that it opens something until you hover. */
.sbm-sites-grid .sbm-site-link {
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  text-decoration: underline;
  /* Slate, not the hairline colour used for borders — at #E4E7EC on white
     the underline was invisible at arm's length, which for the row's only
     affordance is the same as not having one. */
  text-decoration-color: var(--color-slate);
  text-underline-offset: 3px;
}
.sbm-sites-grid .sbm-site-link:hover {
  color: var(--color-accent);
  text-decoration-color: var(--color-accent);
}
/* AG Grid's autoHeight wrapper defaults to min-width:auto, so it refuses
   to shrink below its content and a long caller line pushes the row's +
   out over the next column instead of ellipsing. Only the name cell uses
   autoHeight, and only on a phone, but the reset is harmless elsewhere. */
.sbm-sites-grid .sbm-scol-name.ag-cell,
.sbm-sites-grid .sbm-scol-name .ag-cell-wrapper,
.sbm-sites-grid .sbm-scol-name .ag-cell-value {
  min-width: 0;
}
.sbm-sites-grid .sbm-scol-open,
.sbm-sites-grid .sbm-scol-activity,
.sbm-sites-grid .sbm-scol-discovered,
.sbm-sites-grid .sbm-scol-calldate,
.sbm-sites-grid .sbm-scol-target {
  font-variant-numeric: tabular-nums;
  color: var(--color-slate);
}
.sbm-sites-grid .sbm-scol-contacts,
.sbm-sites-grid .sbm-scol-caller {
  color: var(--color-slate);
}
/* A site the pipeline didn't discover has no caller to show. Muted
   further than a normal empty cell so it reads as "no evidence exists"
   rather than "evidence is missing". */
.sbm-sites-grid .sbm-scol-caller.sbm-no-origin {
  font-style: italic;
  opacity: 0.75;
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
/* The decision and notes cells hold controls rather than text, so they
   opt out of the flex centering above and manage their own layout. */
.sbm-sites-grid .sbm-scol-decision {
  padding-top: 0;
  padding-bottom: 0;
  /* Tighter than the grid default so the switch and its caption fit the
     column without the caption ellipsing on a phone. */
  padding-left: 10px;
  padding-right: 10px;
}
.sbm-sites-grid .sbm-scol-notes {
  padding-top: 0;
  padding-bottom: 0;
  justify-content: center;
}
/* The mic column is sized by its 32px button, so the default cell padding
   would eat the header label. Applies to the header too, otherwise the
   label ellipses to "ADD N…". */
.sbm-sites-grid .sbm-scol-notes,
.sbm-sites-grid .ag-header-cell[col-id="notes"] {
  padding-left: 8px;
  padding-right: 8px;
}
.sbm-sites-grid .ag-header-cell[col-id="notes"] .ag-header-cell-label {
  justify-content: center;
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

/* Shared by every date filter on both grids. `test` takes whole days-ago.
   "Over 30 days" and "Nothing recorded" are expressed as windows rather
   than a second input, so the whole control stays a single select. */
export const DATE_WINDOWS = [
  { id: "any", label: "Any time", test: () => true },
  { id: "7", label: "Last 7 days", test: (days) => days !== null && days <= 7 },
  { id: "30", label: "Last 30 days", test: (days) => days !== null && days <= 30 },
  { id: "over30", label: "Over 30 days", test: (days) => days !== null && days > 30 },
  { id: "none", label: "Nothing recorded", test: (days) => days === null },
];

/** Whole days between an ISO date/timestamp and today, or null if absent. */
export function daysAgo(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return -daysUntil(String(iso).slice(0, 10));
}

export function windowFor(id) {
  return DATE_WINDOWS.find((w) => w.id === id) ?? DATE_WINDOWS[0];
}

export function TextFilter({ label, value, onChange, placeholder }) {
  return (
    <label>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...TEXT_INPUT_STYLE, minWidth: 150 }}
      />
    </label>
  );
}

export function SelectFilter({ label, value, onChange, options }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={TEXT_INPUT_STYLE}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateWindowFilter({ label, value, onChange }) {
  return <SelectFilter label={label} value={value} onChange={onChange} options={DATE_WINDOWS} />;
}

export function FilterCount({ shown, total }) {
  return (
    <span style={{ alignSelf: "flex-end", fontSize: 12, color: t.edge2, paddingBottom: 12 }}>
      {shown === total ? `${total} site${total === 1 ? "" : "s"}` : `${shown} of ${total}`}
    </span>
  );
}

# Component refactor plan — grids, dialogs, search, performance

Status: **proposed, not started.** Audit of `web/src` as of `a1a50bc` (2026-09-27).
Scope is the dashboard only; the Worker, `packages/core` and the API contracts don't change.

The acceptance criteria are the same as every visual refactor (`CLAUDE.md` "Dashboard behavioral fidelity"): the four todo states, calendar/day drilldown and CSV export behave the same after each phase. Look and interaction may converge on one pattern; data and behavior may not change.

---

## 1. What the audit found

### 1.1 Grids — 8 AG Grid instances, 5 different setups

`web/src/components/ag-grid/AgGridShell.jsx` exists and its CSS header says new grids "MUST use AgGridShell". Only one grid does (`ResolvedCallsView`). The other seven each re-implement it:

| Grid | File | Shell? | Row h (wide/narrow) | Header h | Hover | Search / filter | Paging |
|---|---|---|---|---|---|---|---|
| Calls | `views/calls/CallsGrid.jsx` | no, own CSS string | 64 / 74 | 46 | none | `CallsFilterBar` + `CallerMultiSelect` | client, custom pager |
| Sites | `views/sites/SitesGrid.jsx` | no, `SITES_GRID_CSS` | 56 / 64 | 46 | scale + tint | `TextFilter` ×2 + date window | none |
| Sites review | `views/sites/SitesReviewGrid.jsx` | no, `SITES_GRID_CSS` | 56 / 64 | 46 | none | `TextFilter` ×2 + selects | none |
| Contacts | `views/callers/CallersDirectoryView.jsx` | no, `.css` file | 48 | — | — | one inline "Search" box, **server-side, no debounce** | server |
| Maintenance contacts | `views/maintenance/MaintenanceSiteContactView.jsx` | no, reuses contacts CSS | 48 | — | — | AG column filters (`filter: true`) | none |
| Requests | `views/requests/RequestForm.jsx` | no, `REQUESTS_GRID_CSS` | 48 | 42 | tint | none | none |
| Associate contacts (in a dialog) | `views/sites/AssociateContactsModal.jsx` | no, `CONTACTS_GRID_CSS` | 44 | 42 | tint | inline input, client-side | none |
| Resolved calls | `views/calls/ResolvedCallsView.jsx` | **yes** | 48 | 42 | tint | none | none |

Repeated in every one of those files:

- `ModuleRegistry.registerModules([AllCommunityModule])` plus the two quartz CSS imports.
- The same `narrow` `matchMedia("(max-width: 640px)")` effect (copied 5×, a sixth variant in `CallsPageView`).
- `onGridReady` / `onGridSizeChanged` / effect calling `sizeColumnsToFit()`.
- A `--ag-*` → `--color-*` token-mapping block (4 copies with drifting values: header `#DCE6FF` everywhere, but cell padding 12 vs 14, header 42 vs 46).
- The `[data-inner-scrolls]` / `[data-horizontal-scrolls]` height fix — the exact code the Shell's comment warns "is how grids collapse to ~0px repeatedly".
- The "clickable cell inside a clickable row" workaround (`data-sbm-open-todos` + `closest()` check) in `SitesGrid`, reinvented differently in `CallsGrid`.

So the user-visible symptoms are real: a row is 44, 48, 56, 64 or 74px tall depending on the screen, hover lifts on one grid and does nothing on the next, and the filter bar sits in a different place with a different control on each.

### 1.2 Dialogs — one shared `Modal`, 7 dialogs still bypass it, the rest diverge inside it

`components/Modal.jsx` gives backdrop, Escape and focus restore. Using it: `EditContactModal`, `SiteDetailsModal`, `ManageAliasesModal`, `AssignTodoSiteModal`, `AddPeopleModal`, `VoiceNoteModal`, `AssociateContactsModal`.

Still hand-rolled (fixed backdrop, **no Escape, no focus handling**): `AddCallerModal`, `PromoteStaffConfirmModal`, `AddStaffModal`, `DeleteStaffModal`, `ResetPinModal`, `UpdatePhoneModal`, `CallDetailModal` (has its own Escape).

Inside `Modal`, the two dialogs named in the request differ in everything the shell doesn't own:

| | Site details (`SiteDetailsModal`) | Edit contact (`EditContactModal`) |
|---|---|---|
| Width | 420 | 480 |
| Title | `title` prop → shared heading | no `title`; own heading markup |
| Field label | local `labelStyle` (600, 0.06em) | local `LABEL` (700, 0.04em) |
| Cancel button | `SMALL_SECONDARY_BUTTON_STYLE`-ish inline | fully inline style literal |
| Save state | `saving` / "Saving…" / `saveLabel` | `busy` / "Saving…" / "Save" |
| Error | `t.signal` span | `t.signal` span (same, copied) |
| Dirty check | only changed fields PATCHed; no-op closes | always PATCHes name/phone/type, then site links and aliases one request at a time (serial `await` in loops) |
| Site picker | — | own inline search + list over `loadConfirmedSites()` |
| Contact picker | delegates to `AssociateContactsModal` (grid + search) | — |

The field-label style alone is copied into ~10 files with two different weights/letter-spacings (DESIGN_LANGUAGE.md fixes it at 700 / 0.04em).

### 1.3 Search — six behaviors for one idea

| Where | Match rule | Phone match | Where it runs | Debounce | Count shown |
|---|---|---|---|---|---|
| Sites grid | display name + raw name, `includes` | contact phone, raw digits | client | no | "N of M" |
| Sites review | name / caller label | no | client | no | "N of M" |
| Contacts directory | server `q` | server | **server, every keystroke** | **no** | total |
| Associate contacts | name/phone | yes | client | no | "Showing N of M" |
| Edit contact → site picker | `siteSearchText` | — | client | no | — |
| Assign todo → site picker | own | — | client | no | — |
| Add people (staff) | name / phone `includes` | raw digits | client | no | — |
| Caller multi-select | name `includes` | no | client | no | — |

`lib/contactMatch.js` already has `normalizePhone` (strip non-digits, last 10) but only the ranking code uses it — typing `98765 43210` finds nothing in most boxes.

### 1.4 Performance

`pnpm build` today:

```
dist/assets/index-*.js    1,691 kB  (gzip 468 kB)   ← one chunk, every screen
dist/assets/index-*.css     315 kB  (gzip  52 kB)
```

- **No code splitting.** `Dashboard.jsx` statically imports ~45 views; a staff member opening the site-visit flow on a phone downloads every admin grid.
- **`AllCommunityModule`** registers every AG Grid Community feature (charts-free, but still integrated charts hooks, CSV/row-grouping, all filters, all editors…). The grids use: client-side row model, sorting, text filter (one grid), pagination, row selection, cell renderers, tooltips (disabled). Registering only those cuts AG Grid's share substantially.
- **Legacy `ag-grid.css` + `ag-theme-quartz.css`** make up most of the 315 kB CSS; AG Grid v33+ Theming API (`themeQuartz.withParams`) replaces both with a JS theme that ships only what's used.
- Contacts search fires one request per keystroke (see 1.3).
- `Dashboard.jsx` holds ~30 `useState`s at the root, so every tile count update re-renders the entire tree; none of the view components are memoized. Not a hotspot today, but it's why the home screen re-renders on each summary refresh.

### 1.5 Divergence from the documented stack (flag, not necessarily fix)

`CLAUDE.md` / `SCAFFOLDING.md` §7 prescribe Tailwind v4, `motion`, `react-router` v7, `lucide-react`, and "no component library". What actually ships: inline style objects + `theme.js` tokens, no router (a `view` state machine in `Dashboard.jsx`), no `motion`, `lucide-react` present, and **AG Grid** (a component library with its own visual opinions, which is exactly why every grid has a 100-line override block). This plan doesn't reverse AG Grid — it's load-bearing and working — but the docs should be updated to say so, and the router question is taken up in Phase 5.

---

## 2. Target component set

New/changed files, all under `web/src/components/`:

```
components/
├── grid/
│   ├── DataGrid.jsx          # the one AG Grid wrapper (replaces AgGridShell)
│   ├── gridTheme.js          # themeQuartz.withParams(...) from theme tokens — one place
│   ├── gridModules.js        # explicit module list instead of AllCommunityModule
│   ├── GridToolbar.jsx       # filter bar layout + result count ("N of M")
│   └── cells.jsx             # LinkCell, CountLinkCell, DateAgoCell, BadgeCell
├── form/
│   ├── Field.jsx             # label + control + hint/error, the DESIGN_LANGUAGE label style
│   ├── Button.jsx            # primary / secondary / danger, busy state built in
│   └── SearchInput.jsx       # debounced, clear button, aria-label, Esc clears
├── dialog/
│   ├── Modal.jsx             # (moved) + size="sm|md|lg" instead of raw widths
│   ├── FormDialog.jsx        # title, body, error slot, Cancel/Save footer, busy, dirty-close
│   └── ConfirmDialog.jsx     # destructive/confirm prompts (Delete staff, Promote)
├── pickers/
│   ├── EntityPicker.jsx      # search + scrollable checklist/single-select, used by all pickers
│   ├── SitePicker.jsx        # EntityPicker over confirmed sites
│   ├── ContactPicker.jsx     # EntityPicker over callers (Associate contacts)
│   └── StaffPicker.jsx       # EntityPicker over roster (Add people)
hooks/
├── useIsNarrow.js            # the matchMedia(640px) effect, once
├── useDebouncedValue.js
└── useListFilter.js          # client-side filter + count over a search spec
lib/
└── search.js                 # normalizeText, normalizePhone (moved from contactMatch), matchAny()
```

### 2.1 `DataGrid` — one grid behavior

```jsx
<DataGrid
  rows={filtered}
  columns={columnDefs}
  getRowId={(r) => r.id}
  onRowClick={(row) => onOpenSite(row.name)}   // omit → rows not clickable, no hover lift
  density="comfortable"                         // "compact" (dialogs, 44px) | "comfortable" (48/56px)
  innerScrolls={innerScrolls}
  horizontalScrolls={horizontalScrolls}
  emptyText="No sites match these filters."
  pageSize={50}                                 // optional; client pagination with shared pager
/>
```

Owns, so no view does it again: module registration, theme, `domLayout` from `innerScrolls`, `sizeColumnsToFit` on ready/resize/narrow change, `resetRowHeights` on data change, narrow row height, row-click-vs-cell-click arbitration (a cell renderer marks itself `data-grid-action` and row clicks skip it), tooltip suppression, empty overlay, one hover treatment (tint, no scale — the scale lift fights `autoHeight` rows and appears on one grid only).

Density rule: **one row height per density**, not per screen — `comfortable` = 56 wide / 64 narrow (sites, calls, contacts, requests, resolved), `compact` = 44 (grids inside dialogs). Calls' two-line cells keep their height via `autoHeight`, not a special row height.

### 2.2 `FormDialog` — one dialog behavior

```jsx
<FormDialog
  title="Edit site details"
  size="md"
  onClose={onClose}
  onSubmit={submit}           // async; FormDialog shows "Saving…", disables, catches → error slot
  submitLabel="Save details"
  dirty={isDirty}             // Esc/backdrop on a dirty form asks "Discard changes?"
>
  <Field label="H.No"><input … /></Field>
  …
</FormDialog>
```

Uniform across every edit dialog: same title position, same field label, same footer order (Cancel left of primary, right-aligned), Enter submits, Esc closes (with discard guard when dirty), focus goes to the first field, error text in one place, busy state identical, and "nothing changed → close without a request" (the rule `SiteDetailsModal` already has, extended to Edit contact so it stops writing no-op PATCHes).

Sizes: `sm` 360 (prompts, PIN, phone), `md` 480 (edit forms — Site details and Edit contact both become 480), `lg` 720 (Associate contacts, Call detail).

### 2.3 `SearchInput` + `lib/search.js` — one search behavior

- 200 ms debounce for server-backed search (Contacts); client lists filter on `useDeferredValue` so typing never blocks.
- Case- and whitespace-insensitive; phone digits normalized on both sides via `normalizePhone` (so `98765 43210`, `+91-9876543210`, `9876543210` all match).
- Site search always goes through `siteSearchText` (display name + pipeline name).
- Same placeholder pattern ("Search name or phone…"), a clear (×) button, Esc clears, result count shown in the same toolbar slot ("12 of 140").
- Resets the grid to page 1 on change (Contacts does this ad hoc today).

---

## 3. Phased plan

Each phase is one PR (dual-landed per `docs/BRANCHING.md`), builds on the last, and ends with the same check: `pnpm typecheck && pnpm build`, then click through at 360px and desktop — calls grid, sites grid, sites review, contacts, the four todo states, calendar/day drilldown, CSV export.

### Phase 0 — Performance quick wins (low risk, biggest user-visible gain)
1. Route-level code splitting: `React.lazy` + `Suspense` for every full-screen view in `Dashboard.jsx` (Calls, Sites, Sites review, Contacts, Staff, Maintenance, Requests, Site visit flow, Material, Complaints, Pending work, Schedule). Home tiles stay eager.
2. `manualChunks`: `react`, `ag-grid`, app — so AG Grid is cached separately and only fetched when a grid screen opens.
3. `gridModules.js`: replace `AllCommunityModule` with the explicit modules in use; register once.
4. Debounce Contacts search (200 ms).

Target: initial JS for the home screen **< 400 kB raw / < 130 kB gzip** (from 1,691 / 468). Measured from `pnpm build` output; recorded in the PR.

### Phase 1 — Foundations (no screen changes yet)
`useIsNarrow`, `useDebouncedValue`, `lib/search.js`, `Field`, `Button`, `SearchInput`, `gridTheme.js` (Theming API from tokens), `DataGrid`. Add the label style to `styles.js` as the single `FIELD_LABEL_STYLE`. Nothing imports them yet except `ResolvedCallsView` (migrated from `AgGridShell` as the proving ground).

### Phase 2 — Grids converge
Migrate in order of risk, one commit each: Requests → Maintenance contacts → Sites → Sites review → Contacts → Associate contacts → Calls (last: pagination, caller multi-select, the most bespoke cells). Delete `SITES_GRID_CSS`, `REQUESTS_GRID_CSS`, `CONTACTS_GRID_CSS`, the calls CSS literal, `CallersDirectoryView.css`'s grid rules, `AgGridShell*`, and the legacy quartz CSS imports. `sitesGridChrome.jsx` keeps only site-domain helpers (`siteDisplayName`, `SiteDisplayName`, `siteDetailsPrefill`, date windows) and moves to `lib/sites.js` + `components/grid/cells.jsx`.

Every filter bar becomes `GridToolbar` + `SearchInput` / `SelectFilter`, count on the right.

### Phase 3 — Dialogs converge
1. Move the 7 hand-rolled dialogs onto `Modal` (gets Escape + focus for free): `AddCallerModal`, `AddStaffModal`, `ResetPinModal`, `UpdatePhoneModal` → `FormDialog`; `DeleteStaffModal`, `PromoteStaffConfirmModal` → `ConfirmDialog`; `CallDetailModal` → `Modal size="lg"`.
2. Rebuild `SiteDetailsModal` and `EditContactModal` on `FormDialog` + `Field`, same width, same footer, same dirty/no-op rule.
3. Pickers: `EditContactModal`'s inline site list, `AssignTodoSiteModal`'s site list, `AddPeopleModal`'s staff list and `CallerMultiSelect` all become `EntityPicker` variants; `AssociateContactsModal` keeps its grid but its search moves to `SearchInput`.

### Phase 4 — `Dashboard.jsx` decomposition (performance + maintainability)
Split the 1,368-line root: `useSession` (me/login), `useHomeSummary` (the ~12 count states + refresh), `useCalendar`, `useStaffTabs`. Views receive only what they read; memoize tiles. Removes whole-tree re-renders on each summary refresh.

### Phase 5 — Architecture decisions to take with you (not started without a yes)
| Decision | Recommendation | Why |
|---|---|---|
| Router | **Adopt `react-router` v7** (already in the documented stack) after Phase 4 | Real URLs for `/sites/:id`, `/calls/:id`, `/contacts`; back button works on phone; lazy routes fall out naturally. Replaces the `view` state machine — biggest behavior-risk item, so last. |
| Server state | Keep `createSwrCache` in `lib/api.js`; wrap it in one `useSwr(key, loader)` hook | It already does stale-while-revalidate; ten views hand-roll the same get-cached → setState → load → setState dance. No new dependency. |
| Styling | **Don't** do the Tailwind migration now; keep tokens + shared style objects | The inline-style + token approach works and the components above remove most duplication. Tailwind is a separate, whole-app skin project. Update `CLAUDE.md`/`SCAFFOLDING.md` §7 to describe reality. |
| AG Grid | Keep; document it as the one sanctioned "library with opinions", themed only through `gridTheme.js` | Rewriting eight grids by hand to honor "no component library" costs more than it saves. |
| Contacts search on server vs. client | Keep server (directory can be large); other lists stay client-side | Same UX via `SearchInput`, different transport. |

---

## 4. Risks and how each phase guards them

- **Row-click semantics** (Sites: name navigates, Open count opens todos popup; Sites review: rows don't navigate). `DataGrid`'s `onRowClick` omitted ⇒ non-clickable; action cells use `data-grid-action`. Verified per grid on migration.
- **`inner_scrolls` / `horizontal_scrolls` customization** — the historical "grid collapses to 0px" bug. Owned solely by `DataGrid`; each migration is checked with both toggles on and off.
- **Danger-red rule** — `sbm-missed` target-date styling moves into `DateCell` with the same condition; no other cell may use `--color-danger`.
- **Lazy loading + `StrictMode`** — Suspense fallback is the existing `EmptyState` loading look so there's no flash of a different design.
- **Dual-landing** — each phase is small enough to cherry-pick cleanly onto `release/*`.

## 5. Size estimate

| Phase | Files touched | Net lines | Effort |
|---|---|---|---|
| 0 Perf | ~12 | +80 | 0.5 day |
| 1 Foundations | ~12 new | +700 | 1 day |
| 2 Grids | 10 | −900 | 2 days |
| 3 Dialogs | 14 | −600 | 1.5 days |
| 4 Dashboard split | 5 | ±0 | 1 day |
| 5 Router | ~50 | +200 | 2 days (after approval) |

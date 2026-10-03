# UX consistency audit — by business object

Status: **findings only, nothing changed.** Audit of `web/src` at `e78aad7` (2026-10-03). Companion to `docs/COMPONENT_REFACTOR_PLAN.md`: that doc covers *how* to build shared components; this one lists *what* has to look and behave the same, grouped by the business object the user sees.

For each object: every place it appears, what each place shows and lets you do, and the gaps. The last column of each "where" table is the inconsistency to fix.

---

## 1. Site

### Where a site appears

| # | Surface | File | Name shown as | Click does | Extra info shown |
|---|---|---|---|---|---|
| S1 | Sites directory grid | `views/sites/SitesGrid.jsx` | display name (`SiteDisplayName`, "\| CL." styling) | opens site page | unread badge, contacts, last activity, open count → popup |
| S2 | Sites review grid | `views/sites/SitesReviewGrid.jsx` | display name | nothing (row not clickable) | caller, discovered date, decision toggle, voice note |
| S3 | Site page header | `views/sites/SiteView.jsx` | display name | — | details card, team, contacts, timeline |
| S4 | Calls grid "Site" column | `views/calls/CallsGrid.jsx` | `recorded_for_site_name` (raw) | opens site page | — |
| S5 | Contacts grid "Sites" column | `views/callers/CallersDirectoryView.jsx` | **raw `site.name`** | **filters the contacts grid** (does not open the site) | — |
| S6 | Edit contact → linked sites | `views/callers/EditContactModal.jsx` | display name | — | — |
| S7 | Assign todo → site picker | `views/calls/AssignTodoSiteModal.jsx` | display name | selects | — |
| S8 | Todo row "site" tag (Calls needing action card) | `views/calls/CallActionCard.jsx` | **raw `todo.site_name`** | nothing | — |
| S9 | Call detail modal todo "Site: …" | `views/calls/CallDetailModal.jsx` | **raw** | nothing | — |
| S10 | Pending work list | `views/home/PendingWorkView.jsx` | **raw `task.site_name`** | opens site page | — |
| S11 | Workflow category site list | `views/home/WorkflowCategorySiteList.jsx` | **raw** | opens site page | — |
| S12 | My schedule | `views/home/MyScheduleView.jsx` | **raw** (as sub-line) | opens site page | — |
| S13 | Escalations tile | `views/home/EscalationsTile.jsx` | **raw** | nothing | — |
| S14 | Complaints list | `views/site-visit/ComplaintsHomeView.jsx` | **raw**, "Unknown site" fallback | nothing | — |
| S15 | Material shortages | `views/material/MaterialShortagesView.jsx` | **raw** | nothing | — |
| S16 | Site visit site list (staff) | `views/site-visit/SiteVisitSiteList.jsx` | **raw** | starts visit | — |
| S17 | Site visit category / installation / complaint headers | `views/site-visit/*.jsx` | **raw** | — | — |
| S18 | Associate contacts dialog title | `views/sites/AssociateContactsModal.jsx` | **raw** | — | — |
| S19 | Site open-todos popup | `views/sites/SiteOpenTodosPopup.jsx` | display name | — | — |
| S20 | Stage assign / My task banner / staff directory site lists | `StageAssignRow`, `MyTaskBanner`, `StaffDirectoryView` | **raw** | varies | — |
| S21 | Maintenance site-contact grid | `views/maintenance/MaintenanceSiteContactView.jsx` | display name, raw fallback | — | — |

### Gaps
1. **Two names for one site.** 6 surfaces use the display name ("NOBEL Aurelia | SECTOR 88-MOHALI"); ~15 use the raw pipeline name. The same site reads differently on the home tiles, staff screens and dialogs than on the Sites grid and site page.
2. **Clicking a site name does four different things:** opens the site (S1, S4, S10–12), filters a grid (S5), starts a visit (S16), or nothing (S8, S9, S13–15). Rule needed: a site name is always a link to the site page, except inside a picker.
3. **No standard site summary.** The grid shows contacts + last activity + open count; the site page shows address, legacy "Point of contact" (`poc_name`) *and* linked contacts as two separate sources; review shows caller + discovered date. There is no compact "site chip/card" reused across surfaces.
4. **Open todos for a site** are visible from the grid's Open count popup but **not on the site page itself** (admins see none there; staff see only their workflow tasks via `MyTaskBanner`).
5. **Target closure missed:** red on the site page and the review grid; not shown on Sites grid rows, home tiles or staff lists.
6. **Unread badge** exists only on the Sites grid.

---

## 2. Todo (call todo) and Task (site workflow task)

The app has **two kinds of "to do"** that users will see as one idea:
- **Call todos** — extracted from calls (`todos` table): open / done / snoozed ("parked"), due date, owner, assignees, optional site.
- **Site tasks** — workflow stages assigned to staff (`site_tasks`): open / done, due date, assignee, always a site.

### Where call todos appear

| # | Surface | File | Check off | Due date | Assignee | Assign / reassign | Assign to site | Voice note | Park | Grouped by call |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Open tasks list | `OpenTodosView` → `OpenTodoCard` | ✓ | ✓ (earliest, card head) | ✓ | ✓ | ✓ | — | — | ✓ |
| T2 | My call tasks | `MyOpenTodosView` → `OpenTodoCard` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| T3 | Call detail page | `CallDetail` → `OpenTodoCard` | ✓ | ✓ | ✓ | ✓ (admin) | **—** | — | — | one call |
| T4 | Call detail modal (from Calls grid) | `CallDetailModal` → `TodoRow` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | one call |
| T5 | Calls needing action card | `CallActionCard` (own markup) | **— (no checkbox)** | **—** | ✓ | ✓ | ✓ | ✓ | — | one call |
| T6 | Site open-todos popup | `SiteOpenTodosPopup` → `OpenTodoCard` | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ |
| T7 | Voice memo detail (site timeline) | `VoiceMemoDetail` → `TodoRow readOnly` | **read-only** | ✓ | ✓ | ✓ | — | — | — | one memo |
| T8 | My schedule | `MyScheduleView` (own markup, merged with site tasks) | — | ✓ | — | — | — | — | — | — |
| T9 | Day drilldown cards | `DayView` → `CallCard` → `TodoRow` | ✓ | ✓ | — | — | — | — | (prop exists, unused) | ✓ |

### Where site tasks appear
`PendingWorkView`, `WorkflowCategorySiteList`, `MyTaskBanner` (site page, staff), `MyScheduleView`, `StaffScheduleTile`, `StageAssignRow`, work-timeline popup — each with its own row markup.

### Gaps
1. **Same todo, different powers per screen.** You can voice-note a todo only from the Calls-needing-action card and site popup; assign to site everywhere except the call page and the site popup; check it off everywhere except the Calls-needing-action card. A user can't predict what a todo row lets them do.
2. **Three todo renderings:** `TodoRow` (two internal variants: plain and `embedded`), `OpenTodoCard`, and `CallActionCard`'s own markup — plus `MyScheduleView`'s own row. Due-date chip, done styling and urgent red differ between them.
3. **"Parked" (snoozed) is displayed but cannot be set anywhere.** `TodoRow` renders the parked state, the API accepts it (`src/handlers/api.ts`), but no surface has a Park control — `CallCard.onPark` is accepted and never used. This is one of the four todo states listed as an acceptance criterion in `CLAUDE.md`.
4. **`DayView` / `CallCard` appear to be unmounted** (no import outside their own files); the calendar now opens `CallsNeedingActionView`. Confirm and delete, or re-wire — either way the day drilldown's todo rendering is T5, which lacks a checkbox.
5. **Call todos vs site tasks look unrelated** although `MyScheduleView` merges them into one list. Need one task row with a "source" tag (call / site stage) and identical status, due and assignee treatment.
6. **Assignee display:** "Unassigned" text in `TodoFacts`, the `TodoAssignControl` menu elsewhere, nothing in T8/T9.
7. **Sorting:** newest call first (T1/T2), earliest due (card head), extraction order (T3–T5), due date (T8). Pick one default.

---

## 3. Contact (caller)

### Where a contact appears

| # | Surface | File | Shows | Phone | Edit |
|---|---|---|---|---|---|
| C1 | Contacts directory grid | `CallersDirectoryView` | name, type, sites, aliases | text | Edit contact modal |
| C2 | Edit contact | `EditContactModal` | name, phone, type, sites, aliases | input | — |
| C3 | Add caller | `AddCallerModal` (hand-rolled dialog) | name, phone, type | input | — |
| C4 | Manage aliases | `ManageAliasesModal` | aliases | — | — |
| C5 | Associate contacts (site) | `AssociateContactsModal` (grid) | name, phone, suggestion rank | text | — |
| C6 | Site page "Contacts" | `SiteView` | name, phone, Remove | text, "no phone" | — |
| C7 | Site details modal | `SiteDetailsModal` | linked list read-only | text | via C5 |
| C8 | Site page details card | `SiteView` | legacy `poc_name` / `poc_contact_number` | text, "Contact: …" | via site details |
| C9 | Call surfaces (grid, detail page, modal, action card, todo cards) | `CallsGrid`, `CallDetail`, `CallDetailModal`, `CallActionCard`, `OpenTodoCard` | `client_name` or "Unknown caller" | **tap-to-call only on CallDetail page** | — |
| C10 | Caller multi-select filter | `CallerMultiSelect` | name | — | — |
| C11 | Maintenance site-contact grid | `MaintenanceSiteContactView` | site ↔ contact mapping | text | inline |
| C12 | Promote to staff | `PromoteStaffConfirmModal` (hand-rolled) | name, login | — | — |

### Gaps
1. **A contact name is never a link.** From a call, todo or site you cannot get to that contact's record; editing is only reachable from the Contacts grid.
2. **Phone numbers:** tappable (`PhoneLink`) in one place only; elsewhere plain text with three empty texts ("no phone on file", "no phone", "—").
3. **Site's contact has two sources** (C6 linked contacts vs C8 legacy POC fields) shown side by side on the site page.
4. **Add vs Edit contact are different dialogs** with different fields, layout and dialog shell (C3 hand-rolled, C2 on `Modal`).
5. **Type (client/vendor/staff/…)** is shown only in the Contacts grid, never next to the name on call/todo surfaces.

---

## 4. Call

### Where a call appears

| # | Surface | Opened from | Audio | Transcript | Summary | Takeaways / unresolved / commitments / material | Todos | Resolve |
|---|---|---|---|---|---|---|---|---|
| K1 | Calls grid row | Calls page | — | — | — | — | count | — |
| K2 | **Call detail modal** | Calls grid | ✓ | ✓ | ✓ | **—** | ✓ (T4) | — |
| K3 | **Call detail page** | site timeline, open tasks, resolved, schedule, my tasks | ✓ | ✓ | ✓ | ✓ | ✓ (T3) | — |
| K4 | **Calls needing action card** | home tile, calendar | ✓ | ✓ (collapsible) | ✓ | **—** | ✓ (T5) | ✓ |
| K5 | Resolved calls grid | home tile | — | — | — | — | — | — |
| K6 | Site timeline entry | site page | voice memos only | voice memos only | ✓ | unresolved | — | — |
| K7 | Open todo card header | open tasks lists | — | — | — | unresolved | ✓ | — |

### Gaps
1. **Three different "call detail" views** (K2 modal, K3 page, K4 card) with different content. Opening the same call from the Calls page vs from a todo shows different information (the modal has no takeaways/commitments/material needs; the page has no site assign for todos and no Resolve).
2. **Modal vs page:** from the Calls grid a call opens in a dialog; from everywhere else it navigates to a page. Pick one.
3. **Call header** (name, date, duration, type badge, waiting tag) is built three times: `CallTypeBadge` only in the modal, `PhoneLink` only on the page, duration missing on the action card.
4. **Resolve** exists only on K4; a call can't be resolved from its own detail page.

---

## 5. Voice note / recording

| # | Kind | Recorded from | Recorder UI | Transcribed | Played back where |
|---|---|---|---|---|---|
| V1 | Call recording | phone / upload | — | ✓ | K2, K3, K4 |
| V2 | Desk conversation | header mic `DeskConversationMic` | `VoiceNoteModal` | ✓ (becomes a call) | as a call |
| V3 | Site voice memo | site page `SiteMediaUploadRow` | `VoiceNoteModal` | ✓ | site timeline (inline player + `VoiceMemoDetail`) |
| V4 | Review-site voice note | `SitesReviewGrid` mic cell | `VoiceNoteModal` | ✓ (site memo) | site timeline |
| V5 | Todo voice note | `TodoVoiceNoteButton` (T5, T6) | `VoiceNoteModal` | **✗** | under the todo, T5/T6 only |
| V6 | Installation checklist note | `InstallationScreen` | `VoiceNoteModal` | ? | **"Voice note recorded" label, no player** |
| V7 | Complaint note | `SiteComplaintForm` | **own inline recorder** (Record / Re-record) | ? | preview only; **not playable in Complaints list or Escalations tile** |
| V8 | Request / issue report | `RequestForm` | `VoiceNoteModal` | ? | requests grid |

### Gaps
1. **Recorder:** `SiteComplaintForm` has its own recorder; everything else uses `VoiceNoteModal`. Button labels vary: "Add voice note", "Record voice note", "Record request", mic-only icon.
2. **Playback:** a voice note recorded in one place often can't be heard where its result shows up (complaint → Escalations/Complaints; installation note → nowhere; material short → Material shortages).
3. **Transcription is inconsistent and invisible to the user** — site memos are transcribed, todo notes aren't, others unclear. Each voice note should show the same block: player + transcript (or "not transcribed" / "transcribing…").
4. Native `<audio controls>` everywhere (fine), but player width/margins differ by container.

---

## 6. Staff / team member

Appears in: Staff directory (`StaffDirectoryView`, cards — not a grid), Add / Delete staff dialogs (hand-rolled), Add people to site (`AddPeopleModal`, own search list), site page Team list, `TodoAssignControl` (assign menu), `StageAssignRow`, home staff tabs (`HomeDashboardTabs`), `StaffHomePanel`.

### Gaps
1. Staff directory is a card list while Contacts/Sites are grids — same "directory" concept, different layout.
2. Staff picker is implemented separately in `AddPeopleModal`, `TodoAssignControl` and `StageAssignRow`.
3. Phone empty text "no phone on file" (team list) vs others.
4. A staff name never links to that person's view (schedule / tasks), though the home tabs show it exists.

---

## 7. Complaint / escalation

Appears in: `EscalationsTile` (home), `ComplaintsTile` + `ComplaintsHomeView`, `SiteComplaintForm`, installation checklist "Complaints" row (dual-writes to `escalations`).

### Gaps
1. Two names: staff complaints are written into the `escalations` table (SCAFFOLDING.md, migration 0016) but surface as "Escalations" on the admin tile and "Complaints" in the complaints view.
2. Closing differs: the tile has a Close button per row; the complaints view shows an Open/Closed status label instead.
3. Voice note behind a complaint is not playable from either list (see V7).

## 8. Material shortage

Appears in: `MaterialShortagesTile`, `MaterialShortagesView`, installation "Material Short" row. Site name raw (S15), no link to site or installation, no voice playback.

---

## 9. Cross-cutting UI elements

| Element | Today | Needs |
|---|---|---|
| **Dialogs** | 14 dialogs: 7 on `Modal`, 7 hand-rolled; widths 360/420/480; three label styles; Cancel/Save order and styling differ (see refactor plan §1.2) | One `FormDialog` / `ConfirmDialog`, three sizes |
| **Cards** | `Card` used in 47 files, but call cards (`CallActionCard.css`), todo cards (`OpenTodoCard.css`) and the contacts page CSS style their own surfaces | Every card on `Card`; object cards (site, call, todo) as named components |
| **Grids** | 8 grids, 5 setups (refactor plan §1.1) | One `DataTable` + saved definitions |
| **Search & filters** | 8 search boxes, 6 matching rules, server search without debounce | One `SearchInput` and filter set |
| **Empty states** | `EmptyState` component used in **1** file; ~43 inline "No …" messages with different tone/punctuation | `EmptyState` everywhere, one wording pattern ("No {objects} yet" / "No {objects} match these filters") |
| **Loading** | 24× "Loading…", plus "Loading calls…", "Loading staff…", etc.; some screens show nothing | One loading pattern (skeleton or `Loading {objects}…`) |
| **Missing values** | "—" (33×), "Unknown caller" (6×), "Unknown site", "Unknown", "no phone", "no phone on file", "No address on file." | One placeholder per field type |
| **Dates** | `fmtShort` (22), `fmtDate` (11), `fmtAgo` (1), one raw `toLocaleString` (site visit labels) | Rule per context: lists = relative ("3d ago"), detail = full date, due dates = short date chip |
| **Danger red** | `--color-danger` (via `t.signal`) used for ~36 form/save error messages as well as deadlines | `CLAUDE.md` says red is for deadlines only — decide whether form errors get a separate token |
| **Back navigation** | `BackLink` in 28 places; dialogs vs pages decide whether "back" exists | Comes with router decision (refactor plan Phase 5) |
| **Section headers** | `TileLabel` in most places; `<h3 style={sectionLabelStyle}>`, local `LABEL` / `labelStyle` objects elsewhere | `TileLabel` / `Field` only |
| **Buttons** | Shared `PRIMARY_BUTTON_STYLE` / `SMALL_SECONDARY_BUTTON_STYLE`, but many inline copies (e.g. SiteView "Edit site details", EditContactModal Cancel) | `Button` component |

---

## 10. What "uniform" means per object (proposed rules)

| Object | Name display | Click | Compact form (in lists) | Full form (detail) | Actions everywhere it appears |
|---|---|---|---|---|---|
| Site | always display name (`SiteDisplayName`) | → site page (picker: select) | `SiteChip`: name + target-missed flag + unread dot | site page | — |
| Todo | text + source tag | → its call / site | `TaskRow`: check, text, due chip, assignee, site chip, voice-note icon | expands in place | check off, park, assign, assign to site, voice note — permission-gated, never screen-gated |
| Contact | name + type badge | → contact record (Edit contact) | `ContactChip`: name, type, tap-to-call phone | Edit contact | call, edit |
| Call | caller name + date + duration + type | → one call detail (page or modal, one choice) | `CallRow` / `CallHeader` | one `CallDetail` incl. takeaways, unresolved, commitments, material, todos, Resolve | resolve, open |
| Voice note | — | play | `VoiceNoteBlock`: player + transcript status | same | record via `VoiceNoteModal` only |
| Staff | name | → their schedule/tasks | `PersonChip` | staff tab | assign |

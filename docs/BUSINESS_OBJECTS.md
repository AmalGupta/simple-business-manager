# Business objects — where they appear, what they show, what they should show

Status: **spec draft for review, no code changed.** Traced from `web/src` at `ea3e4e1` (2026-10-03). Supersedes the per-object sections of `docs/UX_CONSISTENCY_AUDIT.md` with a current → target view for every surface.

## How to read this

Each object has:
1. **What it is** — the record and its states.
2. **Standard views (target)** — the only ways the object is allowed to render: a *reference* (inline name/chip), a *row* (in lists/grids), a *card* (in feeds), and a *detail* (its own page or panel). Every surface must use one of these.
3. **Standard behaviour (target)** — what clicking does, which actions exist, who may do them. Actions are gated by role/scope, **never by which screen you're on**.
4. **Surface trace** — every place it appears today: how you get there, what it shows and does now, and what changes to reach the target.

Navigation paths use the dashboard's view names (`Dashboard.jsx` `view.name`). "A" = admin/superadmin, "S" = staff.

Shared conventions for every object:
- **Missing value**: `—` in grids/rows; a sentence ("No address yet") only in detail views.
- **Dates**: relative ("3d ago") for activity, `fmtShort` ("21 Aug") for due dates, `fmtDate` in detail headers.
- **Red** (`--color-danger`): only for a due/target date inside 24h or missed.
- **Empty list**: `EmptyState` — "No {objects} yet" or "No {objects} match these filters".
- **Loading**: one `Loading {objects}…` pattern.

---

## 1. Site

**What it is.** `sites` row: pipeline name (`name`, the match key) and composed display name (`site_name_being_used`, e.g. "NOBEL Aurelia | SECTOR 88-MOHALI"); intake fields (H.No, sector, city, address, assigned/referred by); target closure date; confirmed/unconfirmed; team (staff); linked contacts; activity (calls, memos, media, edits); open todo count; unread count.

### Standard views (target)
| View | Shows | Used in |
|---|---|---|
| **SiteRef** (inline) | display name with "\| CL." styling (`SiteDisplayName`); red dot if target missed; unread dot if unread | any row/card that mentions a site |
| **SiteRow** (grid) | display name, contacts (names), last activity (relative), open todos (count, clickable), target date (red if missed), team (count/initials) | Sites directory, staff site lists, pickers |
| **SiteDetail** (page) | header (display name, target date, status), details card, team, contacts (one list), open todos, tasks (workflow stages), timeline | `site` view |

### Standard behaviour (target)
- Clicking a SiteRef/SiteRow **always opens the site page**. Only exception: inside a picker, where it selects.
- Display name everywhere; pipeline name only as a secondary line in admin review/maintenance.
- Actions on the site page: Edit details (`site.edit`), Add people (`site.team.manage`), Associate contacts / Remove contact (`site.contacts.manage`), Add voice note / photo / video (team members + admin), View work timeline (admin).

### Surface trace
| # | Surface (component) | Reached from | Who | Shows today | Behaves today | Should show / behave |
|---|---|---|---|---|---|---|
| S1 | Sites directory grid (`SitesGrid` in `SitesDirectoryView`) | Home → "Sites needing attention" tile → View directory; Staff home → Sites | A, S | display name, unread badge, contacts, last activity, open count | row → site page; open count → `SiteOpenTodosPopup` | SiteRow: add target date (red if missed) and team; keep behaviour |
| S2 | Sites review grid (`SitesReviewGrid`) | Home → Sites needing attention → Review | A | valid toggle, display name, caller/contact, call date, voice-note mic | row does nothing; name opens Site details dialog; caller opens Associate contacts | SiteRow variant "review" (adds caller + call date + decision); name click → site page; details via an explicit "Edit" action |
| S3 | Site page (`SiteView`) | S1, S10–S12, Calls grid site link, Add site → created | A, S | display name, details (address, legacy POC name/phone, H.No/sector/city, location, target date), team, contacts (A only, separate from POC), timeline, staff task banner | edit via Site details dialog; staff: banner for own tasks | SiteDetail: **one contact list** (drop legacy POC lines once migrated to linked contacts), **add Open todos section**, show tasks for everyone (scoped), target-missed shown the same way for both roles |
| S4 | Calls grid "Site" column (`CallsGrid`) | Home → Calls | A | `recorded_for_site_name` / derived site (raw name) | click → site page | SiteRef (display name) |
| S5 | Contacts grid "Sites" column (`CallersDirectoryView`) | Home → Contacts tile | A | raw `site.name` list | click **filters the contacts grid** | SiteRef → site page; filtering moves to the grid's Site filter |
| S6 | Edit contact → linked sites (`EditContactModal`) | S5 → Edit | A | display name chips + own site search | add/remove links | SiteRef chips; picker = shared SitePicker |
| S7 | Assign todo to site (`AssignTodoSiteModal`) | Todo "Assign to Site" (T1, T2, T4, T5) | A | display name list, suggestion, own search | select + confirm association | shared SitePicker |
| S8 | Todo site tag (`CallActionCard`) | Calls needing action | A | raw `todo.site_name`, plain text | none | SiteRef → site page |
| S9 | Todo "Site: …" line (`CallDetailModal`) | Calls grid → row | A | raw name, plain text | none | SiteRef |
| S10 | Pending work (`PendingWorkView`) | Staff home → Pending work | S (A via staff tab) | raw `task.site_name` + stage label + due | click → site page | TaskRow with SiteRef (see §3) |
| S11 | Workflow category site list (`WorkflowCategorySiteList`) | Home → workflow tile row | A | raw site name + stage + assignee + due | click → site page | TaskRow with SiteRef |
| S12 | My schedule (`MyScheduleView`) | Staff home → Schedule | S, A | raw site name as sub-line of a task | task → site page | TaskRow with SiteRef |
| S13 | Escalations tile (`EscalationsTile`) | Home | A | raw site name under text | none | SiteRef |
| S14 | Complaints list (`ComplaintsHomeView`) | Home → Complaints tile; Staff home → Complaints | A, S | raw site name, address, POC name ("Unknown site" fallback) | none | SiteRef (+ address only in complaint detail) |
| S15 | Material shortages (`MaterialShortagesView`) | Home → Material shortages tile | A | raw site name | none | SiteRef |
| S16 | Site visit site list (`SiteVisitSiteList`) | Staff home → Site visit; Complaints → add | S | raw name only | starts visit / complaint | SiteRow "picker" variant (display name, target date); keeps "select" behaviour |
| S17 | Visit headers (`SiteVisitCategoryGrid`, `InstallationListView`, `SiteComplaintForm`) | S16 → … | S | raw name | — | SiteRef (display name) |
| S18 | Associate contacts dialog title (`AssociateContactsModal`) | S2, S3 | A | raw name | — | display name |
| S19 | Site open-todos popup (`SiteOpenTodosPopup`) | S1 open count | A, S | display name | — | display name (popup merges into site page "Open todos" section; can stay as a shortcut) |
| S20 | Stage assign / task banner / staff directory site lists | Site page; staff directory | A, S | raw names | varies | SiteRef |
| S21 | Maintenance site-contact grid | Header menu → Maintenance | A | display name + pipeline name | inline mapping | keep both names (this is the admin tool where both matter) |
| S22 | Home "Sites needing attention" tile (`SitesAttentionTile`) | Home | A | count + list | review / directory | SiteRef list with reason (unconfirmed, target missed, unread) |

---

## 2. Call

**What it is.** A recording (phone call, desk conversation, or site voice memo) with transcript, diarized transcript, extraction (summary, key takeaways, unresolved, commitments, material needs, sites, call type, customer-waiting, deadline), caller, date, duration, resolved state, todos.

### Standard views (target)
| View | Shows | Used in |
|---|---|---|
| **CallRef** | caller name (ContactRef) · date · type badge | todo cards, timeline, complaints |
| **CallRow** (grid) | date, caller, site(s), type, summary (1 line), todo count (open/total), waiting tag, resolved state | Calls grid, Resolved calls grid |
| **CallCard** (feed) | CallHeader + summary + audio + collapsible transcript + todos (TaskRow) + Resolve | Calls needing action, day drilldown |
| **CallDetail** | CallHeader (caller w/ tap-to-call, date, duration, type badge, waiting tag, resolved by/when) · audio · transcript · summary · key takeaways · unresolved · commitments · material needs · sites (SiteRef) · todos (TaskRow) · Resolve | the one detail view |

### Standard behaviour (target)
- **One detail view**, opened the same way from everywhere (decide: page, or side panel/modal — not both).
- Actions: Resolve / Reopen (`call.resolve`), play audio (anyone who can view), transcript (`call.transcript.view`; staff memo rule decided once).
- CallHeader built once; caller name is a ContactRef.

### Surface trace
| # | Surface | Reached from | Who | Shows today | Behaves today | Should show / behave |
|---|---|---|---|---|---|---|
| K1 | Calls grid (`CallsGrid` in `CallsPageView`) | Home → Calls | A | Sl., date, site, type, summary | row → **modal** K2 | CallRow: add caller, todo count, waiting, resolved; row → CallDetail |
| K2 | Call detail **modal** (`CallDetailModal`) | K1 | A | header (caller, type badge, waiting, duration), audio, transcript, summary, todos | complete/assign/assign-to-site todos; no Resolve; **no takeaways/unresolved/commitments/material** | replaced by CallDetail |
| K3 | Call detail **page** (`CallDetail`) | Site timeline, Open tasks, My call tasks, Resolved calls, My schedule | A, S | full header incl. tap-to-call, audio, transcript, summary, takeaways, unresolved, commitments, material, sites, todos (`OpenTodoCard`) | admin: complete/assign; **staff: todos read-only**; no assign-to-site; no Resolve | becomes the single CallDetail: add Resolve, assign-to-site, type badge; staff can complete their own todos |
| K4 | Calls needing action card (`CallActionCard` in `CallsNeedingActionView`) | Home → Calls needing action tile; home calendar day | A | caller, date, summary, audio, transcript toggle, todos (text, site tag, assign, site, voice note) | Resolve; **no checkbox, no due date**; no duration/type | CallCard: CallHeader + TaskRow (check, due, assignee, site, voice note) + Resolve |
| K5 | Resolved calls grid (`ResolvedCallsView`) | Home → Resolved calls tile | A | caller, call date, resolved, resolved by, todos, summary | row → page K3 | CallRow (resolved variant); Reopen action |
| K6 | Site timeline call entry (`SiteTimelineEntry`) | Site page | A, S | summary; memo: inline audio + `VoiceMemoDetail` (A) | phone call → K3; memo: staff get text only | CallRef + summary; memo → VoiceNoteBlock (§6); click → CallDetail (scoped) |
| K7 | Open todo card header (`OpenTodoCard`) | Open tasks, My call tasks, site popup | A, S | caller name, extraction meta, unresolved | "open call" → K3 | CallRef header |
| K8 | Home calendar (`StreakWall`) | Home | A | per-day markers | day → K4 scrolled to date | unchanged (acceptance criterion); day feed uses CallCard |
| K9 | `DayView` / old `CallCard` | **not mounted anywhere** | — | — | — | delete, or re-wire K8 to it — pick one |
| K10 | Desk conversation (`DeskConversationMic`) | Header mic | A | — | records → becomes a call | unchanged; result appears as a call everywhere |

---

## 3. Task (call todo + site task)

**What it is.** Two records users treat as one idea:
- **Call todo** (`todos`): text, owner (who said they'd do it), due date, status `open | done | snoozed(parked)`, assignees, optional site, voice note, source call.
- **Site task** (`site_tasks`, migration 0013): workflow stage label, site, category, due date, status `unassigned | assigned | done`, assignee.

### Standard views (target)
| View | Shows | Used in |
|---|---|---|
| **TaskRow** | status control (open / done / parked), text or stage label, source tag (Call · CallRef / Stage · category), due chip (red if <24h or missed), assignee(s), SiteRef, voice-note icon (plays) | every list of tasks |
| **TaskGroup** | CallRef header + its TaskRows (call todos), or SiteRef header + stage rows | Open tasks, My call tasks, site page |

### Standard behaviour (target) — the same on every surface
| Action | Call todo | Site task | Who |
|---|---|---|---|
| Complete / reopen | ✓ | ✓ | admin; staff if assigned |
| Park (snooze) | ✓ | — | admin (decide staff) |
| Assign / reassign | ✓ | ✓ | admin |
| Claim ("Assign to me") | ✓ | ✓ (exists today) | staff on site team (decide for call todos) |
| Assign to site | ✓ | n/a | admin |
| Voice note | ✓ | — | admin; staff if assigned |
| Click text | → its CallDetail | → its SiteDetail | anyone who can view |

Default sort everywhere: overdue → due soonest → no due date → newest.

### Surface trace — call todos
| # | Surface | Reached from | Who | Shows today | Behaves today | Should show / behave |
|---|---|---|---|---|---|---|
| T1 | Open tasks (`OpenTodosView` → `OpenTodoCard`) | Home → Open tasks tile | A | grouped by call; text, due, assignee, extraction meta | complete, assign, assign to site, unassign | TaskGroup; add park + voice note |
| T2 | My call tasks (`MyOpenTodosView` → `OpenTodoCard`) | Staff home → My call tasks; admin staff tab | S, A | grouped by call | **staff can complete here**; admin assign + site | TaskGroup; same actions as everywhere (role-gated) |
| T3 | Call page todos (`CallDetail` → `OpenTodoCard`) | K3 | A, S | grouped, expanded | admin complete/assign; **staff read-only**; no assign-to-site | TaskRows in CallDetail; staff can complete own |
| T4 | Call modal todos (`CallDetailModal` → `TodoRow`) | K1 | A | text, due, site line, assign | complete, assign, assign to site | removed with K2 |
| T5 | Calls needing action todos (`CallActionCard`) | K4 | A | text, site tag | assign, assign to site, voice note; **no complete, no due** | TaskRow |
| T6 | Site open-todos popup (`SiteOpenTodosPopup` → `OpenTodoCard`) | S1 open count | A, S | grouped by call, voice note | complete, assign, voice note; no assign-to-site | TaskGroup; also rendered in SiteDetail "Open todos" |
| T7 | Voice memo todos (`VoiceMemoDetail` → `TodoRow readOnly`) | Site timeline memo | A | text, due | assign only; **read-only status** | TaskRow |
| T8 | My schedule (`MyScheduleView`, own `TaskRow`) | Staff home → Schedule | S, A | title, client name, due, overdue tint; merged with site tasks; calendar | click → call | TaskRow (with source tag), keep calendar |
| T9 | Day drilldown (`DayView` → `CallCard` → `TodoRow`) | not mounted | — | — | `onPark` prop never wired | see K9 |
| T10 | Home "Open tasks" / "My call tasks" counts | Home | A, S | counts from summary | — | count = exactly what the list shows with default filters |

### Surface trace — site tasks
| # | Surface | Reached from | Who | Shows today | Behaves today | Should show / behave |
|---|---|---|---|---|---|---|
| W1 | Pending work (`PendingWorkView`) | Staff home → Pending work | S | stage label, raw site name, due | → site page | TaskRow (stage) |
| W2 | Workflow category list (`WorkflowCategorySiteList`) | Home → workflow tiles | A | stage, site, assignee, due | → site page | TaskRow (stage) |
| W3 | My task banner (`MyTaskBanner`) | Site page (staff) | S | own tasks on this site | done, unassign | TaskRows in SiteDetail "Tasks" (shown to admin too, with assign) |
| W4 | Stage assign row (`StageAssignRow`) | Site page | A | stage, assignee picker | assign | TaskRow assign action (shared StaffPicker) |
| W5 | Work timeline popup (`WorkTimelinePopup`) | Site page → View work timeline | A | all 23 stages | read | keep as the full stage view; rows = TaskRow |
| W6 | My schedule (`MyScheduleView`) | Staff home → Schedule | S, A | merged with call todos | → site page | TaskRow |
| W7 | Staff schedule tile (`StaffScheduleTile`) | Staff home | S | count/preview | → schedule | count matches W6 |

---

## 4. Contact (caller)

**What it is.** Callers directory row (migration 0021): name, phone, type (client, vendor, supplier, transporter, tech, staff, family, relative, spam), aliases, linked sites, optional staff login.

### Standard views (target)
| View | Shows | Used in |
|---|---|---|
| **ContactRef** | name + type badge; tap-to-call phone icon if phone known | calls, todos, sites, complaints |
| **ContactRow** | name, type, phone (tap-to-call), sites (SiteRef), aliases, login | Contacts grid, Associate contacts, Maintenance |
| **ContactDetail** | Edit contact form (one form for add + edit), recent calls, open todos | dialog or page |

### Standard behaviour (target)
- Clicking a ContactRef opens ContactDetail (`contact.view`); edit requires `contact.edit`.
- Phone always via `PhoneLink`; missing phone = `—`.
- **Add contact and Edit contact are the same form** (empty vs prefilled).
- A site's contacts come only from linked contacts (legacy `poc_name` / `poc_contact_number` migrated or shown as "unlinked contact" until linked).

### Surface trace
| # | Surface | Reached from | Who | Shows today | Behaves today | Should show / behave |
|---|---|---|---|---|---|---|
| C1 | Contacts grid (`CallersDirectoryView`) | Home → Contacts tile | A | name, type, sites, phone, aliases, login; bucket tabs; server search | Edit, change type inline, site click filters | ContactRow; site click → site page |
| C2 | Edit contact (`EditContactModal`) | C1 | A | name, phone, type, sites, aliases | always PATCHes everything; serial requests | ContactDetail form; send only changes; parallel link/alias writes |
| C3 | Add caller (`AddCallerModal`, hand-rolled) | C1 | A | name, phone, type | create | same form as C2 |
| C4 | Manage aliases (`ManageAliasesModal`) | C1 | A | aliases | add/remove | merge into C2 (already has aliases) |
| C5 | Promote to staff (`PromoteStaffConfirmModal`, hand-rolled) | C2 type → staff | A | login name, PIN | create login | ConfirmDialog |
| C6 | Associate contacts (`AssociateContactsModal`, grid) | Site page; review grid | A | name, phone, add toggle, suggestions | link/create | ContactRow (compact) |
| C7 | Site page contacts (`SiteView`) | Site page | A (staff get none) | name, phone, Remove | remove | ContactRef list in SiteDetail; staff see names + tap-to-call (decide) |
| C8 | Site page legacy POC lines (`SiteView`) | Site page | A, S | "Point of contact: …", "Contact: …" | — | removed after migration into C7 |
| C9 | Site details dialog linked list (`SiteDetailsModal`) | Site page; review | A | read-only names | "Add contact" → C6 | ContactRef chips |
| C10 | Call surfaces caller name (K1–K7) | — | A, S | `client_name` / "Unknown caller"; phone only on K3 | none | ContactRef (name, type, tap-to-call) |
| C11 | Caller filter (`CallerMultiSelect`) | Calls page | A | names | multi-select | shared ContactPicker |
| C12 | Maintenance site-contact grid | Header → Maintenance | A | site, display, client, contact, match | map | ContactRow columns |

---

## 5. Staff member

**What it is.** `users` row: name, phone, role, PIN, site team memberships, assigned tasks/todos.

### Standard views (target)
| View | Shows | Used in |
|---|---|---|
| **PersonRef** | name (+ "you"), initials | assignee chips, team lists, resolved by |
| **PersonRow** | name, role, phone (tap-to-call), sites count, open tasks count | Staff directory (as grid, like Contacts/Sites) |
| **Person home** | the staff home panel scoped to them | admin staff tabs |

### Standard behaviour (target)
- PersonRef click → that person's home tab (admin) / nothing (staff).
- One StaffPicker for every assign action.

### Surface trace
| # | Surface | Reached from | Who | Shows today | Behaves today | Should show / behave |
|---|---|---|---|---|---|---|
| P1 | Staff directory (`StaffDirectoryView`, cards) | Home → Staff tile | A | name, role, phone, PIN | add, delete, reset PIN | PersonRow grid (same pattern as Contacts) |
| P2 | Add / Delete staff (hand-rolled dialogs) | P1 | A | form / delete preview | create / delete with relink | FormDialog / ConfirmDialog |
| P3 | Site team list (`SiteView`) | Site page | A, S | name, phone ("no phone on file") | — | PersonRef + phone `—` |
| P4 | Add people (`AddPeopleModal`, own list + search) | Site page | A | name, phone, checkbox | add to team | StaffPicker |
| P5 | Todo assign (`TodoAssignControl`) | T1–T7 | A | names, "(you)", "(suggested)", Assign to me | assign / claim | StaffPicker; assignee shown as PersonRef |
| P6 | Stage assign (`StageAssignRow`) | Site page | A | names | assign | StaffPicker |
| P7 | Home staff tabs (`HomeDashboardTabs`) | Home | A | staff with open todos | switch scope | PersonRef tabs |
| P8 | "Resolved by", "Reported by", "Created by", complaint assignee | K5, M1, X1 | A | plain names | — | PersonRef |

---

## 6. Voice note & media

**What it is.** Audio or images/videos attached to something. Kinds today:

| Kind | Attached to | Transcribed | Recorder |
|---|---|---|---|
| Call recording | call | ✓ | phone / upload |
| Desk conversation | becomes a call | ✓ | `VoiceNoteModal` via header mic |
| Site voice memo | site (becomes a call with `recorded_for_site_id`) | ✓ | `VoiceNoteModal` |
| Review-site note | site (memo) | ✓ | `VoiceNoteModal` |
| Todo voice note | todo | ✗ | `VoiceNoteModal` |
| Installation note | installation update | ? | `VoiceNoteModal` |
| Complaint note | complaint | ? | **own inline recorder** |
| App request | request | ? | `VoiceNoteModal` |
| Photo / video | site, installation update | n/a | file input |

### Standard views (target)
| View | Shows |
|---|---|
| **VoiceNoteBlock** | player · who/when · transcript (or "Transcribing…" / "Not transcribed") · todos extracted (if any) |
| **MediaThumb** | thumbnail, who/when, opens full view |
| **Recorder** | `VoiceNoteModal` only, one label: "Add voice note" |

### Standard behaviour (target)
- Wherever the parent object appears in detail, its voice notes/media appear as VoiceNoteBlock/MediaThumb — a note is always playable where its result is shown.
- Transcript visibility by permission (`memo.transcript.view`), decided once.

### Surface trace
| # | Surface | Reached from | Who | Shows today | Should show / behave |
|---|---|---|---|---|---|
| V1 | Call audio (K2, K3, K4) | calls | A, S | native player | VoiceNoteBlock (header + transcript below) |
| V2 | Site timeline memo (`SiteTimelineEntry` + `VoiceMemoDetail`) | site page | A: player + transcript + todos; S: player + summary | VoiceNoteBlock, permission-gated transcript |
| V3 | Site media upload row (`SiteMediaUploadRow`) | site page | A, S | photo / video / "Add voice note" | Recorder + MediaThumb on timeline |
| V4 | Review grid mic (`SitesReviewGrid`) | review | A | mic icon only | same Recorder; label/tooltip "Add voice note" |
| V5 | Todo voice note (`TodoVoiceNoteButton`) | T5, T6 | A | mic; player under todo | voice-note icon on every TaskRow; player in expanded row |
| V6 | Installation row (`InstallationScreen`) | staff site visit | S | "Voice note recorded" (no player) | VoiceNoteBlock |
| V7 | Complaint form (`SiteComplaintForm`) | staff complaints | S | own recorder, preview | Recorder; note playable in complaint row/detail (X1, X2) |
| V8 | Request form (`RequestForm`) | header → request | A, S | "Record request" | Recorder; same label pattern |
| V9 | Material shortage / escalation lists | home | A | no audio | VoiceNoteBlock in the detail of each |

---

## 7. Complaint / escalation

**What it is.** `escalations` row: text, site, status open/closed, assignee, created by, source (`staff_field` for complaints from site visits, desk for admin-added).

### Standard views (target)
- **ComplaintRow**: text, SiteRef, created by (PersonRef) + when, assignee, status, voice-note icon.
- **ComplaintDetail**: + VoiceNoteBlock, photos, address/POC, history.
- One name in the UI (pick "Complaints" or "Escalations").

### Standard behaviour (target)
Close / reopen and assign (admin); add (staff on site team + admin); click SiteRef → site page.

### Surface trace
| # | Surface | Reached from | Who | Shows today | Behaves today | Should show / behave |
|---|---|---|---|---|---|---|
| X1 | Escalations tile (`EscalationsTile`) | Home | A | text, raw site name | add, **Close button** | ComplaintRow (compact); same close action |
| X2 | Complaints list (`ComplaintsHomeView`) | Home → Complaints tile; Staff home → Complaints | A, S | text, site, address, POC, created by, assignee, **Open/Closed label** | admin assign; staff add | ComplaintRow; close/reopen here too; voice playable |
| X3 | Complaint form (`SiteComplaintForm`) | X2 → add → site; visit category | S | site, text, own recorder | submit | FormDialog-style screen with Recorder |
| X4 | Installation "Complaints" row (`InstallationScreen`) | site visit | S | checklist row | writes to escalations | links to the created ComplaintRow |

---

## 8. Material shortage

**What it is.** `material_shortages` ledger (migration 0016): description, site, reported by/at, status open/fulfilled, resolved at.

### Target
- **ShortageRow**: description, SiteRef, installation (if any), reported by (PersonRef) + when, status, voice-note icon.
- Actions: Mark fulfilled / reopen (admin). Click SiteRef → site page.

### Surface trace
| # | Surface | Reached from | Who | Shows today | Should show / behave |
|---|---|---|---|---|---|
| M1 | Material shortages tile (`MaterialShortagesTile`) | Home | A | count | count = open rows in M2 |
| M2 | Material shortages list (`MaterialShortagesView`) | M1 | A | description, raw site, reported by/at, status; mark fulfilled | ShortageRow (SiteRef, voice note, installation link) |
| M3 | Installation "Material Short" row | site visit | S | checklist row | links to the created ShortageRow |
| M4 | Call `material_needs` (K3) | call page | A, S | list in call detail | stays call-scoped (self-expiring); label clearly distinct from shortages |

---

## 9. Installation (site visit)

**What it is.** `installations` + `installation_updates` (migration 0016): physical instance on a site with a 6-row checklist; each row needs a voice note, then photo/video.

### Target
- **InstallationRow**: label, SiteRef, checklist progress (n/6), last update (relative).
- **InstallationDetail**: checklist rows, each with VoiceNoteBlock + MediaThumbs; complaint/shortage links.
- Visible to admin on the site page (today only reachable through the staff site-visit flow).

### Surface trace
| # | Surface | Reached from | Who | Shows today | Should show / behave |
|---|---|---|---|---|---|
| I1 | Site visit category grid (`SiteVisitCategoryGrid`) | Staff home → Site visit → site | S | categories (Measurement / Delivery "coming soon") | unchanged |
| I2 | Installation list (`InstallationListView`) | I1 → Installation | S | installations for the site | InstallationRow |
| I3 | Installation checklist (`InstallationScreen`) | I2 | S | rows, "Voice note recorded", photo/video | VoiceNoteBlock + MediaThumb per row |
| I4 | Site page | — | A | **not shown** | Installations section (InstallationRow list) |

---

## 10. App request

**What it is.** Voice-only bug/feature request (migrations 0033–0035) with structured title/summary, Jira ID/status, pipeline status.

| # | Surface | Reached from | Who | Shows today | Should show / behave |
|---|---|---|---|---|---|
| R1 | Request form + grid (`RequestForm`) | Header account menu → Request | A, S | speaker, title, summary, Jira ID/status, pipeline | standard grid definition; Recorder label "Add voice note"; VoiceNoteBlock in row detail |

---

## 11. Summary: components this spec implies

| Object | Ref | Row | Card / Group | Detail | Picker |
|---|---|---|---|---|---|
| Site | `SiteRef` | `SiteRow` | — | `SiteDetail` | `SitePicker` |
| Call | `CallRef` | `CallRow` | `CallCard` | `CallDetail` (+ `CallHeader`) | — |
| Task | — | `TaskRow` | `TaskGroup` | (expands in place) | — |
| Contact | `ContactRef` | `ContactRow` | — | `ContactDetail` / `ContactForm` | `ContactPicker` |
| Staff | `PersonRef` | `PersonRow` | — | person home tab | `StaffPicker` |
| Voice / media | — | — | `VoiceNoteBlock`, `MediaThumb` | — | `Recorder` |
| Complaint | — | `ComplaintRow` | — | `ComplaintDetail` | — |
| Shortage | — | `ShortageRow` | — | — | — |
| Installation | — | `InstallationRow` | — | `InstallationDetail` | — |

## 12. Decisions needed before building
1. Call detail: page or panel/modal — one of them.
2. Staff and call todos: complete everywhere? park? claim? voice note?
3. Staff and memo transcripts.
4. Staff and site contacts (see names/phones or not).
5. Legacy site POC fields: migrate into linked contacts, or keep as "unlinked contact".
6. "Complaints" vs "Escalations" as the one name.
7. `DayView` / old `CallCard`: delete or re-wire.
8. Default task sort order.

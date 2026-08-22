# Additional features to M0

Additions to the M0 scope, derived from analysis of 11 real call transcripts. Supplements `project-instructions.md` and `SCAFFOLDING.md` — does not replace them. Where this document contradicts an earlier locked decision, the contradiction is called out explicitly.

---

## Why this exists

Eleven transcripts were analysed across three batches. Two findings drove everything below:

1. **Only 2 of 11 calls were with clients.** The other 9 were internal operations — staffing, dispatch, material movement, production status. The original schema captures the minority case well and the majority case not at all.
2. **The organising unit in speech is the site, not the client.** Sector 70, 106, 35, 241, Regalia, Dera Bassi, Eco City, Homeland recur constantly. Client names appear twice in eleven calls; order numbers never.

The evidence sample is 11 calls, all appearing to be morning/early-day. The client-to-internal ratio should be confirmed with the owner directly before it is treated as settled.

---

## Reversed decision: single-owner todos

**Previously locked** (`memory-notes.md`): task routing dropped entirely, every todo owned by him by default.

**Reverse it.** He remains the only *user* of the system — that part holds. But the todos have owners who are not him. Named individuals carrying work across the transcripts:

Mishra, Gaurav, Neeraj, Shubham, Shivam, Anand, Azeem, Tanzeem, Manglesh, Ravi, Rupam, Vishal, Manjeet, Harisharan, Jaskaran

Real assignments observed: Mishra to check Sector 70; Gaurav and Anand to fit 106 glass into shutters; Shubham to take his auto to Regalia; a man to carry a cutter by bike.

A `todos_for_self` bucket flattens this into a list he must mentally re-attribute, which defeats the purpose — the thing he is tracking is *who is doing what where*.

**Change:** drop the customer/self split. One `todos[]` array with a free-text `owner` field. (`todos_for_customer` fired exactly once in 11 calls — a payment nudge — so it does not merit a top-level field.)

---

## Revised extraction schema

| Field | Notes |
|---|---|
| `summary` | unchanged |
| `key_takeaways` | unchanged |
| `call_type` | **new** — `client` / `internal` / `low_signal` |
| `sites[]` | **new** — array, not singular. One call touched 6 sites in ~3 minutes |
| `todos[]` | text, owner, due |
| `commitments[]` | raw_phrase, resolved_datetime, promised_to |
| `unresolved[]` | item, **`blocked_on`** (who to ask) |
| `material_needs[]` | **new** — shortages and awaited stock |

### Notes on individual fields

**`call_type` = `low_signal`** — roughly a third of sampled calls were pure attendance roll-call producing no durable information. These must extract to *no dashboard card*. Yesterday's roll-call has no value tomorrow, and cards for them would flood the dashboard within a week — defeating the calm-over-urgent principle.

**`sites[]` must be plural.** A single-site field would silently discard most of the content of a typical dispatch call.

**`commitments[]` carries datetime, not date.** Observed: "साढ़े दस बजे निकलियो", an 11 o'clock appointment, "कल सुबह अर्ली", plus the one clean absolute case — a promise for the 10th, noted on the 7th, with two days of Georgian glass fitting still to do.

**`blocked_on` is the highest-value addition.** The recurring pattern is *the information exists but sits with someone else*: the Sector 35 drawing and remaining count with Azeem; whether three Regalia windows are oversize pending Mishra's check; the missing big fin. Every instance has a person attached who could resolve it.

**`material_needs[]`** replaces any inventory ambition. Observed: Georgian glass finished at Sector 35 with 10–20 more pieces needed; the big fin unavailable; hardware list not printed; Gold Plus delivery in transit. These are shortage *events*, extractable from speech and self-expiring — not a ledger, which would require counting that nobody does.

---

## Phase 1 home page

Four tiles, then call cards.

### Tile 1 — Open items today
### Tile 2 — Closed today

### Tile 3 — Sites needing attention

Inclusion rule: site has an item aged past its promise date, **or** has something blocked. Show site name, open count, age of oldest item. Cap at 3–4 rows.

Sorted oldest-blocked first.

**Dependency:** requires `site` as a real field rather than a raw string. This is the only tile with a blocking dependency; everything else can be built immediately.

### Tile 4 — Escalations (manual)

A quick-note list with a `+` button. **He** adds items; the pipeline does not.

This deliberately avoids asking the LLM to grade urgency. On a 2-of-11 client signal it would be unreliable — one observed client stated her job was very important, another simply called four times before 9am without ever saying anything urgent. A classifier would catch one and miss the other. He knows what an escalation is.

Requirements:
- Optional `site` link (nullable column now; this is what merges tiles 3 and 4 into one picture later)
- One-tap close — the list only stays honest if clearing is frictionless
- Empty state reads as relief, not as a broken tile. "Nothing escalated" plus the `+` button
- **Future (Phase 3):** assign to a team member. Roster already exists by then; the escalation gets an owner and appears in that person's view

**Automation gate:** once extraction accuracy is proven over weeks, the pipeline may *propose* an escalation from a call — as a suggestion he taps to accept, never auto-inserted. Same principle as the deferred client emails. If the tile fills with items he didn't put there, he stops trusting it.

### Below the tiles — call cards

Newest first. `low_signal` calls suppressed.

Each card: one-line summary, todos with owner names, commitments showing **raw phrase next to resolved date** — e.g. `कल सुबह → 23 Aug`.

The raw phrase is not decoration. It lets him verify the system heard correctly in half a second, without opening anything. Given the ERP history, trust is the scarce resource and this is how the tool earns it in week one.

---

## Deferred from Phase 1

**Streak.** Keep the position and the intent — a relieving number leading the view — but not yet. A streak counts missed deadlines, and only 2 of 11 calls carried a client deadline at all. Computed off that signal it will either freeze at a number he distrusts or reset for reasons he doesn't recognise. Instrument it, decide at Phase 2. Better-attested candidates: days with zero items aged past promise date, or client commitments met on time.

**Attendance tracking.** Absence patterns would be genuinely useful (one man missing three days in five is real information) but that is an insight layer, not an M0 table.

**Charts and trends.** Eleven calls is not a trend. Charts would invite reading patterns that aren't there.

**Anything client-facing on this screen.** Locked decision, unchanged.

---

## STT hardening (prerequisite)

Text is not yet reliable enough to build entities on. Required before Phase 1 data is trustworthy:

**Controlled vocabulary in the extraction prompt** — the 15 staff names above plus the 9 known sites. Fixes observed instability: Regalia appearing as रिगालिया / रगालिया / रे गालिया, Georgian as जॉर्जियन / जॉर्जियान / जोजन.

**Resolve Shivam vs Shubham.** Both appear, sometimes in the same call, one letter apart, used interchangeably in adjacent lines. If these are two men the system will silently mis-assign work and the text gives no way to tell. **This cannot be fixed downstream — confirm with the owner before building the vocabulary.**

**Number handling.** Sector numbers arrive as Hindi words (सत्तर, एक सौ छह, पैंतीस), not digits. Sector 70 was already transcribed as "170" once, and as "70 70" elsewhere. Map spoken numerals to canonical site IDs. This is the flagged highest-risk failure mode: a misheard number silently attaches work to the wrong site.

**Feed diarized segments with timestamps — never the merged paragraph.** In both client calls the owner speaks to the client and to staff in the room simultaneously, with genuinely overlapping timestamps. One call has "विल बी डन मैम, विल बी डन" to the client followed immediately by a sharp aside to staff. Flat text would read staff instructions as things said to the client — and these are precisely the two calls where mis-attribution would put a staff scolding into a client-facing summary. Keep the human-approval gate.

Speaker labels are themselves unreliable — IDs drift within a single call and a phantom speaker 0 carries some important lines. Do not build logic that depends on speaker identity.

---

## Known roster and sites

**Staff:** Mishra, Gaurav, Neeraj, Shubham, Shivam, Anand, Azeem, Tanzeem, Manglesh, Ravi, Rupam, Vishal, Manjeet, Harisharan, Jaskaran

**Sites:** Sector 35, Sector 70, Sector 106, Sector 241, 123/125, Regalia, Eco City / Mullanpur, Dera Bassi, Homeland

Both lists are provisional and drawn from 11 calls — expect additions.

---

## The proof case

The Sector 106 measurement problem appears across at least three separate calls. Windows reported off by 30–40mm; the owner says he'll have Mishra check it. In a later call he asks again how the measurements went wrong, and receives the same answer he got the first time: I'll check and let you know.

Call ordering here is inferred — only one transcript carries a date — so treat the sequence as probable rather than certain. But the same check promised twice with nothing resolved in between is exactly the failure this tool exists to fix, and it is sitting in an 11-call sample.

Rendered as one item on the 106 site, blocked on Mishra, with days-open showing, this is the single screen that makes the case for the entire build. It is also the argument for capturing call date rigorously: without it, the threading that makes this visible does not work.

---

## Open questions

Carried forward, still unresolved:

1. Which phone he uses for client calls — blocks the ingestion path
2. Streak reset rule — deferred to Phase 2 pending real deadline data
3. Card sort order within the call feed
4. **New:** is the 2-of-11 client-to-internal ratio real, or a sampling artefact? All analysed calls appear to be morning/early-day. Ask him directly what proportion of his calls are with clients versus his own team — the answer decides whether this is a client-commitment tracker with an internal side, or the reverse
5. **New:** Shivam and Shubham — one man or two?

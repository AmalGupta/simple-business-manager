# Design language — Studio

**Supersedes** the "control room" system in `SCAFFOLDING.md` §7 as of 2026-08-26. That doc's tokens table is now stale — this file is the source of truth for typography, color, and surface rules going forward. `SCAFFOLDING.md` §7 keeps its rationale for the canvas/ink/accent/danger palette (unchanged here) and the motion table (also unchanged); only surfaces, radius, and the label/number treatment change.

## Why

Control room's tiles shipped twice in one day: first flat-bordered, then a tinted-surface-plus-shadow pass. Neither had a point of view beyond "modern SaaS card." This pass borrows one instead: the New York School lineage — Vignelli's 1972 NYC subway map (Standard/Helvetica, flat saturated color per line, no ornament), and the restraint of a Knoll furniture catalog (a lot of white space, one committed accent, nothing decorative). The rule that lineage shares: **a surface is either flat or it's wrong.** No shadows, no tints, no gradients. Structure comes from a hairline rule and a grid, not elevation. Color is a signal, applied once, not a decoration applied everywhere.

This is a **skin change only.** The four todo states, the calendar/day drilldown, CSV export, the danger-red-only-for-genuine-urgency rule, and the motion table in `SCAFFOLDING.md` §7 are all unchanged — see `CLAUDE.md` "Dashboard behavioral fidelity."

## Typography

| Role | Face | Where |
|---|---|---|
| Display | Space Grotesk | Page headings (`h1`), big tile numerals |
| Label | **IBM Plex Sans**, 700, uppercase, `letter-spacing: 0.04em` | Small section/tile headers — `TileLabel` everywhere it's used: home tiles, "Site details"/"Team"/"Timeline" headers, Calls page filter tiles |
| Body | Mukta | Everything else, including transcripts |

Mukta is not a taste choice and does not change here — see `CLAUDE.md`: transcripts are code-mixed Hindi-English and `transcribe` mode returns Devanagari, and Mukta is the one face in this stack that covers both scripts without tofu boxes.

IBM Plex Sans is new. It's added to the same Google Fonts `@import` as the other two faces in `theme.css`.

## Color

Canvas, ink, slate, line, accent, warn, danger are **unchanged** from control room — see `SCAFFOLDING.md` §7 for the values and the "danger only for genuine urgency" rule, which still applies without exception.

Two things change in how color is *used*, not the palette itself:

1. **Tile numerals are accent-blue, not ink-black.** A number is the one thing on a stat tile worth a color signal; everything else on the tile (the label, the rule) stays neutral. Applies to StatCard, StaffTile, WorkflowTilesRow, and the "calls logged"/"recordings" tiles.
2. **One new token, `--color-ink-emphasis` (`#05070A`)**, for primary list-row text that needs to read a shade heavier than body ink — currently just site names (Sites directory, "Sites needing attention"). Not a replacement for `--color-ink`; a deliberately narrow addition for one recurring pattern, not a blanket darkening.

## Surface

This is the actual reversal from control room's second pass:

| | Control room (tinted tile) | Studio |
|---|---|---|
| Background | `color-mix(accent 5%, white)` | flat white (`--color-surface`) |
| Border | none | `1px solid var(--color-line)` |
| Elevation | layered `box-shadow` | none |
| Radius | 14px (tile) / 10px (card) | **6px, everywhere** |

One radius, one border treatment, one background — for every `Card` usage, not a special "tile" variant. A stat tile, a call card, a form section, and a site's team-member list all render the same surface now. The only thing that still varies per-usage is layout: the home-grid tiles are fixed to `--tile-height` (200px) and lay out as a column flexbox so the grid stays symmetrical regardless of content, scrolling internally past that height rather than growing — that's a layout mechanic, not a skin difference, and it's unchanged from the previous pass.

Selection/urgency states that already relied on border color (the Calls page's "Important calls" filter, the "Your tasks here" urgent banner) compose cleanly with this — they just sit a thicker or accent-colored border on top of the same hairline base. This was awkward under the shadow-tile treatment (those two surfaces had to opt out of `tile` entirely to keep their border meaningful) and isn't anymore.

## Token reference

Added or changed in `web/src/theme.css`:

```css
--font-label: "IBM Plex Sans", system-ui, sans-serif;
--color-ink-emphasis: #05070A;
--radius-card: 6px;          /* was 10px */
--tile-height: 200px;        /* unchanged — layout mechanic, not skin */
```

Retired (were introduced for the shadow-tile pass, superseded by the table above): `--color-surface-tile`, `--shadow-tile`, `--radius-tile`.

## Component notes

- `Card` (`web/src/Dashboard.jsx`): background/border/radius are no longer conditional on the `tile` prop — every Card renders the same flat surface. `tile` now only controls the fixed-height column-flex layout used by the home-grid tiles.
- `TileLabel`: `font-family: var(--font-label)`, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.04em`, `color: var(--color-ink)` (was the muted slate).
- Tile numerals: `font-weight: 700` (was 500), `color: var(--color-accent)` (was ink).
- Site name rows (Sites directory, Sites needing attention): `color: var(--color-ink-emphasis)`, `font-weight: 500`.

## What's retired

The tinted-surface-plus-shadow tile treatment (shipped 2026-08-26, same day as this doc) is retired after one pass. Nothing is deleted from git history if it needs revisiting, but there is no dormant `[data-theme]` block kept for it the way control room kept float-glass — it wasn't distinct enough a design to warrant preserving as a swappable option, just a version to move on from.

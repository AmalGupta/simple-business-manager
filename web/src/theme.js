/* ------------------------------------------------------------------
   Design tokens — see SCAFFOLDING.md §7 and web/src/theme.css.
   Values live in theme.css as CSS custom properties; this object is
   just the mapping inline styles read, so swapping the whole theme
   (see the retired [data-theme="float-glass"] block) touches one file.
   ------------------------------------------------------------------ */
export const t = {
  pane: "var(--color-canvas)",
  edge: "var(--color-ink)",
  edgeStrong: "var(--color-ink-emphasis)",
  edge2: "var(--color-slate)",
  frost: "var(--color-line)",
  frostSoft: "var(--color-line-soft)",
  putty: "var(--color-warn)",
  puttyBg: "var(--color-warn-bg)",
  accent: "var(--color-accent)",
  signal: "var(--color-danger)",
  signalBg: "var(--color-danger-bg)",
  unread: "var(--color-unread)",
  white: "var(--color-surface)",
  display: "var(--font-display)",
  label: "var(--font-label)",
  body: "var(--font-body)",
  radius: "var(--radius-badge)",
  radiusCard: "var(--radius-card)",
  radiusButton: "var(--radius-button)",
};

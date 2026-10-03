import { useState } from "react";
import { ChevronDown, ChevronRight, Home, Pin, Plus } from "lucide-react";
import { t } from "../../theme.js";
import { MY_PAGE_SECTIONS, MY_PAGE_VIEW_LABELS, MY_PAGE_VIEW_TARGETS } from "../../lib/my-page-views.js";

const labelStyle = {
  fontFamily: t.label,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: t.edge2,
};

const rowBase = {
  all: "unset",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minHeight: 40,
  padding: "8px 10px",
  borderRadius: t.radiusCard,
  cursor: "pointer",
  fontSize: 13.5,
  fontWeight: 600,
  color: t.edge,
};

const subRowStyle = (active) => ({
  ...rowBase,
  minHeight: 40,
  padding: "8px 10px 8px 30px",
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  background: active ? t.accent : "transparent",
  color: active ? t.white : t.edge,
});

/* SBM-106 — admin-only left nav for the home area. Pinned "My pages" first,
   then the top-level sections, each collapsible to its screens. Hidden on
   phones; the home tiles remain the mobile navigation. */
export function AdminNav({ pages, activeView, onHome, onOpenView, onNewPage, onOpenPage }) {
  const [open, setOpen] = useState({ work: true, sites: true });
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));
  const isActive = (target) => activeView?.name === target?.name && activeView?.pageId == null;

  return (
    <nav aria-label="Admin navigation" className="sbm-adminnav" style={{ width: 240, flex: "0 0 240px", display: "flex", flexDirection: "column", gap: 4 }}>
      <style>{`@media (max-width: 899px){.sbm-adminnav{display:none}}`}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 10px 6px" }}>
        <Pin size={12} />
        <span style={labelStyle}>My pages</span>
      </div>
      {pages.map((page) => {
        const active = activeView?.name === "my-page" && activeView?.pageId === page.id;
        return (
          <button key={page.id} type="button" onClick={() => onOpenPage(page)} style={{ ...rowBase, background: active ? t.accent : "transparent", color: active ? t.white : t.edge }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.name}</span>
            <span style={{ ...labelStyle, color: active ? t.white : t.edge2 }}>{page.views.length}</span>
          </button>
        );
      })}
      <button type="button" onClick={onNewPage} style={{ ...rowBase, color: t.accent, fontWeight: 600 }}>
        <Plus size={14} /> New page
      </button>

      <div style={{ height: 1, background: t.frost, margin: "10px 4px" }} />

      <button type="button" onClick={onHome} style={{ ...rowBase, background: activeView?.name === "home" ? t.frostSoft : "transparent" }}>
        <Home size={14} /> Overview
      </button>

      {MY_PAGE_SECTIONS.map((section) => {
        const expanded = Boolean(open[section.key]);
        const Chevron = expanded ? ChevronDown : ChevronRight;
        return (
          <div key={section.key}>
            <button type="button" aria-expanded={expanded} onClick={() => toggle(section.key)} style={rowBase}>
              <Chevron size={14} /> <span style={{ flex: 1 }}>{section.label}</span>
            </button>
            {expanded &&
              section.views.map((id) => {
                const target = MY_PAGE_VIEW_TARGETS[id];
                return (
                  <button key={id} type="button" aria-current={isActive(target) ? "page" : undefined} onClick={() => onOpenView(target)} style={subRowStyle(isActive(target))}>
                    {MY_PAGE_VIEW_LABELS[id]}
                  </button>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}

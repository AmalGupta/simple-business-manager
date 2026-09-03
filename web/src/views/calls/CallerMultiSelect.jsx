import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE } from "../../styles.js";

/**
 * Compact multi-select dropdown for caller filter.
 * selected: string[]; options: string[]; onChange(next: string[])
 */
export function CallerMultiSelect({ options, selected = [], onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedSet = new Set(selected);
  const filtered = options.filter((name) =>
    name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const label =
    selected.length === 0
      ? "All callers"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} callers`;

  const toggle = (name) => {
    const next = new Set(selectedSet);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange([...next]);
  };

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        style={{
          ...TEXT_INPUT_STYLE,
          width: "100%",
          minHeight: 36,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          cursor: disabled || options.length === 0 ? "default" : "pointer",
          textAlign: "left",
          opacity: disabled || options.length === 0 ? 0.55 : 1,
          borderColor: open ? t.accent : t.frost,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selected.length ? t.edge : t.edge2,
            fontWeight: selected.length ? 600 : 500,
          }}
        >
          {options.length === 0 ? "No callers yet" : label}
        </span>
        <ChevronDown size={16} color="var(--color-slate)" style={{ flexShrink: 0 }} />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute",
            zIndex: 40,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 260,
            display: "flex",
            flexDirection: "column",
            background: t.white,
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            boxShadow: "0 8px 24px rgba(20, 24, 31, 0.12)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 8, borderBottom: `1px solid ${t.frost}` }}>
            <input
              autoFocus
              type="search"
              placeholder="Search callers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ ...TEXT_INPUT_STYLE, width: "100%", minHeight: 34, fontSize: 13 }}
            />
          </div>
          <div style={{ overflowY: "auto", padding: "6px 0", flex: 1 }}>
            {filtered.length === 0 ? (
              <p style={{ margin: "8px 12px", fontSize: 13, color: t.edge2 }}>No matches.</p>
            ) : (
              filtered.map((name) => {
                const checked = selectedSet.has(name);
                return (
                  <label
                    key={name}
                    role="option"
                    aria-selected={checked}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      fontSize: 13,
                      color: t.edge,
                      cursor: "pointer",
                      background: checked ? "color-mix(in srgb, var(--color-accent) 8%, white)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(name)}
                      style={{ width: 15, height: 15, accentColor: "var(--color-accent)" }}
                    />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                  </label>
                );
              })
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              padding: "8px 10px",
              borderTop: `1px solid ${t.frost}`,
              background: t.pane,
            }}
          >
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              style={{
                border: "none",
                background: "none",
                color: t.accent,
                fontSize: 12,
                fontWeight: 700,
                cursor: selected.length ? "pointer" : "default",
                opacity: selected.length ? 1 : 0.4,
                padding: 0,
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                border: "none",
                background: "none",
                color: t.edge,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

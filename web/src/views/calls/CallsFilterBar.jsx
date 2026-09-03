import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { t } from "../../theme.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { TEXT_INPUT_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { CallerMultiSelect } from "./CallerMultiSelect.jsx";

const FIELD = { ...TEXT_INPUT_STYLE, minHeight: 36, fontSize: 13 };
const CHECK_LABEL = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: t.edge,
  cursor: "pointer",
  userSelect: "none",
};

const ENTRY_TYPE_OPTIONS = [
  { value: "voice_call", label: "Voice Call" },
  { value: "voice_note", label: "Voice Note" },
];

/**
 * Collapsible filter bar for the Calls grid.
 * filters: { dateFrom, dateTo, callers[], importantOnly, withTodosOnly, entryTypes[] }
 */
export function CallsFilterBar({ filters, callerOptions, onChange, resultCount }) {
  const [open, setOpen] = useState(false);

  const clear = () =>
    onChange({
      dateFrom: "",
      dateTo: "",
      callers: [],
      importantOnly: false,
      withTodosOnly: false,
      entryTypes: [],
    });

  const entryTypes = filters.entryTypes ?? [];

  const hasActive =
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    (filters.callers?.length ?? 0) > 0 ||
    filters.importantOnly ||
    filters.withTodosOnly ||
    entryTypes.length > 0;

  const summaryParts = [];
  if (filters.dateFrom || filters.dateTo) {
    summaryParts.push(`${filters.dateFrom || "…"} → ${filters.dateTo || "…"}`);
  }
  if (filters.callers?.length) {
    summaryParts.push(
      filters.callers.length === 1 ? filters.callers[0] : `${filters.callers.length} callers`
    );
  }
  if (entryTypes.length === 1) {
    const opt = ENTRY_TYPE_OPTIONS.find((o) => o.value === entryTypes[0]);
    summaryParts.push(opt?.label ?? entryTypes[0]);
  } else if (entryTypes.length > 1) {
    summaryParts.push("Both types");
  }
  if (filters.importantOnly) summaryParts.push("Important");
  if (filters.withTodosOnly) summaryParts.push("With todos");

  const toggleEntryType = (value) => {
    const next = entryTypes.includes(value)
      ? entryTypes.filter((v) => v !== value)
      : [...entryTypes, value];
    onChange({ ...filters, entryTypes: next });
  };

  return (
    <Card style={{ marginBottom: 0, padding: "10px 14px", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          all: "unset",
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <TileLabel>Filters</TileLabel>
          <span style={{ fontSize: 12, color: t.edge2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {hasActive ? summaryParts.join(" · ") : "None applied"}
            {` · ${resultCount} call${resultCount === 1 ? "" : "s"}`}
          </span>
        </div>
        {open ? <ChevronUp size={16} color="var(--color-slate)" /> : <ChevronDown size={16} color="var(--color-slate)" />}
      </button>

      {open && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            alignItems: "end",
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${t.frost}`,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: t.edge2, fontWeight: 600 }}>From</span>
            <input
              type="date"
              value={filters.dateFrom || ""}
              onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
              style={FIELD}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: t.edge2, fontWeight: 600 }}>To</span>
            <input
              type="date"
              value={filters.dateTo || ""}
              onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
              style={FIELD}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: t.edge2, fontWeight: 600 }}>Caller</span>
            <CallerMultiSelect
              options={callerOptions}
              selected={filters.callers ?? []}
              onChange={(callers) => onChange({ ...filters, callers })}
            />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "flex-end", paddingBottom: 4 }}>
            <span style={{ fontSize: 11, color: t.edge2, fontWeight: 600 }}>Type</span>
            {ENTRY_TYPE_OPTIONS.map((opt) => (
              <label key={opt.value} style={CHECK_LABEL}>
                <input
                  type="checkbox"
                  checked={entryTypes.includes(opt.value)}
                  onChange={() => toggleEntryType(opt.value)}
                  style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }}
                />
                {opt.label}
              </label>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "flex-end", paddingBottom: 4 }}>
            <label style={CHECK_LABEL}>
              <input
                type="checkbox"
                checked={Boolean(filters.importantOnly)}
                onChange={(e) => onChange({ ...filters, importantOnly: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }}
              />
              Important
            </label>
            <label style={CHECK_LABEL}>
              <input
                type="checkbox"
                checked={Boolean(filters.withTodosOnly)}
                onChange={(e) => onChange({ ...filters, withTodosOnly: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }}
              />
              Calls with todos
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
            <button type="button" onClick={clear} disabled={!hasActive} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, opacity: hasActive ? 1 : 0.45 }}>
              Clear filters
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

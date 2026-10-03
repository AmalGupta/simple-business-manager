import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../../theme.js";
import { fmtShort, fmtLong } from "../../lib/dates.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SELECTED_BG = `color-mix(in srgb, ${t.accent} 14%, ${t.white})`;
const DATE_COLOR = `color-mix(in srgb, ${t.edge} 65%, ${t.white})`;

const navButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
  cursor: "pointer",
  padding: 0,
};

const selectStyle = {
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
  padding: "5px 8px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
};

/* Month-grid date picker for Calls Needing Action. `days` is the month's
   cells from the view ({ date, calls, future }); a dot marks a day with
   calls, and days after today can't be picked. */
export function CnaCalendar({ days, selected, year, month, yearOptions, todayIso, onSelectDay, onChangeYear, onChangeMonth, onPrevMonth, onNextMonth }) {
  const leadingBlanks = new Date(year, month, 1).getDay();

  return (
    <div
      style={{
        width: "100%",
        border: `1px solid ${t.accent}`,
        borderRadius: t.radiusCard,
        background: t.white,
        padding: "12px 12px 10px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <button type="button" aria-label="Previous month" onClick={onPrevMonth} style={navButtonStyle}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          <select aria-label="Month" value={month} onChange={(e) => onChangeMonth(Number(e.target.value))} style={selectStyle}>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <select aria-label="Year" value={year} onChange={(e) => onChangeYear(Number(e.target.value))} style={selectStyle}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button type="button" aria-label="Next month" onClick={onNextMonth} style={navButtonStyle}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div
        role="group"
        aria-label="Select a day to see its calls"
        style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            aria-hidden="true"
            style={{ fontFamily: t.label, fontSize: 11, fontWeight: 600, color: t.edge2, textAlign: "center", padding: "2px 0 6px" }}
          >
            {label}
          </span>
        ))}

        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}

        {days.map((d) => {
          const dayNum = Number(d.date.slice(8, 10));
          const isToday = d.date === todayIso;
          const isSelected = d.date === selected;

          if (d.future) {
            return (
              <span
                key={d.date}
                aria-hidden="true"
                style={{ height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: t.frost }}
              >
                {dayNum}
              </span>
            );
          }

          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onSelectDay(d.date)}
              title={`${fmtShort(d.date)} · ${d.calls} ${d.calls === 1 ? "call" : "calls"}`}
              aria-label={`${fmtLong(d.date)}${isToday ? ", today" : ""}, ${d.calls} calls`}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              style={{
                position: "relative",
                height: 38,
                padding: 0,
                border: "none",
                borderRadius: t.radiusButton,
                background: isSelected ? SELECTED_BG : "transparent",
                color: isSelected ? t.accent : DATE_COLOR,
                fontSize: 13,
                fontWeight: isToday || isSelected ? 700 : 400,
                fontVariantNumeric: "tabular-nums",
                cursor: "pointer",
              }}
            >
              {dayNum}
              {d.calls > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 4,
                    width: 5,
                    height: 5,
                    marginLeft: -2.5,
                    borderRadius: "50%",
                    background: t.accent,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

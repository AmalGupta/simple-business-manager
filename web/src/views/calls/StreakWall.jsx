import { useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../../theme.js";
import { fmtShort, fmtLong } from "../../lib/dates.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function iconButtonStyle(disabled) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    flexShrink: 0,
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: t.radiusButton,
    background: "rgba(255,255,255,0.07)",
    color: disabled ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)",
    cursor: disabled ? "default" : "pointer",
    padding: 0,
  };
}

const selectStyle = {
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 10px",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: t.radiusButton,
  background: "rgba(255,255,255,0.07)",
  color: t.white,
};

/* ------------------------------------------------------------------
   Calendar — the signature element, now the entry point to a day.
   Shows a full month at a time (not a rolling 28-day window), with
   controls to jump to any month/year. A held day is a clear pane; a
   missed day is etched. Days after today in the displayed month have
   no data yet and render as empty, unclickable cells.
   ------------------------------------------------------------------ */
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/* Horizontal, scrollable — one row for the whole month, day-of-week
   stacked above the date so a column no longer has to line up visually.
   Each day carries a hover/focus tooltip with the date and call count. */
export function StreakWall({ days, onSelectDay, selected, year, month, onChangeYear, onChangeMonth, onPrevMonth, onNextMonth, yearOptions, todayIso }) {
  const todayRef = useRef(null);

  /* Auto-scroll today into view — a horizontal bar that opens scrolled to
     day 1 with today off-screen defeats "the focus date should be today." */
  useEffect(() => {
    todayRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [year, month, days]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <button aria-label="Previous month" onClick={onPrevMonth} style={iconButtonStyle(false)}>
          <ChevronLeft size={16} />
        </button>

        <div style={{ display: "flex", gap: 6 }}>
          <select
            aria-label="Month"
            value={month}
            onChange={(e) => onChangeMonth(Number(e.target.value))}
            style={selectStyle}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            value={year}
            onChange={(e) => onChangeYear(Number(e.target.value))}
            style={selectStyle}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button aria-label="Next month" onClick={onNextMonth} style={iconButtonStyle(false)}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div
        role="group"
        aria-label="Daily record. Select a day to see its calls."
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingTop: 26,
          paddingBottom: 4,
        }}
      >
        {days.map((d, i) => {
          const dayNum = Number(d.date.slice(8, 10));
          const dow = new Date(year, month, dayNum).getDay();

          if (d.future) {
            return (
              <span
                key={d.date}
                aria-hidden="true"
                style={{
                  flex: "0 0 40px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  minHeight: 52,
                  color: "rgba(255,255,255,0.25)",
                }}
              >
                <span style={{ fontSize: 10 }}>{WEEKDAY_LABELS[dow]}</span>
                <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{dayNum}</span>
              </span>
            );
          }

          const isToday = d.date === todayIso;

          return (
            <button
              key={d.date}
              ref={isToday ? todayRef : undefined}
              className="sbm-pane sbm-day sbm-tip"
              onClick={() => onSelectDay(d.date)}
              aria-label={`${fmtLong(d.date)}${isToday ? ", today" : ""}, ${d.held ? "held" : "missed"}, ${d.calls} calls`}
              aria-current={isToday ? "date" : undefined}
              style={{
                animationDelay: `${Math.min(i, 27) * 12}ms`,
                position: "relative",
                flex: "0 0 40px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                minHeight: 52,
                padding: 0,
                borderRadius: t.radius,
                cursor: "pointer",
                fontVariantNumeric: "tabular-nums",
                fontWeight: isToday ? 700 : 400,
                color: isToday ? t.edge : d.held ? "rgba(255,255,255,0.85)" : t.white,
                border: `1px solid ${d.date === selected ? t.white : isToday ? t.white : "rgba(255,255,255,0.15)"}`,
                background: isToday ? t.white : d.held ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.16)",
              }}
            >
              <span style={{ fontSize: 10, color: isToday ? t.edge2 : "rgba(255,255,255,0.5)" }}>
                {WEEKDAY_LABELS[dow]}
              </span>
              <span style={{ fontSize: 14 }}>{dayNum}</span>
              {d.calls > 0 && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: 4,
                    width: 4,
                    height: 4,
                    marginLeft: -2,
                    borderRadius: "50%",
                    background: isToday ? t.edge2 : "rgba(255,255,255,0.85)",
                  }}
                />
              )}
              <span className="sbm-tooltip" role="tooltip">
                {fmtShort(d.date)} · {d.calls} {d.calls === 1 ? "call" : "calls"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

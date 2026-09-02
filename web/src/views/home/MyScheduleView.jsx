import { useMemo, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../../theme.js";
import { today, dayKey, isoDate, fmtLong, fmtShort, isTaskDueDateUrgent } from "../../lib/dates.js";
import { WORKFLOW_CATEGORY_LABEL } from "../../lib/constants.js";
import { TILE_ROW_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const navButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  flexShrink: 0,
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
  padding: "8px 10px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
};

function buildMonthCells(year, month) {
  const startDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(isoDate(year, month, day));
  return cells;
}

function isOpenTodo(td) {
  return !td.status || td.status === "open";
}

function isOpenSiteTask(tk) {
  return !tk.status || tk.status === "assigned";
}

function toScheduleItem(td) {
  return { kind: "todo", id: td.id, title: td.text, sub: td.client_name, due_date: td.due_date, ref: td.call_id };
}

function toSiteScheduleItem(tk) {
  return {
    kind: "task",
    id: tk.id,
    title: tk.stage_label,
    sub: tk.site_name,
    category: tk.category,
    due_date: tk.due_date,
    ref: tk.site_name,
  };
}

function collectOpenItems(todos, siteTasks) {
  const items = [];
  for (const td of todos) {
    if (isOpenTodo(td)) items.push(toScheduleItem(td));
  }
  for (const tk of siteTasks) {
    if (isOpenSiteTask(tk)) items.push(toSiteScheduleItem(tk));
  }
  return items;
}

function indexTasksByDate(items) {
  const map = new Map();
  for (const item of items) {
    const key = dayKey(item.due_date);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function itemKey(item) {
  return `${item.kind}-${item.id}`;
}

const sectionLabelStyle = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge2,
  marginBottom: 6,
};

function TaskRow({ item, overdue, onOpenCall, onOpenSite }) {
  const urgent = isTaskDueDateUrgent(item.due_date);
  return (
    <button
      key={itemKey(item)}
      type="button"
      onClick={() => (item.kind === "todo" ? onOpenCall(item.ref) : onOpenSite(item.ref))}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "block",
        width: "100%",
        ...TILE_ROW_STYLE,
        ...(overdue ? { background: t.signalBg } : {}),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 500, color: t.edge }}>{item.title}</span>
        {item.due_date && (
          <span style={{ fontSize: 12, fontWeight: 700, color: overdue || urgent ? t.signal : t.edge2, whiteSpace: "nowrap" }}>
            {fmtShort(item.due_date)}
          </span>
        )}
      </div>
      {item.sub && <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>{item.sub}</div>}
      {item.kind === "task" && item.category && (
        <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
          {WORKFLOW_CATEGORY_LABEL[item.category] ?? item.category}
        </div>
      )}
    </button>
  );
}

function TaskListCard({ items, overdue, onOpenCall, onOpenSite }) {
  if (items.length === 0) return null;
  return (
    <Card style={{ marginBottom: "1rem" }}>
      {items.map((item) => (
        <TaskRow key={itemKey(item)} item={item} overdue={overdue} onOpenCall={onOpenCall} onOpenSite={onOpenSite} />
      ))}
    </Card>
  );
}

/* Staff To-Do / Calendar — month grid with tasks for the selected day listed below. */
export function MyScheduleView({ todos, siteTasks, onBack, onOpenCall, onOpenSite }) {
  const now = today();
  const todayIso = isoDate(now.getFullYear(), now.getMonth(), now.getDate());

  const [calMonth, setCalMonth] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));
  const [selectedDate, setSelectedDate] = useState(todayIso);

  const openItems = useMemo(() => collectOpenItems(todos, siteTasks), [todos, siteTasks]);
  const tasksByDate = useMemo(() => indexTasksByDate(openItems), [openItems]);

  const pastDueItems = useMemo(
    () =>
      openItems
        .filter((item) => item.due_date && dayKey(item.due_date) < todayIso)
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    [openItems, todayIso]
  );

  const pastDueKeys = useMemo(() => new Set(pastDueItems.map(itemKey)), [pastDueItems]);

  const selectedItems = useMemo(() => {
    const onDay = tasksByDate.get(selectedDate) ?? [];
    return onDay.filter((item) => !pastDueKeys.has(itemKey(item)));
  }, [tasksByDate, selectedDate, pastDueKeys]);

  const hasAny = openItems.length > 0;

  const yearOptions = useMemo(() => {
    const current = today().getFullYear();
    let earliest = current;
    for (const td of todos) {
      if (!isOpenTodo(td) || !td.due_date) continue;
      earliest = Math.min(earliest, new Date(td.due_date).getFullYear());
    }
    for (const tk of siteTasks) {
      if (!isOpenSiteTask(tk) || !tk.due_date) continue;
    }
    const out = [];
    for (let y = Math.min(earliest, current - 1); y <= current + 1; y++) out.push(y);
    return out;
  }, [todos, siteTasks]);

  const monthCells = useMemo(
    () => buildMonthCells(calMonth.year, calMonth.month),
    [calMonth.year, calMonth.month]
  );

  const selectDate = useCallback((date) => {
    setSelectedDate(date);
    setCalMonth({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });
  }, []);

  const goToMonth = useCallback((year, month) => {
    if (month < 0) {
      year -= 1;
      month = 11;
    } else if (month > 11) {
      year += 1;
      month = 0;
    }
    setCalMonth({ year, month });
  }, []);

  const hasPastDue = pastDueItems.length > 0;
  const hasSelectedDay = selectedItems.length > 0;

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        To-Do / Calendar
      </h1>

      <Card style={{ padding: "1rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => goToMonth(calMonth.year, calMonth.month - 1)}
            style={navButtonStyle}
          >
            <ChevronLeft size={16} />
          </button>

          <div style={{ display: "flex", gap: 6 }}>
            <select
              aria-label="Month"
              value={calMonth.month}
              onChange={(e) => goToMonth(calMonth.year, Number(e.target.value))}
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
              value={calMonth.year}
              onChange={(e) => goToMonth(Number(e.target.value), calMonth.month)}
              style={selectStyle}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            aria-label="Next month"
            onClick={() => goToMonth(calMonth.year, calMonth.month + 1)}
            style={navButtonStyle}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div
          role="grid"
          aria-label="Calendar"
          style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}
        >
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={`hdr-${i}`}
              role="columnheader"
              style={{
                fontFamily: t.label,
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: t.edge2,
                textAlign: "center",
                padding: "4px 0 6px",
              }}
            >
              {label}
            </div>
          ))}

          {monthCells.map((date, i) => {
            if (!date) {
              return <div key={`pad-${i}`} aria-hidden="true" />;
            }

            const dayNum = Number(date.slice(8, 10));
            const isToday = date === todayIso;
            const isSelected = date === selectedDate;
            const count = tasksByDate.get(date)?.length ?? 0;

            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                aria-label={`${fmtLong(date)}${isToday ? ", today" : ""}${count ? `, ${count} tasks` : ""}`}
                aria-pressed={isSelected}
                onClick={() => selectDate(date)}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 40,
                  padding: 0,
                  border: `1px solid ${isSelected ? t.accent : isToday ? t.edge : t.frost}`,
                  borderRadius: t.radiusButton,
                  background: isSelected ? "color-mix(in srgb, var(--color-accent) 12%, white)" : t.white,
                  cursor: "pointer",
                  fontFamily: t.body,
                  fontSize: 14,
                  fontWeight: isToday ? 700 : 400,
                  fontVariantNumeric: "tabular-nums",
                  color: t.edge,
                }}
              >
                {dayNum}
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: "50%",
                      bottom: 4,
                      width: 4,
                      height: 4,
                      marginLeft: -2,
                      borderRadius: "50%",
                      background: isSelected ? t.accent : t.edge2,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {hasPastDue && (
        <>
          <div style={sectionLabelStyle}>Past Due</div>
          <TaskListCard items={pastDueItems} overdue onOpenCall={onOpenCall} onOpenSite={onOpenSite} />
        </>
      )}

      <div style={{ ...sectionLabelStyle, marginTop: hasPastDue ? 4 : 0 }}>{fmtLong(selectedDate)}</div>

      {!hasAny ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing assigned to you right now.</p>
        </Card>
      ) : hasSelectedDay ? (
        <TaskListCard items={selectedItems} overdue={false} onOpenCall={onOpenCall} onOpenSite={onOpenSite} />
      ) : (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing due this day.</p>
        </Card>
      )}
    </div>
  );
}

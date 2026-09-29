import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { t } from "../../theme.js";
import { addDaysIso, fmtShort, todayIso } from "../../lib/dates.js";
import { fetchStaffRosterGrid } from "../../lib/api.js";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { fmtTimeLeft, urgentDeadline } from "./workDates.js";
import { CarriedForwardLabel } from "./CarriedForwardLabel.jsx";
import { TodoContext } from "../../components/TodoContext.jsx";

/* Fixed window around today: a week back, a fortnight ahead. The grid opens
   scrolled so today is the first column after the staff names. */
const DAYS_BACK = 7;
const DAYS_AHEAD = 15;
const itemKey = (item) => `${item.kind}-${item.id}-${item.user_id}`;

const cellStyle = {
  borderTop: `1px solid ${t.frost}`,
  borderLeft: `1px solid ${t.frost}`,
  padding: "8px",
  verticalAlign: "top",
  minWidth: 130,
  fontSize: 12,
  lineHeight: 1.35,
};

const headStyle = {
  ...cellStyle,
  borderTop: "none",
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge,
  whiteSpace: "nowrap",
  textAlign: "left",
};

const stickyCol = { position: "sticky", left: 0, background: t.white, zIndex: 1, borderLeft: "none", minWidth: 96 };

function weekdayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short" });
}

function CellList({ items, selectedKey, onSelect }) {
  if (items.length === 0) return null;
  return (
    <ol style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((item) => {
        const urgent = Boolean(item.urgent_at);
        const selected = itemKey(item) === selectedKey;
        return (
          <li key={itemKey(item)} style={{ marginBottom: 6, color: urgent ? t.signal : t.edge }}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "block",
                fontWeight: urgent ? 700 : 500,
                textDecoration: selected ? "underline" : "none",
              }}
            >
              {urgent && <AlertTriangle size={11} style={{ marginRight: 3, verticalAlign: "-1px" }} />}
              {item.title}
            </button>
            {item.site_name && <div style={{ color: t.edge2, fontSize: 11 }}>{item.site_name}</div>}
            <CarriedForwardLabel item={item} />
          </li>
        );
      })}
    </ol>
  );
}

function SelectedItemPanel({ item, staffName, onOpenSite, onOpenCall, onOpenComplaint, onClose }) {
  const urgent = Boolean(item.urgent_at);
  return (
    <Card style={{ marginBottom: "1rem", ...(urgent ? { borderColor: t.signal } : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: t.edge }}>
          {item.title}
          <TodoContext text={item.context} />
        </span>
        <button type="button" onClick={onClose} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: t.edge2 }}>
          Close
        </button>
      </div>
      <div style={{ fontSize: 12, color: t.edge2, marginTop: 4 }}>
        {item.kind === "complaint" ? "Complaint · " : ""}
        {staffName}
        {item.site_name ? ` · ${item.site_name}` : ""}
        {item.scheduled_for ? ` · planned ${fmtShort(item.scheduled_for)}` : ""}
        {item.due_date ? ` · due ${fmtShort(item.due_date)}` : ""}
      </div>
      <CarriedForwardLabel item={item} style={{ fontSize: 12, marginTop: 4 }} />
      {urgent && (
        <div style={{ fontSize: 12, fontWeight: 700, color: t.signal, marginTop: 4 }}>
          Urgent · {fmtTimeLeft(urgentDeadline(item.urgent_at))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {item.site_name && (
          <button type="button" onClick={() => onOpenSite(item.site_name)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
            Open site
          </button>
        )}
        {item.call_id && (
          <button type="button" onClick={() => onOpenCall(item.call_id)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
            Open call
          </button>
        )}
        {item.kind === "complaint" && onOpenComplaint && (
          <button type="button" onClick={() => onOpenComplaint(item.id)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
            Open complaint
          </button>
        )}
      </div>
    </Card>
  );
}

/* Admin staff roster — staff × days, each cell the numbered list of work
   that person has planned for that day. Tap a name for their audit trail;
   tap an item for its details (urgent is set while routing the call, not
   here). Covers a week back and 15 days ahead;
   work planned before that window but not done collects in "Slipped".
   Unplanned work is a count per person. */
export function StaffRosterView({ onBack, onOpenStaff, onOpenSite, onOpenCall, onOpenComplaint }) {
  const today = todayIso();
  const from = addDaysIso(today, -DAYS_BACK);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const days = useMemo(
    () => Array.from({ length: DAYS_BACK + 1 + DAYS_AHEAD }, (_, i) => addDaysIso(from, i)),
    [from]
  );
  const to = days[days.length - 1];
  const scrollerRef = useRef(null);
  const todayHeadRef = useRef(null);
  const stickyHeadRef = useRef(null);
  const scrolledOnce = useRef(false);

  const load = useCallback(() => {
    return fetchStaffRosterGrid(to)
      .then((grid) => {
        setData(grid);
        setError(null);
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff roster", err);
        setError("Couldn’t load the roster.");
      });
  }, [to]);

  useEffect(() => {
    load();
  }, [load]);

  /* user_id → { slipped: [], byDay: Map(date → []) } */
  const cells = useMemo(() => {
    const out = new Map();
    if (!data) return out;
    for (const s of data.staff) out.set(s.id, { slipped: [], byDay: new Map() });
    for (const item of data.items) {
      const row = out.get(item.user_id);
      if (!row) continue;
      const day = item.scheduled_for ?? today;
      if (day < from && day < today) row.slipped.push(item);
      else if (day >= from && day <= to) {
        if (!row.byDay.has(day)) row.byDay.set(day, []);
        row.byDay.get(day).push(item);
      }
    }
    for (const row of out.values()) {
      const urgentFirst = (a, b) => Number(Boolean(b.urgent_at)) - Number(Boolean(a.urgent_at));
      row.slipped.sort(urgentFirst);
      for (const list of row.byDay.values()) list.sort(urgentFirst);
    }
    return out;
  }, [data, from, to, today]);

  const showSlipped = [...cells.values()].some((r) => r.slipped.length > 0);

  /* Open on today, past days reachable by scrolling left. Only on first
     paint — a reload must not yank the scroll back. */
  useLayoutEffect(() => {
    if (!data || scrolledOnce.current) return;
    const scroller = scrollerRef.current;
    const head = todayHeadRef.current;
    if (!scroller || !head) return;
    scroller.scrollLeft = head.offsetLeft - (stickyHeadRef.current?.offsetWidth ?? 0);
    scrolledOnce.current = true;
  }, [data]);
  const staffName = (id) => data?.staff.find((s) => s.id === id)?.name ?? "";

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1rem" }}>Staff roster</h1>

      <p style={{ fontSize: 12, color: t.edge2, margin: "0 0 1rem" }}>
        {fmtShort(from)} – {fmtShort(to)} · scroll right for the next {DAYS_AHEAD} days, left for the last {DAYS_BACK}
      </p>

      {selected && (
        <SelectedItemPanel
          item={selected}
          staffName={staffName(selected.user_id)}
          onOpenSite={onOpenSite}
          onOpenCall={onOpenCall}
          onOpenComplaint={onOpenComplaint}
          onClose={() => setSelected(null)}
        />
      )}

      {error && <p style={{ fontSize: 14, color: t.edge2 }}>{error}</p>}
      {!data && !error && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}

      {data && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div ref={scrollerRef} style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th ref={stickyHeadRef} style={{ ...headStyle, ...stickyCol }}>Staff</th>
                  {showSlipped && <th style={{ ...headStyle, color: t.putty }}>Slipped</th>}
                  {days.map((d) => (
                    <th
                      key={d}
                      ref={d === today ? todayHeadRef : undefined}
                      style={{ ...headStyle, ...(d === today ? { color: t.accent } : d < today ? { color: t.edge2 } : {}) }}
                    >
                      {weekdayLabel(d)} {fmtShort(d)}
                    </th>
                  ))}
                  <th style={headStyle}>Not planned</th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map((s) => {
                  const row = cells.get(s.id);
                  /* SBM-64: days outside someone's working span (before joining,
                     after the last working day) are shaded, and the name cell
                     says why — "Joins 5 Oct" / "Leaving 30 Sept · 4 left". */
                  const outside = (d) => (s.joined_on && d < s.joined_on) || (s.last_working_day && d > s.last_working_day);
                  const held = s.held ?? 0;
                  const leaving = s.disabled_at || s.last_working_day;
                  return (
                    <tr key={s.id}>
                      <td style={{ ...cellStyle, ...stickyCol }}>
                        <button
                          type="button"
                          onClick={() => onOpenStaff(s)}
                          style={{ all: "unset", cursor: "pointer", fontWeight: 700, color: t.accent, fontSize: 13 }}
                        >
                          {s.name}
                        </button>
                        {s.joined_on && s.joined_on > today && (
                          <span style={{ display: "block", fontSize: 11, color: t.edge2, marginTop: 2 }}>Joins {fmtShort(s.joined_on)}</span>
                        )}
                        {leaving && (
                          <span
                            style={{
                              display: "block",
                              fontSize: 11,
                              marginTop: 2,
                              fontWeight: 700,
                              /* Red only when work is still held and the last day is at hand or gone. */
                              color: held > 0 && (s.disabled_at || s.last_working_day <= today) ? t.signal : t.putty,
                            }}
                          >
                            {s.disabled_at ? "Left" : `Leaving ${fmtShort(s.last_working_day)}`} · {held} left
                          </span>
                        )}
                      </td>
                      {showSlipped && (
                        <td style={cellStyle}>
                          <CellList items={row.slipped} selectedKey={selected && itemKey(selected)} onSelect={setSelected} />
                        </td>
                      )}
                      {days.map((d) => (
                        <td
                          key={d}
                          style={{
                            ...cellStyle,
                            ...(d === today ? { background: t.frostSoft } : {}),
                            ...(outside(d) ? { background: t.pane } : {}),
                          }}
                        >
                          <CellList
                            items={row.byDay.get(d) ?? []}
                            selectedKey={selected && itemKey(selected)}
                            onSelect={setSelected}
                          />
                        </td>
                      ))}
                      <td style={{ ...cellStyle, color: t.edge2 }}>{data.unscheduled_counts[s.id] ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

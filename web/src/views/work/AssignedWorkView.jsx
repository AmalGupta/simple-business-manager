import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, MapPin, Phone } from "lucide-react";
import { t } from "../../theme.js";
import { fmtDate, fmtShort, todayIso } from "../../lib/dates.js";
import { WORKFLOW_CATEGORY_LABEL } from "../../lib/constants.js";
import { fetchAssignedWork, fetchStaffRoster, patchWork, postWorkHandoff } from "../../lib/api.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { urgentDeadline, fmtTimeLeft } from "./workDates.js";
import { CarriedForwardLabel } from "./CarriedForwardLabel.jsx";
import { TodoContext } from "../../components/TodoContext.jsx";

const UNPLANNED_PAGE = 30;

const sectionLabelStyle = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge,
  margin: "0 0 6px",
};

const itemKey = (item) => `${item.kind}-${item.id}`;

/* Urgent first, then plans that slipped into the past, then by planned
   day, then everything not yet planned. */
function groupItems(items, today) {
  const urgent = [];
  const overdue = [];
  const byDay = new Map();
  const unplanned = [];
  for (const item of items) {
    if (item.urgent_at) urgent.push(item);
    else if (!item.scheduled_for) unplanned.push(item);
    else if (item.scheduled_for < today) overdue.push(item);
    else {
      if (!byDay.has(item.scheduled_for)) byDay.set(item.scheduled_for, []);
      byDay.get(item.scheduled_for).push(item);
    }
  }
  urgent.sort((a, b) => String(a.urgent_at).localeCompare(String(b.urgent_at)));
  overdue.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  unplanned.sort((a, b) => {
    const ad = a.due_date ?? "9999";
    const bd = b.due_date ?? "9999";
    return ad.localeCompare(bd);
  });
  return { urgent, overdue, days, unplanned };
}

function PassOnPicker({ roster, selfId, busy, onPick, onCancel }) {
  const [to, setTo] = useState("");
  const options = roster.filter((s) => s.id !== selfId);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
      <select
        aria-label="Pass on to"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{ ...TEXT_INPUT_STYLE, gridColumn: "1 / -1", minHeight: 44 }}
      >
        <option value="">Pass on to…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!to || busy}
        onClick={() => onPick(to)}
        style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, background: t.accent, color: t.white, border: "none", opacity: !to || busy ? 0.5 : 1 }}
      >
        Pass on
      </button>
      <button type="button" onClick={onCancel} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
        Cancel
      </button>
    </div>
  );
}

function WorkRow({ item, first, today, canAdmin, roster, selfId, busy, onSchedule, onDone, onHandOff, onUrgent, onOpenSite, onOpenCall }) {
  const [passing, setPassing] = useState(false);
  const urgent = Boolean(item.urgent_at);
  const deadline = urgent ? urgentDeadline(item.urgent_at) : null;
  const overdue = !urgent && item.scheduled_for && item.scheduled_for < today;
  const context =
    item.kind === "site_task" ? WORKFLOW_CATEGORY_LABEL[item.category] ?? item.category : item.client_name;

  return (
    <div
      style={{
        ...TILE_ROW_STYLE,
        padding: "12px 0",
        ...(first ? { borderTop: "none" } : {}),
        ...(urgent ? { background: t.signalBg, margin: "0 -1.25rem", padding: "12px 1.25rem" } : {}),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: t.edge, lineHeight: 1.4 }}>
          {item.title}
          <TodoContext text={item.context} />
        </span>
        {urgent ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: t.signal, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={13} /> {fmtTimeLeft(deadline)}
          </span>
        ) : (
          item.due_date && (
            <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>due {fmtShort(item.due_date)}</span>
          )
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4, fontSize: 12, color: t.edge2 }}>
        {item.site_name && (
          <button
            type="button"
            onClick={() => onOpenSite(item.site_name)}
            style={{ all: "unset", cursor: "pointer", color: t.accent, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}
          >
            <MapPin size={12} /> {item.site_name}
          </button>
        )}
        {item.call_id && (
          <button
            type="button"
            onClick={() => onOpenCall(item.call_id)}
            style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <Phone size={12} /> {context}
          </button>
        )}
        {item.kind === "site_task" && context && <span>{context}</span>}
        {overdue && <span style={{ color: t.putty, fontWeight: 700 }}>planned {fmtShort(item.scheduled_for)}</span>}
      </div>
      <CarriedForwardLabel item={item} style={{ fontSize: 12, marginTop: 4 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "center", marginTop: 10 }}>
        {urgent && !canAdmin ? (
          <span style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 700, color: t.signal }}>
            Urgent — finish today, can’t be moved
          </span>
        ) : (
          <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.edge2 }}>
            Plan for
            <input
              type="date"
              aria-label="Plan for date"
              value={item.scheduled_for ?? ""}
              min={canAdmin ? undefined : today}
              disabled={busy}
              onChange={(e) => onSchedule(item, e.target.value || null)}
              style={{ ...TEXT_INPUT_STYLE, minHeight: 44, flex: 1, minWidth: 0 }}
            />
          </label>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onDone(item)}
          style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
        >
          <Check size={14} /> Done
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setPassing((p) => !p)}
          style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
        >
          <ArrowRightLeft size={14} /> Pass on
        </button>
        {canAdmin && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onUrgent(item, !urgent)}
            style={{
              ...SMALL_SECONDARY_BUTTON_STYLE,
              gridColumn: "1 / -1",
              minHeight: 44,
            }}
          >
            {urgent ? "Clear urgent" : "Mark urgent"}
          </button>
        )}
      </div>

      {passing && (
        <PassOnPicker
          roster={roster}
          selfId={selfId}
          busy={busy}
          onCancel={() => setPassing(false)}
          onPick={async (to) => {
            await onHandOff(item, to);
            setPassing(false);
          }}
        />
      )}
    </div>
  );
}

function Section({ label, items, ...rowProps }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p style={{ ...sectionLabelStyle, ...(label.danger ? { color: t.signal } : {}) }}>{label.text}</p>
      <Card style={{ paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}>
        {items.map((item, i) => (
          <WorkRow key={itemKey(item)} item={item} first={i === 0} busy={rowProps.busyKeys.has(itemKey(item))} {...rowProps} />
        ))}
      </Card>
    </div>
  );
}

/* Staff "Assigned work" — every open call todo and site task assigned to
   one staff member. Plan each onto a day, mark done, or pass it on.
   Urgent items (admin-flagged) can't be moved. Admin viewing a staff
   bookmark (`forUserId`) can also mark/clear urgent. */
export function AssignedWorkView({ forUserId = null, selfId, canAdmin = false, onBack, onOpenSite, onOpenCall, onChanged }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [roster, setRoster] = useState([]);
  const [busyKeys, setBusyKeys] = useState(() => new Set());
  const [unplannedShown, setUnplannedShown] = useState(UNPLANNED_PAGE);
  const today = todayIso();
  const subjectId = forUserId ?? selfId;

  const load = useCallback(() => {
    return fetchAssignedWork({ forUserId })
      .then((rows) => {
        setItems(rows);
        setError(null);
      })
      .catch((err) => {
        console.error("[sbm] failed to load assigned work", err);
        setError("Couldn’t load assigned work. Go back and try again.");
      });
  }, [forUserId]);

  useEffect(() => {
    load();
    fetchStaffRoster()
      .then(setRoster)
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  }, [load]);

  const withBusy = useCallback(
    async (item, fn) => {
      const key = itemKey(item);
      setBusyKeys((s) => new Set(s).add(key));
      try {
        await fn();
        onChanged?.();
      } catch (err) {
        console.error("[sbm] assigned work update failed", err);
        window.alert(err.message || "Update failed");
        await load();
      } finally {
        setBusyKeys((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    },
    [load, onChanged]
  );

  const removeItem = (item) => setItems((list) => list.filter((i) => itemKey(i) !== itemKey(item)));

  const rowProps = {
    today,
    canAdmin,
    roster,
    selfId: subjectId,
    busyKeys,
    onOpenSite,
    onOpenCall,
    onSchedule: (item, date) =>
      withBusy(item, async () => {
        await patchWork(item.kind, item.id, { scheduled_for: date }, { forUserId });
        setItems((list) => list.map((i) => (itemKey(i) === itemKey(item) ? { ...i, scheduled_for: date } : i)));
      }),
    onDone: (item) =>
      withBusy(item, async () => {
        await patchWork(item.kind, item.id, { status: "done" }, { forUserId });
        removeItem(item);
      }),
    onHandOff: (item, toUserId) =>
      withBusy(item, async () => {
        await postWorkHandoff(item.kind, item.id, toUserId, { forUserId });
        removeItem(item);
      }),
    onUrgent: (item, urgent) =>
      withBusy(item, async () => {
        await patchWork(item.kind, item.id, { urgent });
        await load();
      }),
  };

  const groups = useMemo(() => (items ? groupItems(items, today) : null), [items, today]);

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        Assigned work
      </h1>

      {error && <p style={{ fontSize: 14, color: t.edge2 }}>{error}</p>}
      {!items && !error && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}

      {groups && items.length === 0 && (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing assigned right now.</p>
        </Card>
      )}

      {groups && (
        <>
          <Section label={{ text: "Urgent — due within 24 hours", danger: true }} items={groups.urgent} {...rowProps} />
          <Section label={{ text: "Planned earlier, not done" }} items={groups.overdue} {...rowProps} />
          {groups.days.map(([day, dayItems]) => (
            <Section
              key={day}
              label={{ text: day === today ? `Today · ${fmtDate(day)}` : fmtDate(day) }}
              items={dayItems}
              {...rowProps}
            />
          ))}
          <Section
            label={{ text: `Not planned yet (${groups.unplanned.length})` }}
            items={groups.unplanned.slice(0, unplannedShown)}
            {...rowProps}
          />
          {groups.unplanned.length > unplannedShown && (
            <button
              type="button"
              onClick={() => setUnplannedShown((n) => n + UNPLANNED_PAGE)}
              style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, width: "100%" }}
            >
              Show more ({groups.unplanned.length - unplannedShown} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

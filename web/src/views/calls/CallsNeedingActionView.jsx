import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../../theme.js";
import { today, isoDate, todayIso, fmtShort } from "../../lib/dates.js";
import { BackLink } from "../../components/BackLink.jsx";
import { Modal } from "../../components/Modal.jsx";
import { StreakWall } from "./StreakWall.jsx";
import { CallActionCard } from "./CallActionCard.jsx";
import { PRIMARY_BUTTON_STYLE } from "../../styles.js";
import {
  CNA_LOOKBACK_DAYS,
  adjustCallsNeedingActionCalendar,
  callsNeedingActionDay,
  callsNeedingActionLookback,
  callsNeedingActionWindowIndex,
  getCachedCallsNeedingAction,
  getCachedCallsNeedingActionCalendar,
  hasCallsNeedingActionCalendarWindow,
  loadCallsNeedingAction,
  loadCallsNeedingActionCalendar,
  refreshCallsNeedingAction,
  resolveCall,
  postTodoVoiceNote,
} from "../../lib/api.js";

const CARD_GAP = 16;

function callDateIso(call) {
  return (call.recording_date || call.recorded_at || "").slice(0, 10);
}

/** Most recent day with calls at or before `ceilIso`. */
function latestDayWithCalls(days, ceilIso) {
  let best = null;
  for (const [day, n] of Object.entries(days)) {
    if (n > 0 && day <= ceilIso && (best === null || day > best)) best = day;
  }
  return best;
}

/** Cards visible at once — max 3 so CNA action toolbars stay usable. Keep
 *  in sync with `.cna-carousel` breakpoints below. */
function computeVisibleCount() {
  if (typeof window === "undefined" || !window.matchMedia) return 1;
  if (window.matchMedia("(min-width: 768px)").matches) return 3;
  return 1;
}

function iconButtonStyle(disabled) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    flexShrink: 0,
    border: `1px solid ${t.frost}`,
    borderRadius: t.radiusButton,
    background: t.white,
    color: disabled ? t.frost : t.edge,
    cursor: disabled ? "default" : "pointer",
    padding: 0,
  };
}

/* Admin carousel of calls with an AI-generated todo list not yet resolved —
   opened from the home tile CallsNeedingActionTile.

   One day at a time (SBM-102). The date strip's dots come from per-day counts
   held in memory in 30-day windows (lib/api.js loadCallsNeedingActionCalendar):
   today − 30 … today loads once per page; an older window (today − 60 …
   today − 31, and so on) loads only the first time a date inside it is
   clicked. Opening fetches today's cards alongside the dots and only if today
   is empty moves to the latest marked day. Picking a day makes one request
   for that day's cards (cached per day) and the carousel shows just those.

   Replaces the multi-day window + scroll-widening carousel: a busy window ran
   into the server's 200-call cap and the newest days never loaded. */
export function CallsNeedingActionView({
  staffRoster,
  currentUser = null,
  /** ISO day from the home StreakWall — open on that date instead of today. */
  initialFocusDate = null,
  onAssignTodo,
  /** Dashboard onToggle — PATCH done/open; the server logs the Task audit event. */
  onToggleTodo,
  busyIds = null,
  onResolved,
  onBack,
}) {
  const openDate = useMemo(() => {
    const requested =
      typeof initialFocusDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(initialFocusDate)
        ? initialFocusDate.slice(0, 10)
        : null;
    return requested && requested <= todayIso() ? requested : todayIso();
  }, [initialFocusDate]);

  const [selectedDate, setSelectedDate] = useState(openDate);
  const [items, setItems] = useState(() => getCachedCallsNeedingAction(callsNeedingActionDay(openDate))?.items ?? null);
  const [voiceNotesByTodoId, setVoiceNotesByTodoId] = useState(
    () => getCachedCallsNeedingAction(callsNeedingActionDay(openDate))?.voiceNotesByTodoId ?? new Map()
  );
  const [calendar, setCalendar] = useState(getCachedCallsNeedingActionCalendar);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolveAckOpen, setResolveAckOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => ({
    year: Number(openDate.slice(0, 4)),
    month: Number(openDate.slice(5, 7)) - 1,
  }));
  const [visibleCount, setVisibleCount] = useState(computeVisibleCount);
  const [scrollIndex, setScrollIndex] = useState(0);
  const carouselRef = useRef(null);
  // Latest day asked for — a slow response for a day already clicked away
  // from must not overwrite the one now on screen.
  const requestedDay = useRef(openDate);

  const loadDots = useCallback(
    (index) =>
      loadCallsNeedingActionCalendar(index)
        .then((data) => {
          setCalendar(data);
          return data;
        })
        .catch((err) => {
          console.error("[sbm] failed to load calls-needing-action calendar", err);
          return null;
        }),
    []
  );

  const showDay = useCallback(async (date) => {
    requestedDay.current = date;
    const windowIndex = callsNeedingActionWindowIndex(date);
    if (windowIndex !== null && !hasCallsNeedingActionCalendarWindow(windowIndex)) loadDots(windowIndex);
    setSelectedDate(date);
    setCalMonth((prev) => {
      const year = Number(date.slice(0, 4));
      const month = Number(date.slice(5, 7)) - 1;
      return prev.year === year && prev.month === month ? prev : { year, month };
    });
    const cached = getCachedCallsNeedingAction(callsNeedingActionDay(date));
    if (cached) {
      setItems(cached.items);
      setVoiceNotesByTodoId(cached.voiceNotesByTodoId);
    } else {
      setItems(null);
    }
    setLoading(true);
    setError("");
    try {
      const data = await loadCallsNeedingAction(callsNeedingActionDay(date));
      if (requestedDay.current !== date) return null;
      setItems(data.items);
      setVoiceNotesByTodoId(data.voiceNotesByTodoId);
      return data.items.length;
    } catch (err) {
      console.error("[sbm] failed to load calls needing action", err);
      if (requestedDay.current === date) setError("Failed to load — try again.");
      return null;
    } finally {
      if (requestedDay.current === date) setLoading(false);
    }
  }, [loadDots]);

  // Opening: today's (or the requested day's) cards and the dots go out
  // together. Only when the day opened on is today and it's empty does the
  // view move to the latest day that has calls.
  useEffect(() => {
    const cards = showDay(openDate);
    const dots = loadDots(0);
    Promise.all([cards, dots]).then(([count, data]) => {
      if (count !== 0 || !data || openDate !== todayIso() || requestedDay.current !== openDate) return;
      const latest = latestDayWithCalls(data.days, todayIso());
      if (latest && latest !== openDate) showDay(latest);
    });
  }, [openDate, showDay, loadDots]);

  useEffect(() => {
    const onResize = () => setVisibleCount(computeVisibleCount());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // A new day starts at its first card.
  useEffect(() => {
    carouselRef.current?.scrollTo({ left: 0, behavior: "instant" });
    setScrollIndex(0);
  }, [selectedDate]);

  const count = items?.length ?? 0;

  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const child = container.children[0];
        const step = child ? child.offsetWidth + CARD_GAP : 1;
        setScrollIndex(Math.max(0, Math.round(container.scrollLeft / step)));
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
    // The carousel only renders once there's a card, so re-attach then.
  }, [count > 0]);

  const days = calendar?.days ?? {};
  const lookbackTotal = useMemo(() => {
    if (!calendar) return null;
    const { dateFrom } = callsNeedingActionLookback();
    return Object.entries(calendar.days).reduce((sum, [day, n]) => (day >= dateFrom ? sum + n : sum), 0);
  }, [calendar]);

  const monthDays = useMemo(() => {
    const nowIso = todayIso();
    const { year, month } = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoDate(year, month, day);
      const future = iso > nowIso;
      out.push({ date: iso, held: future ? null : true, calls: days[iso] ?? 0, future });
    }
    return out;
  }, [calMonth, days]);

  const yearOptions = useMemo(() => {
    const current = today().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  const goToMonth = (year, month) => {
    let y = year;
    let m = month;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setCalMonth({ year: y, month: m });
  };

  const scrollByPage = (direction) => {
    const container = carouselRef.current;
    if (!container) return;
    const child = container.children[0];
    const step = child ? child.offsetWidth + CARD_GAP : container.clientWidth;
    container.scrollBy({ left: direction * visibleCount * step, behavior: "smooth" });
  };

  /* Mutations patch the day on screen locally, then refresh that day's cache
     entry in the background so reopening it reads current data. */
  const resyncSelectedDay = () => refreshCallsNeedingAction(callsNeedingActionDay(selectedDate)).catch(() => {});

  const patchCall = (callId, fn) =>
    setItems((prev) => (prev ? prev.map((call) => (call.id === callId ? fn(call) : call)) : prev));

  const handleAssignTodo = async (todoId, userIds) => {
    const updated = await onAssignTodo(todoId, userIds);
    if (updated?.id) {
      setItems((prev) =>
        prev
          ? prev.map((call) => ({
              ...call,
              todos: call.todos.map((td) => (td.id === updated.id ? { ...td, ...updated } : td)),
            }))
          : prev
      );
    }
    resyncSelectedDay();
  };

  const handleToggleTodo = async (callId, todo) => {
    const patch =
      todo.status === "done"
        ? { status: "open", completed_at: null }
        : { status: "done", completed_at: new Date().toISOString() };
    patchCall(callId, (call) => ({
      ...call,
      todos: call.todos.map((td) => (td.id === todo.id ? { ...td, ...patch } : td)),
    }));
    await onToggleTodo(todo);
    /* onToggleTodo swallows a rejected PATCH, so take the todo's status back
       from the server rather than trusting the optimistic patch. */
    const day = selectedDate;
    const data = await refreshCallsNeedingAction(callsNeedingActionDay(day)).catch(() => null);
    const fresh = data?.items
      ?.find((call) => call.id === callId)
      ?.todos?.find((td) => td.id === todo.id);
    if (!fresh || requestedDay.current !== day) return;
    patchCall(callId, (call) => ({
      ...call,
      todos: call.todos.map((td) =>
        td.id === todo.id ? { ...td, status: fresh.status, completed_at: fresh.completed_at ?? null } : td
      ),
    }));
  };

  const handleAssignTodoSite = (callId, result) => {
    const updated = result?.todo;
    const siteName = result?.site_name;
    if (!updated?.id) return;
    patchCall(callId, (call) => {
      const siteNames = new Set(call.sites ?? []);
      if (siteName) siteNames.add(siteName);
      return {
        ...call,
        sites: [...siteNames],
        todos: call.todos.map((td) =>
          td.id === updated.id
            ? { ...td, ...updated, site_id: result.site_id, site_name: siteName ?? updated.site_name }
            : td
        ),
      };
    });
    resyncSelectedDay();
  };

  const handleResolve = async (callId) => {
    const call = items?.find((c) => c.id === callId);
    await resolveCall(callId);
    setItems((prev) => (prev ? prev.filter((c) => c.id !== callId) : prev));
    // One call out of the qualifying set: drop that day's count by one (the
    // dot clears with its last call) instead of refetching the calendar.
    const day = call ? callDateIso(call) : null;
    if (day) {
      const next = adjustCallsNeedingActionCalendar(day, -1);
      if (next) setCalendar(next);
    }
    onResolved?.();
    setResolveAckOpen(true);
    resyncSelectedDay();
  };

  const handleAddVoiceNote = async (todoId, blob, fileName) => {
    const note = await postTodoVoiceNote(todoId, blob, fileName);
    setVoiceNotesByTodoId((prev) => {
      const next = new Map(prev);
      next.set(todoId, note);
      return next;
    });
    resyncSelectedDay();
  };

  const atStart = scrollIndex <= 0;
  const atEnd = scrollIndex >= count - visibleCount;
  const dayLabel = `${fmtShort(selectedDate)}${selectedDate === todayIso() ? " (today)" : ""}`;
  const lookbackLabel = `Calls needing action in last ${CNA_LOOKBACK_DAYS} days${
    lookbackTotal === null ? "" : ` · ${lookbackTotal}`
  }`;

  return (
    <div>
      <style>{`
        .cna-carousel-shell {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .cna-carousel-nav {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .cna-carousel {
          display: flex;
          align-items: stretch;
          gap: ${CARD_GAP}px;
          overflow-x: auto;
          overflow-y: visible;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          padding-bottom: 8px;
          -webkit-overflow-scrolling: touch;
        }
        .cna-carousel > * {
          scroll-snap-align: start;
          flex: 0 0 100%;
          /* stretch (default with align-items: stretch) equalizes row height */
        }
        @media (min-width: 768px) {
          .cna-carousel > * { flex: 0 0 calc((100% - ${CARD_GAP * 2}px) / 3); }
        }
      `}</style>

      <div style={{ background: t.accent, margin: "-2rem -1.25rem 1.5rem", padding: "1.25rem 1.25rem 1.5rem" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
          <BackLink onClick={onBack} style={{ color: "rgba(255,255,255,0.85)", marginBottom: 0 }}>
            Back
          </BackLink>
          <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 600, color: t.white }}>
            Calls Needing Action
          </span>
        </header>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            marginBottom: "1rem",
            fontSize: 12,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <span>{loading && items === null ? "Loading…" : `${count} ${count === 1 ? "call" : "calls"} · ${dayLabel}`}</span>
          <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.85)", textAlign: "right" }}>
            {lookbackLabel}
          </span>
        </div>

        <StreakWall
          days={monthDays}
          onSelectDay={showDay}
          selected={selectedDate}
          year={calMonth.year}
          month={calMonth.month}
          yearOptions={yearOptions}
          onChangeYear={(y) => goToMonth(y, calMonth.month)}
          onChangeMonth={(m) => goToMonth(calMonth.year, m)}
          onPrevMonth={() => goToMonth(calMonth.year, calMonth.month - 1)}
          onNextMonth={() => goToMonth(calMonth.year, calMonth.month + 1)}
          todayIso={todayIso()}
        />
      </div>

      {items === null && !error && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}
      {error && <p style={{ fontSize: 14, color: t.signal }}>{error}</p>}
      {items !== null && count === 0 && !error && (
        <p style={{ fontSize: 14, color: t.edge2 }}>
          {lookbackTotal === 0
            ? `Nothing needs action in the last ${CNA_LOOKBACK_DAYS} days.`
            : `No calls need action on ${dayLabel}. Pick a marked date above.`}
        </p>
      )}

      {count > 0 && (
        <div className="cna-carousel-shell">
          <div className="cna-carousel-nav">
            <button aria-label="Previous" onClick={() => scrollByPage(-1)} disabled={atStart} style={iconButtonStyle(atStart)}>
              <ChevronLeft size={16} />
            </button>
            <button aria-label="Next" onClick={() => scrollByPage(1)} disabled={atEnd} style={iconButtonStyle(atEnd)}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div ref={carouselRef} className="cna-carousel">
            {items.map((call) => (
              <CallActionCard
                key={call.id}
                call={call}
                staffRoster={staffRoster}
                currentUser={currentUser}
                onAssignTodo={handleAssignTodo}
                onAssignTodoSite={handleAssignTodoSite}
                onToggleTodo={onToggleTodo ? handleToggleTodo : undefined}
                busyIds={busyIds}
                onResolve={handleResolve}
                onAddVoiceNote={handleAddVoiceNote}
                voiceNotesByTodoId={voiceNotesByTodoId}
              />
            ))}
          </div>
        </div>
      )}

      {resolveAckOpen && (
        <Modal
          title="Call resolved"
          label="Call resolved"
          onClose={() => setResolveAckOpen(false)}
          width={400}
        >
          <p style={{ margin: 0, fontSize: 14, color: t.edge, lineHeight: 1.45 }}>
            Call resolved. You can view it in the Resolved Calls homepage tile.
          </p>
          <button type="button" onClick={() => setResolveAckOpen(false)} style={{ ...PRIMARY_BUTTON_STYLE, alignSelf: "flex-end" }}>
            OK
          </button>
        </Modal>
      )}
    </div>
  );
}

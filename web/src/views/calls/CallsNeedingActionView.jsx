import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../../theme.js";
import { today, isoDate, todayIso, addDaysIso, fmtShort } from "../../lib/dates.js";
import { BackLink } from "../../components/BackLink.jsx";
import { StreakWall } from "./StreakWall.jsx";
import { CallActionCard } from "./CallActionCard.jsx";
import {
  CNA_WINDOW_DAYS,
  defaultCallsNeedingActionWindow,
  fetchCallsNeedingActionCalendar,
  getCachedCallsNeedingAction,
  loadCallsNeedingAction,
  refreshCallsNeedingAction,
  resolveCall,
  postTodoVoiceNote,
} from "../../lib/api.js";

const CARD_GAP = 16;

/** Consecutive empty CNA_WINDOW_DAYS steps before auto-widening backwards
 *  gives up and waits for an explicit "Load earlier days". */
const MAX_EMPTY_BACK_STEPS = 2;

function callDateIso(call) {
  return (call.recording_date || call.recorded_at || "").slice(0, 10);
}

/* Same ordering the server returns (queries.ts getCallsNeedingAction) — the
   carousel merges several fetched windows, so it has to re-establish that
   order itself rather than trusting arrival order. Keeping the two in step is
   what lets indexForDate below find a day by scanning forward. */
function byCallDate(a, b) {
  const da = callDateIso(a);
  const db = callDateIso(b);
  if (da !== db) return da < db ? -1 : 1;
  return (a.recorded_at ?? "") < (b.recorded_at ?? "") ? -1 : 1;
}

function computeVisibleCount() {
  if (typeof window === "undefined" || !window.matchMedia) return 1;
  if (window.matchMedia("(min-width: 1024px)").matches) return 4;
  if (window.matchMedia("(min-width: 768px)").matches) return 3;
  return 1;
}

/** Index of the first card on or after `date`, or the last card if `date` is
 *  past everything loaded. -1 when there's nothing to scroll to. */
function indexForDate(list, date) {
  if (list.length === 0) return -1;
  const idx = list.findIndex((c) => callDateIso(c) >= date);
  return idx >= 0 ? idx : list.length - 1;
}

/**
 * Puts card `idx` at the carousel's left edge, immediately.
 *
 * The offset has to be measured from the rects: `child.offsetLeft` is relative
 * to the nearest positioned ancestor, which isn't the carousel, so it carried
 * the prev-arrow's width into every target and left each jump a card short of
 * the day that was asked for.
 *
 * "instant" rather than "auto" because the carousel's CSS sets scroll-behavior
 * to smooth and "auto" defers to that. Jumps here cross a lot of ground —
 * opening lands on today from the oldest card loaded, and picking a day can
 * cross weeks — and animating that far fought the carousel's scroll-snap.
 */
function scrollCardToStart(container, idx) {
  const child = container?.children[idx];
  if (!container || !child) return;
  const left =
    container.scrollLeft + child.getBoundingClientRect().left - container.getBoundingClientRect().left;
  container.scrollTo({ left, behavior: "instant" });
}

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

const HEADER_LINK_STYLE = {
  all: "unset",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(255,255,255,0.85)",
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

/* Admin carousel of calls with an AI-generated todo list not yet resolved —
   opened from the home tile CallsNeedingActionTile.

   Loads a date window at a time rather than the whole set (SBM-24). Almost
   every call ever extracted qualifies (see migration 0027), so the previous
   unwindowed fetch returned a silent LIMIT 200 slice that disagreed with the
   tile count. It now opens on the last CNA_WINDOW_DAYS days and widens:
   fetched windows are merged into one store keyed by call id, so scrolling
   back over days you've already seen never refetches them.

   Top section is StreakWall (the same "date slider" the home page uses). Its
   dots come from a per-month server aggregate, not from the loaded window —
   with a 6-day window, deriving them from the loaded items would make every
   other day look empty and leave nothing worth clicking. Selecting a day
   still scrolls rather than filters (plan doc scope decision #5), but now
   fetches that day first if it isn't loaded yet.

   The remaining screen is a CSS scroll-snap carousel: 4 cards desktop, 3
   tablet, 1 mobile. */
export function CallsNeedingActionView({ staffRoster, currentUser = null, onAssignTodo, onResolved, onBack }) {
  // Paint instantly from the cache Dashboard.jsx warmed on home-page load,
  // before any effect runs. The mount fetch below still happens, but it's
  // TTL-aware, so a warm cache costs no round trip and merges to a no-op.
  const [callsById, setCallsById] = useState(() => {
    const cached = getCachedCallsNeedingAction(defaultCallsNeedingActionWindow());
    return new Map((cached?.items ?? []).map((c) => [c.id, c]));
  });
  const [hasLoaded, setHasLoaded] = useState(() =>
    Boolean(getCachedCallsNeedingAction(defaultCallsNeedingActionWindow()))
  );
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [voiceNotesByTodoId, setVoiceNotesByTodoId] = useState(
    () => getCachedCallsNeedingAction(defaultCallsNeedingActionWindow())?.voiceNotesByTodoId ?? new Map()
  );

  // Every date we've fetched, whether or not it had calls — a date that came
  // back empty must count as loaded or we'd ask for it again on every scroll.
  // A ref, not state: nothing in the render tree depends on it (the strip's
  // dots come from the server aggregate), and the fetch logic needs to read
  // it without waiting for a re-render.
  const loadedDates = useRef(new Set());
  const [loadedBounds, setLoadedBounds] = useState(null); // { from, to } — for the window label
  const emptyBackSteps = useRef(0);

  const [monthCounts, setMonthCounts] = useState({ days: {}, min_year: today().getFullYear() });
  const [calendarTick, setCalendarTick] = useState(0);
  const [calMonth, setCalMonth] = useState(() => {
    const d = today();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const [visibleCount, setVisibleCount] = useState(computeVisibleCount);
  const [scrollIndex, setScrollIndex] = useState(0);
  const [focusDate, setFocusDate] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null); // { date, nonce }
  const [focused, setFocused] = useState(false); // has the open-on-today jump happened
  const focusNonce = useRef(0);
  const handledFocus = useRef(0);
  const carouselRef = useRef(null);

  const items = useMemo(() => [...callsById.values()].sort(byCallDate), [callsById]);

  // Mirror of the sorted list that event handlers (the scroll listener and the
  // edge observer) read at fire time rather than at closure-creation time.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const merge = useCallback((fetched, notes) => {
    if (fetched.length > 0) {
      setCallsById((prev) => {
        const next = new Map(prev);
        for (const call of fetched) next.set(call.id, call);
        return next;
      });
    }
    if (notes?.size) {
      setVoiceNotesByTodoId((prev) => {
        const next = new Map(prev);
        for (const [todoId, note] of notes) next.set(todoId, note);
        return next;
      });
    }
  }, []);

  /**
   * Fetches whatever part of [fromIso, toIso] isn't loaded yet and merges it.
   * Requests one contiguous span covering the missing dates — re-asking for an
   * already-loaded day inside a gap is cheaper than splitting the request, and
   * merging by id makes it idempotent. Resolves to how many calls came back,
   * or null when there was nothing to fetch (or the fetch failed), which is
   * how the auto-widening below tells "no calls in those days" from "already
   * had those days".
   */
  const ensureRange = useCallback(
    async (fromIso, toIso) => {
      const missing = [];
      for (let d = fromIso; d <= toIso; d = addDaysIso(d, 1)) {
        if (!loadedDates.current.has(d)) missing.push(d);
      }
      // Claim the dates before awaiting so a second scroll event can't queue
      // the same fetch; released again below if the request fails.
      for (const d of missing) loadedDates.current.add(d);
      if (missing.length > 0) {
        setLoadedBounds((prev) => ({
          from: prev && prev.from < missing[0] ? prev.from : missing[0],
          to: prev && prev.to > missing[missing.length - 1] ? prev.to : missing[missing.length - 1],
        }));
      }
      if (missing.length === 0) return null;

      const dateFrom = missing[0];
      const dateTo = missing[missing.length - 1];
      setFetching(true);
      setError("");
      try {
        const { items: fetched, voiceNotesByTodoId: notes } = await loadCallsNeedingAction({
          dateFrom,
          dateTo,
        });
        merge(fetched, notes);
        return fetched.length;
      } catch (err) {
        console.error("[sbm] failed to load calls needing action", err);
        for (const d of missing) loadedDates.current.delete(d);
        setError("Failed to load — try again.");
        return null;
      } finally {
        setFetching(false);
        setHasLoaded(true);
      }
    },
    [merge]
  );

  /** Loads a date if needed, then scrolls the carousel to it. */
  const focusOnDate = useCallback(
    async (date) => {
      setFocusDate(date);
      await ensureRange(date, date);
      focusNonce.current += 1;
      setFocusRequest({ date, nonce: focusNonce.current });
    },
    [ensureRange]
  );

  /** One more CNA_WINDOW_DAYS of history before the earliest day loaded. */
  const loadEarlier = useCallback(() => {
    const earliest = loadedBounds?.from ?? todayIso();
    emptyBackSteps.current = 0; // an explicit ask always resumes auto-widening
    return ensureRange(addDaysIso(earliest, -CNA_WINDOW_DAYS), addDaysIso(earliest, -1));
  }, [ensureRange, loadedBounds]);

  const widenForward = useCallback(async () => {
    const list = itemsRef.current;
    if (list.length === 0) return;
    const newest = callDateIso(list[list.length - 1]);
    const from = addDaysIso(newest, 1);
    const capped = addDaysIso(newest, CNA_WINDOW_DAYS);
    const nowIso = todayIso();
    // Never past today: there are no calls in the future, so an uncapped
    // forward reach would ask for a range that can never be satisfied.
    const to = capped < nowIso ? capped : nowIso;
    if (from <= to) await ensureRange(from, to);
  }, [ensureRange]);

  const widenBackward = useCallback(async () => {
    const list = itemsRef.current;
    if (list.length === 0) return;
    // History is unbounded backwards, so auto-widening stops after a couple of
    // fruitless steps rather than walking through an empty year one screenful
    // at a time. "Load earlier days" is the unbounded way past that.
    if (emptyBackSteps.current >= MAX_EMPTY_BACK_STEPS) return;
    const oldest = callDateIso(list[0]);
    const added = await ensureRange(addDaysIso(oldest, -CNA_WINDOW_DAYS), addDaysIso(oldest, -1));
    if (added === null) return;
    emptyBackSteps.current = added > 0 ? 0 : emptyBackSteps.current + 1;
  }, [ensureRange]);

  // Opens on the last CNA_WINDOW_DAYS days, then focuses today (display
  // strategy #1). Focus goes through the same request/nonce path as a day
  // click so that it still lands if the fetch resolves after this effect.
  useEffect(() => {
    const { dateFrom, dateTo } = defaultCallsNeedingActionWindow();
    ensureRange(dateFrom, dateTo).finally(() => {
      focusNonce.current += 1;
      setFocusRequest({ date: dateTo, nonce: focusNonce.current });
      setFocusDate(dateTo);
    });
  }, [ensureRange]);

  // Consumes one focus request. Depends on `items` too, so a request made
  // while the carousel was still empty lands as soon as the cards exist; the
  // nonce guard keeps an unrelated merge from re-triggering an old request.
  //
  // Landing synchronously also means the edge observer below starts from the
  // real scroll position rather than from offset 0.
  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === handledFocus.current) return;
    if (items.length === 0) return;
    const idx = indexForDate(items, focusRequest.date);
    if (idx < 0) return;
    const isFirst = handledFocus.current === 0;
    handledFocus.current = focusRequest.nonce;
    scrollCardToStart(carouselRef.current, idx);
    if (isFirst) setFocused(true);
  }, [focusRequest, items]);

  // Strip dots and the year dropdown come from the server, over the same
  // qualifying set the list uses — so a day with calls reads as clickable
  // even when it's far outside the loaded window.
  useEffect(() => {
    let cancelled = false;
    fetchCallsNeedingActionCalendar(calMonth.year, calMonth.month + 1)
      .then((data) => {
        if (!cancelled) setMonthCounts({ days: data.days ?? {}, min_year: data.min_year ?? today().getFullYear() });
      })
      .catch((err) => console.error("[sbm] failed to load calls-needing-action calendar", err));
    return () => {
      cancelled = true;
    };
  }, [calMonth.year, calMonth.month, calendarTick]);

  useEffect(() => {
    const onResize = () => setVisibleCount(computeVisibleCount());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Drives the arrow buttons' disabled state and moves the strip's highlight
  // to the card in view (display strategy #4).
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
        const list = itemsRef.current;
        if (list.length === 0) return;
        const idx = Math.max(0, Math.min(Math.round(container.scrollLeft / step), list.length - 1));
        setScrollIndex(idx);
        const inView = list[idx];
        if (inView) setFocusDate(callDateIso(inView));
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
    // Keyed on the card count, not mounted once: the carousel isn't rendered
    // until there's at least one card, so a run with an empty list has no
    // element to attach to and has to be redone when the cards arrive.
  }, [items.length]);

  // Background widening (display strategy #4): arriving at the oldest or
  // newest loaded card fetches the next CNA_WINDOW_DAYS beyond it.
  //
  // Deliberately an observer on the edge cards rather than a read of scroll
  // offsets. Scroll events turned out to be an unreliable signal here in both
  // directions — scroll-snap and event coalescing meant a wheel gesture to the
  // edge often produced no usable event, while the arrows' own smooth scroll
  // and the reflow from prepending older cards each produced several, so an
  // offset-driven version both missed real arrivals and invented ones. The
  // observer fires on the state we actually care about (an edge card is on
  // screen), once per arrival.
  //
  // Held back until the open-on-today jump has happened: observing from the
  // initial offset of 0 would see the oldest card on screen and start
  // widening backwards before the view had even settled on today.
  useEffect(() => {
    const container = carouselRef.current;
    if (!focused || !container || items.length === 0 || typeof IntersectionObserver === "undefined") return;
    const first = container.children[0];
    const last = container.children[container.children.length - 1];
    if (!first || !last) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === last) widenForward();
          if (entry.target === first) widenBackward();
        }
      },
      { root: container, threshold: 0.9 }
    );
    observer.observe(first);
    if (last !== first) observer.observe(last);
    return () => observer.disconnect();
  }, [focused, items, widenForward, widenBackward]);

  // Scrolling into a different month carries the strip along with it.
  useEffect(() => {
    if (!focusDate) return;
    const year = Number(focusDate.slice(0, 4));
    const month = Number(focusDate.slice(5, 7)) - 1;
    setCalMonth((prev) => (prev.year === year && prev.month === month ? prev : { year, month }));
  }, [focusDate]);

  const monthDays = useMemo(() => {
    const nowIso = todayIso();
    const { year, month } = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoDate(year, month, day);
      const future = iso > nowIso;
      days.push({ date: iso, held: future ? null : true, calls: monthCounts.days[iso] ?? 0, future });
    }
    return days;
  }, [calMonth, monthCounts]);

  const yearOptions = useMemo(() => {
    const current = today().getFullYear();
    const minYear = Math.min(monthCounts.min_year ?? current, current);
    const out = [];
    for (let y = minYear; y <= current + 1; y++) out.push(y);
    return out;
  }, [monthCounts.min_year]);

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

  // Arrows move through the cards already loaded; they never re-request a call
  // that's in hand. Landing on the oldest or newest of them does widen the
  // window, through the edge observer above — same as swiping there.
  const scrollByPage = (direction) => {
    const container = carouselRef.current;
    if (!container) return;
    const child = container.children[0];
    const step = child ? child.offsetWidth + CARD_GAP : container.clientWidth;
    container.scrollBy({ left: direction * visibleCount * step, behavior: "smooth" });
  };

  // Assignment itself is Dashboard.jsx's onAssignTodo (PATCH + its own
  // global todoRefreshKey bump for other views). It now returns the updated
  // todo (with its fresh assignees[]) — patch this card's copy locally
  // instead of a full network refetch just to pick that field up, then
  // resync the shared cache in the background for the next cold open.
  //
  // The three mutation handlers resync the default window specifically: it's
  // the entry that the next cold open reads, and the other windows this
  // session loaded are already patched locally below.
  const resyncDefaultWindow = () => refreshCallsNeedingAction(defaultCallsNeedingActionWindow()).catch(() => {});

  const handleAssignTodo = async (todoId, userIds) => {
    const updated = await onAssignTodo(todoId, userIds);
    if (updated?.id) {
      setCallsById((prev) => {
        const next = new Map();
        for (const [id, call] of prev) {
          next.set(id, {
            ...call,
            todos: call.todos.map((td) => (td.id === updated.id ? { ...td, ...updated } : td)),
          });
        }
        return next;
      });
    }
    resyncDefaultWindow();
  };

  const handleResolve = async (callId) => {
    await resolveCall(callId);
    setCallsById((prev) => {
      const next = new Map(prev);
      next.delete(callId);
      return next;
    });
    onResolved?.();
    setCalendarTick((n) => n + 1); // the strip's dot for that day is now one lower
    resyncDefaultWindow();
  };

  const handleAddVoiceNote = async (todoId, blob, fileName) => {
    const note = await postTodoVoiceNote(todoId, blob, fileName);
    setVoiceNotesByTodoId((prev) => {
      const next = new Map(prev);
      next.set(todoId, note);
      return next;
    });
    resyncDefaultWindow();
  };

  const count = items.length;
  const atStart = scrollIndex <= 0;
  // Measured against the last card that can sit at the left edge, not the last
  // card: with four cards on screen, the carousel stops scrolling three cards
  // early, and comparing against count - 1 left Next enabled but inert there.
  const atEnd = scrollIndex >= count - visibleCount;
  const windowLabel = loadedBounds
    ? `${count} call${count === 1 ? "" : "s"} · ${fmtShort(loadedBounds.from)} – ${fmtShort(loadedBounds.to)}`
    : "";

  return (
    <div>
      <style>{`
        .cna-carousel {
          display: flex;
          gap: ${CARD_GAP}px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          padding-bottom: 8px;
          -webkit-overflow-scrolling: touch;
        }
        .cna-carousel > * {
          scroll-snap-align: start;
          flex: 0 0 100%;
        }
        @media (min-width: 768px) {
          .cna-carousel > * { flex: 0 0 calc((100% - ${CARD_GAP * 2}px) / 3); }
        }
        @media (min-width: 1024px) {
          .cna-carousel > * { flex: 0 0 calc((100% - ${CARD_GAP * 3}px) / 4); }
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
          <span>{fetching ? "Loading…" : windowLabel}</span>
          <button type="button" onClick={loadEarlier} style={HEADER_LINK_STYLE}>
            Load earlier days
          </button>
        </div>

        <StreakWall
          days={monthDays}
          onSelectDay={focusOnDate}
          selected={focusDate}
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

      {!hasLoaded && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}
      {error && <p style={{ fontSize: 14, color: t.signal }}>{error}</p>}
      {hasLoaded && count === 0 && !error && (
        <p style={{ fontSize: 14, color: t.edge2 }}>
          Nothing needs action in these days. Pick a date above, or load earlier days.
        </p>
      )}

      {count > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            aria-label="Previous"
            onClick={() => scrollByPage(-1)}
            disabled={atStart}
            style={{
              ...iconButtonStyle(atStart),
              background: t.white,
              border: `1px solid ${t.frost}`,
              color: atStart ? t.frost : t.edge,
            }}
          >
            <ChevronLeft size={16} />
          </button>

          <div ref={carouselRef} className="cna-carousel" style={{ flex: 1 }}>
            {items.map((call) => (
              <CallActionCard
                key={call.id}
                call={call}
                staffRoster={staffRoster}
                currentUser={currentUser}
                onAssignTodo={handleAssignTodo}
                onResolve={handleResolve}
                onAddVoiceNote={handleAddVoiceNote}
                voiceNotesByTodoId={voiceNotesByTodoId}
              />
            ))}
          </div>

          <button
            aria-label="Next"
            onClick={() => scrollByPage(1)}
            disabled={atEnd}
            style={{
              ...iconButtonStyle(atEnd),
              background: t.white,
              border: `1px solid ${t.frost}`,
              color: atEnd ? t.frost : t.edge,
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../../theme.js";
import { today, isoDate, todayIso, addDaysIso, fmtShort } from "../../lib/dates.js";
import { BackLink } from "../../components/BackLink.jsx";
import { StreakWall } from "./StreakWall.jsx";
import { CallActionCard } from "./CallActionCard.jsx";
import {
  CNA_LOOKBACK_DAYS,
  CNA_WINDOW_DAYS,
  callsNeedingActionLookback,
  defaultCallsNeedingActionWindow,
  fetchCallsNeedingActionCalendar,
  fetchCallsNeedingActionCount,
  getCachedCallsNeedingAction,
  loadCallsNeedingAction,
  refreshCallsNeedingAction,
  resolveCall,
  postTodoVoiceNote,
} from "../../lib/api.js";

const CARD_GAP = 16;

function callDateIso(call) {
  return (call.recording_date || call.recorded_at || "").slice(0, 10);
}

const minIso = (a, b) => (a < b ? a : b);
const maxIso = (a, b) => (a > b ? a : b);

/** Nearest day with qualifying calls strictly before `dateIso`, at or after
 *  `floorIso` — where a backward prefetch should jump to, so an empty
 *  fortnight costs one request instead of three fruitless five-day probes. */
function previousDayWithCalls(dayCounts, dateIso, floorIso) {
  let best = null;
  for (const [day, n] of Object.entries(dayCounts)) {
    if (n > 0 && day < dateIso && day >= floorIso && (best === null || day > best)) best = day;
  }
  return best;
}

/** Mirror of previousDayWithCalls, forwards, at or before `ceilIso`. */
function nextDayWithCalls(dayCounts, dateIso, ceilIso) {
  let best = null;
  for (const [day, n] of Object.entries(dayCounts)) {
    if (n > 0 && day > dateIso && day <= ceilIso && (best === null || day < best)) best = day;
  }
  return best;
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

/* Admin carousel of calls with an AI-generated todo list not yet resolved —
   opened from the home tile CallsNeedingActionTile.

   Loads a date window at a time rather than the whole set (SBM-24). Almost
   every call ever extracted qualifies (see migration 0027), so the previous
   unwindowed fetch returned a silent LIMIT 200 slice that disagreed with the
   tile count. It now opens on the last CNA_WINDOW_DAYS days and widens:
   fetched windows are merged into one store keyed by call id, so scrolling
   back over days you've already seen never refetches them.

   Opening fires three requests in parallel (SBM-25), all of them scoped to
   the same CNA_LOOKBACK_DAYS lookback so the screen can't contradict itself:
   the cards for the opening window, the per-day counts behind the strip's
   dots, and the total for the header. The two aggregates cover the whole
   lookback rather than the loaded window — that's what lets a day the
   carousel hasn't fetched still read as worth clicking, and what tells a
   backward prefetch where the next non-empty day is.

   Top section is StreakWall (the same "date slider" the home page uses).
   Selecting a day scrolls rather than filters (plan doc scope decision #5),
   fetching that day first if it isn't loaded yet, and the day selected stays
   put: background prefetch prepends older cards, and the carousel re-anchors
   on the card that was at its left edge so the reader doesn't get slid off
   the day they picked.

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
  /** True until the three opening requests, and any fallback they trigger, are done. */
  const [opening, setOpening] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [voiceNotesByTodoId, setVoiceNotesByTodoId] = useState(
    () => getCachedCallsNeedingAction(defaultCallsNeedingActionWindow())?.voiceNotesByTodoId ?? new Map()
  );

  // Every date we've fetched cards for, whether or not it had any — a date
  // that came back empty must count as loaded or we'd ask for it again on
  // every scroll. A ref, not state: nothing in the render tree depends on it
  // (the strip's dots come from the server aggregate), and the fetch logic
  // needs to read it without waiting for a re-render.
  const loadedDates = useRef(new Set());
  const [loadedBounds, setLoadedBounds] = useState(null); // { from, to } — for the window label

  // The lookback is fixed for the life of the view rather than recomputed per
  // render: every window, dot and total is measured against it, and having it
  // shift under a tab left open across midnight would strand loaded cards
  // outside their own floor.
  const lookback = useMemo(callsNeedingActionLookback, []);

  const [dayCounts, setDayCounts] = useState({}); // { iso: qualifying calls } — the strip's dots
  const [minYear, setMinYear] = useState(() => today().getFullYear());
  const [lookbackTotal, setLookbackTotal] = useState(null);
  // Dates the per-day counts are known for, same bookkeeping as loadedDates.
  const countedDates = useRef(new Set());
  // Prefetch reads the counts at fire time; before they land it falls back to
  // a fixed step, and only a loaded map is allowed to say "nothing earlier".
  const dayCountsRef = useRef({});
  const countsReady = useRef(false);
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

  // Id of the card that belongs at the carousel's left edge. Set by scrolling
  // and by selecting a day, then re-applied whenever the card list changes —
  // see the re-anchoring layout effect below.
  const anchorId = useRef(null);

  const items = useMemo(() => [...callsById.values()].sort(byCallDate), [callsById]);

  // Mirror of the sorted list that event handlers (the scroll listener and the
  // edge observer) read at fire time rather than at closure-creation time.
  //
  // Updated in a layout effect, before the re-anchoring one below: a merge
  // that prepends cards moves the anchored card's index, and re-anchoring
  // scrolls, so the scroll handler runs right after this commit. On a passive
  // effect the mirror was still the pre-merge list when it did, and the strip
  // followed the card that used to be at that index instead of the day the
  // reader had selected.
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
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
   * or null when there was nothing to fetch or the fetch failed — the opening
   * effect reads that to notice an empty window, which it can't do from the
   * card list, since that only reflects the fetch a render later.
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

  /**
   * Loads the per-day counts for whatever part of [fromIso, toIso] isn't
   * known yet. Only ever additive on the counts map, so a month browsed to
   * outside the lookback keeps its dots alongside the lookback's.
   */
  const ensureCounts = useCallback(async (fromIso, toIso) => {
    const missing = [];
    for (let d = fromIso; d <= toIso; d = addDaysIso(d, 1)) {
      if (!countedDates.current.has(d)) missing.push(d);
    }
    if (missing.length === 0) return;
    for (const d of missing) countedDates.current.add(d);
    const dateFrom = missing[0];
    const dateTo = missing[missing.length - 1];
    try {
      const data = await fetchCallsNeedingActionCalendar({ dateFrom, dateTo });
      // Days with no calls are absent from the response rather than zero, so
      // this both fills in counts and leaves untouched days reading as 0.
      dayCountsRef.current = { ...dayCountsRef.current, ...(data.days ?? {}) };
      setDayCounts(dayCountsRef.current);
      if (data.min_year) setMinYear(data.min_year);
    } catch (err) {
      console.error("[sbm] failed to load calls-needing-action calendar", err);
      for (const d of missing) countedDates.current.delete(d);
    }
  }, []);

  /** Loads a date if needed, then scrolls the carousel to it. */
  const focusOnDate = useCallback(
    async (date) => {
      setFocusDate(date);
      // Dropped so the re-anchoring effect doesn't pull the carousel back to
      // wherever it was while this date's cards are being merged in.
      anchorId.current = null;
      await ensureRange(date, date);
      focusNonce.current += 1;
      setFocusRequest({ date, nonce: focusNonce.current });
    },
    [ensureRange]
  );

  const widenForward = useCallback(async () => {
    const list = itemsRef.current;
    if (list.length === 0) return;
    const nowIso = todayIso();
    const newest = callDateIso(list[list.length - 1]);
    // Never past today: there are no calls in the future, so an uncapped
    // forward reach would ask for a range that can never be satisfied.
    if (newest >= nowIso) return;
    const target = nextDayWithCalls(dayCountsRef.current, newest, nowIso);
    if (countsReady.current && target === null) return;
    const to = target ?? minIso(addDaysIso(newest, CNA_WINDOW_DAYS), nowIso);
    await ensureRange(addDaysIso(newest, 1), to);
  }, [ensureRange]);

  const widenBackward = useCallback(async () => {
    const list = itemsRef.current;
    if (list.length === 0) return;
    const oldest = callDateIso(list[0]);
    // The lookback is the floor. Before SBM-25 history was unbounded here and
    // widening had to give up after two empty steps to avoid walking back
    // through an empty year a screenful at a time; now it stops at a real
    // edge, and the counts tell it which days in between are worth asking for.
    if (oldest <= lookback.dateFrom) return;
    const target = previousDayWithCalls(dayCountsRef.current, oldest, lookback.dateFrom);
    if (countsReady.current && target === null) return;
    const from = target ?? maxIso(addDaysIso(oldest, -CNA_WINDOW_DAYS), lookback.dateFrom);
    await ensureRange(from, addDaysIso(oldest, -1));
  }, [ensureRange, lookback]);

  // Opening: cards for the last CNA_WINDOW_DAYS days, then focus today
  // (display strategy #1), alongside the two lookback-wide aggregates. All
  // three go out together — the cards are the only one the first paint waits
  // on, and neither aggregate is on the path to showing them.
  useEffect(() => {
    const { dateFrom, dateTo } = defaultCallsNeedingActionWindow();
    const cards = ensureRange(dateFrom, dateTo);
    const counts = ensureCounts(lookback.dateFrom, lookback.dateTo).finally(() => {
      countsReady.current = true;
    });

    cards.finally(() => {
      // Focus goes through the same request/nonce path as a day click so that
      // it still lands if the fetch resolves after this effect.
      focusNonce.current += 1;
      setFocusRequest({ date: dateTo, nonce: focusNonce.current });
      setFocusDate(dateTo);
    });

    // Nothing in the opening days: land on the most recent day inside the
    // lookback that does have calls, which is what the counts are for. An
    // empty carousel can't widen its own way out of this — the edge observer
    // needs a card to observe — so without the fallback a quiet week left the
    // view showing "nothing needs action in these days" with 100+ waiting a
    // fortnight back (SBM-26).
    const settled = Promise.all([cards, counts]).then(([added]) => {
      if (added !== 0) return undefined;
      const latest = previousDayWithCalls(
        dayCountsRef.current,
        addDaysIso(lookback.dateTo, 1),
        lookback.dateFrom
      );
      return latest ? focusOnDate(latest) : undefined;
    });

    const total = fetchCallsNeedingActionCount(lookback)
      .then(setLookbackTotal)
      .catch((err) => console.error("[sbm] failed to count calls needing action", err));

    // The empty-state copy waits for all three: which of the two messages is
    // right depends on the lookback total, and an empty opening window is only
    // really empty once the fallback above has had its turn.
    Promise.all([settled, total]).finally(() => setOpening(false));
  }, [ensureRange, ensureCounts, focusOnDate, lookback]);

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
    // The card the reader asked for is now the one to keep at the left edge.
    anchorId.current = items[idx].id;
    if (isFirst) setFocused(true);
  }, [focusRequest, items]);

  /**
   * Keeps the anchored card at the left edge across changes to the card list.
   *
   * Prepending is the case that matters: a background backward prefetch adds
   * older cards, the browser keeps scrollLeft where it was, and the day the
   * reader was on silently slides right out of view — SBM-25's "the calls in
   * focus become the last day of the window that just loaded". Correcting the
   * offset in a layout effect puts it back before the browser paints, so the
   * merge is invisible rather than a jump.
   */
  useLayoutEffect(() => {
    const container = carouselRef.current;
    if (!container || !anchorId.current || items.length === 0) return;
    const idx = items.findIndex((c) => c.id === anchorId.current);
    if (idx <= 0) return; // already the first card: nothing can have shifted it
    const child = container.children[idx];
    if (!child) return;
    const drift = child.getBoundingClientRect().left - container.getBoundingClientRect().left;
    if (Math.abs(drift) < 1) return;
    scrollCardToStart(container, idx);
  }, [items]);

  // A month browsed to outside the lookback has no dots yet, so fetch its
  // counts too. Clamped to today — the strip renders later days as blank,
  // unclickable cells, and asking for them would make every month visited
  // this month look uncovered and refetch on every visit.
  useEffect(() => {
    const first = isoDate(calMonth.year, calMonth.month, 1);
    const last = isoDate(calMonth.year, calMonth.month, new Date(calMonth.year, calMonth.month + 1, 0).getDate());
    const to = minIso(last, todayIso());
    if (first <= to) ensureCounts(first, to);
  }, [calMonth, ensureCounts]);

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
        if (!inView) return;
        // Only hand the highlight to the left-edge card once the anchored one
        // has actually left the screen. A merge can force the carousel off its
        // anchor even after re-anchoring — prepend four cards in front of a
        // card that's fifth from the end and no scroll offset can put it at
        // the left edge any more — and the clamped scroll that follows would
        // otherwise read as the reader having moved to a different day.
        const anchorIdx = list.findIndex((c) => c.id === anchorId.current);
        const anchorOnScreen = anchorIdx >= idx && anchorIdx <= idx + visibleCount - 1;
        if (anchorOnScreen) return;
        setFocusDate(callDateIso(inView));
        anchorId.current = inView.id;
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
    // Keyed on the card count, not mounted once: the carousel isn't rendered
    // until there's at least one card, so a run with an empty list has no
    // element to attach to and has to be redone when the cards arrive.
  }, [items.length, visibleCount]);

  // Background widening (display strategy #4): arriving at the oldest or
  // newest loaded card fetches the next day beyond it that has calls, or one
  // more CNA_WINDOW_DAYS step if the counts haven't landed yet.
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
      days.push({ date: iso, held: future ? null : true, calls: dayCounts[iso] ?? 0, future });
    }
    return days;
  }, [calMonth, dayCounts]);

  const yearOptions = useMemo(() => {
    const current = today().getFullYear();
    const first = Math.min(minYear, current);
    const out = [];
    for (let y = first; y <= current + 1; y++) out.push(y);
    return out;
  }, [minYear]);

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
    const resolvedDate = callDateIso(callsById.get(callId) ?? {});
    await resolveCall(callId);
    setCallsById((prev) => {
      const next = new Map(prev);
      next.delete(callId);
      return next;
    });
    // Resolving takes exactly one call out of the qualifying set, so the two
    // aggregates can be adjusted rather than refetched — the strip's dot for
    // that day drops by one, and clears once its last call is resolved.
    if (resolvedDate) {
      const remaining = (dayCountsRef.current[resolvedDate] ?? 1) - 1;
      const next = { ...dayCountsRef.current };
      if (remaining > 0) next[resolvedDate] = remaining;
      else delete next[resolvedDate];
      dayCountsRef.current = next;
      setDayCounts(next);
    }
    setLookbackTotal((n) => (typeof n === "number" ? Math.max(0, n - 1) : n));
    onResolved?.();
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
    ? `${count} loaded · ${fmtShort(loadedBounds.from)} – ${fmtShort(loadedBounds.to)}`
    : "";
  // The header describes the whole lookback, not the days of cards in hand —
  // the loaded window is what the label on the left is for.
  const lookbackLabel = `Calls needing action in last ${CNA_LOOKBACK_DAYS} days${
    lookbackTotal === null ? "" : ` · ${lookbackTotal}`
  }`;

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
          <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.85)", textAlign: "right" }}>
            {lookbackLabel}
          </span>
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
      {hasLoaded && !opening && count === 0 && !error && (
        <p style={{ fontSize: 14, color: t.edge2 }}>
          {lookbackTotal === 0
            ? `Nothing needs action in the last ${CNA_LOOKBACK_DAYS} days.`
            : "Nothing needs action in these days. Pick a marked date above."}
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

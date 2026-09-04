import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { t } from "../../theme.js";
import { today, isoDate } from "../../lib/dates.js";
import { BackLink } from "../../components/BackLink.jsx";
import { StreakWall } from "./StreakWall.jsx";
import { CallActionCard } from "./CallActionCard.jsx";
import { getCachedCallsNeedingAction, refreshCallsNeedingAction, resolveCall, postTodoVoiceNote } from "../../lib/api.js";

const CARD_GAP = 16;

function callDateIso(call) {
  return (call.recording_date || call.recorded_at || "").slice(0, 10);
}

function computeVisibleCount() {
  if (typeof window === "undefined" || !window.matchMedia) return 1;
  if (window.matchMedia("(min-width: 1024px)").matches) return 4;
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
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: t.radiusButton,
    background: "rgba(255,255,255,0.07)",
    color: disabled ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.85)",
    cursor: disabled ? "default" : "pointer",
    padding: 0,
  };
}

/* Admin carousel of every call with an AI-generated todo list not yet
   resolved — opened from the home tile CallsNeedingActionTile. Top section
   is StreakWall (the same "date slider" the home page uses), reused as-is
   but fed dates only from this view's own fetched items (not the full
   month-calendar endpoint), and wired to scroll-to rather than filter — see
   the plan doc's scope decision #5. The remaining screen is a CSS
   scroll-snap carousel: 4 cards desktop, 3 tablet, 1 mobile. */
export function CallsNeedingActionView({ staffRoster, onAssignTodo, onResolved, onBack }) {
  // Render instantly from the cache Dashboard.jsx warmed on home-page load
  // (getCachedCallsNeedingAction) if it's there — undefined only means
  // "nothing cached yet and nothing fetched yet", not "still loading" per
  // se, since a background refresh below keeps it current either way.
  const cached = getCachedCallsNeedingAction();
  const [items, setItems] = useState(cached?.items); // undefined = no data yet
  const [error, setError] = useState("");
  const [voiceNotesByTodoId, setVoiceNotesByTodoId] = useState(cached?.voiceNotesByTodoId ?? new Map());
  const [calMonth, setCalMonth] = useState(() => {
    const d = today();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [visibleCount, setVisibleCount] = useState(computeVisibleCount);
  const [scrollIndex, setScrollIndex] = useState(0);
  const carouselRef = useRef(null);

  // Background refresh — updates state when it resolves without ever
  // blocking the view: if we rendered from cache above, this is invisible
  // to the user unless the data actually changed (React reuses each card's
  // DOM node by `key`, so an unchanged list causes no visible re-render and
  // scroll position is preserved). If there was no cache, this is what
  // populates the view the first time.
  const load = useCallback(() => {
    setError("");
    refreshCallsNeedingAction()
      .then(({ items: data, voiceNotesByTodoId: notes }) => {
        setItems(data);
        setVoiceNotesByTodoId(notes);
      })
      .catch((err) => {
        console.error("[sbm] failed to load calls needing action", err);
        setError("Failed to load — try again.");
        // Functional update: only fall back to an empty list if nothing
        // (cached or fetched) has loaded yet — a background refresh
        // failing shouldn't blank out an already-populated view.
        setItems((prev) => prev ?? []);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onResize = () => setVisibleCount(computeVisibleCount());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
        setScrollIndex(Math.round(container.scrollLeft / step));
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [items]);

  const monthDays = useMemo(() => {
    const list = items ?? [];
    const now = today();
    const todayIso = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    const { year, month } = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const countsByDate = new Map();
    for (const call of list) {
      const d = callDateIso(call);
      if (!d) continue;
      countsByDate.set(d, (countsByDate.get(d) ?? 0) + 1);
    }
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoDate(year, month, day);
      const future = iso > todayIso;
      days.push({ date: iso, held: future ? null : true, calls: countsByDate.get(iso) ?? 0, future });
    }
    return days;
  }, [items, calMonth]);

  const yearOptions = useMemo(() => {
    const current = today().getFullYear();
    let minYear = current;
    for (const call of items ?? []) {
      const y = Number(callDateIso(call).slice(0, 4));
      if (Number.isFinite(y) && y > 0 && y < minYear) minYear = y;
    }
    const out = [];
    for (let y = minYear; y <= current + 1; y++) out.push(y);
    return out;
  }, [items]);

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

  const scrollToIndex = (index) => {
    const container = carouselRef.current;
    const child = container?.children[index];
    if (!container || !child) return;
    container.scrollTo({ left: child.offsetLeft, behavior: "smooth" });
  };

  // Scroll-to, not filter (plan doc scope decision #5) — a date with no
  // qualifying call would otherwise dead-end an empty filtered list.
  const onSelectDay = (date) => {
    const list = items ?? [];
    const idx = list.findIndex((c) => callDateIso(c) >= date);
    if (idx >= 0) scrollToIndex(idx);
  };

  const scrollByPage = (direction) => {
    const container = carouselRef.current;
    if (!container) return;
    const child = container.children[0];
    const step = child ? child.offsetWidth + CARD_GAP : container.clientWidth;
    container.scrollBy({ left: direction * visibleCount * step, behavior: "smooth" });
  };

  // Assignment itself is Dashboard.jsx's onAssignTodo (PATCH + its own
  // global todoRefreshKey bump for other views) — this view isn't
  // subscribed to that, so without a refresh here a card's "Assigned to…"
  // label would stay stale until the next background tick.
  const handleAssignTodo = async (todoId, userIds) => {
    await onAssignTodo(todoId, userIds);
    load();
  };

  const handleResolve = async (callId) => {
    await resolveCall(callId);
    setItems((list) => (list ?? []).filter((c) => c.id !== callId));
    onResolved?.();
    refreshCallsNeedingAction().catch(() => {}); // resync the shared cache for next open
  };

  const handleAddVoiceNote = async (todoId, blob, fileName) => {
    const note = await postTodoVoiceNote(todoId, blob, fileName);
    setVoiceNotesByTodoId((prev) => {
      const next = new Map(prev);
      next.set(todoId, note);
      return next;
    });
    refreshCallsNeedingAction().catch(() => {}); // resync the shared cache for next open
  };

  const count = items?.length ?? 0;

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
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem" }}>
          <BackLink onClick={onBack} style={{ color: "rgba(255,255,255,0.85)", marginBottom: 0 }}>
            Back
          </BackLink>
          <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 600, color: t.white }}>
            Calls Needing Action{items ? ` · ${count}` : ""}
          </span>
        </header>

        <StreakWall
          days={monthDays}
          onSelectDay={onSelectDay}
          selected={null}
          year={calMonth.year}
          month={calMonth.month}
          yearOptions={yearOptions}
          onChangeYear={(y) => goToMonth(y, calMonth.month)}
          onChangeMonth={(m) => goToMonth(calMonth.year, m)}
          onPrevMonth={() => goToMonth(calMonth.year, calMonth.month - 1)}
          onNextMonth={() => goToMonth(calMonth.year, calMonth.month + 1)}
          todayIso={isoDate(today().getFullYear(), today().getMonth(), today().getDate())}
        />
      </div>

      {items === undefined && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}
      {error && <p style={{ fontSize: 14, color: t.signal }}>{error}</p>}
      {items && items.length === 0 && !error && (
        <p style={{ fontSize: 14, color: t.edge2 }}>Nothing needs action right now.</p>
      )}

      {items && items.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            aria-label="Previous"
            onClick={() => scrollByPage(-1)}
            disabled={scrollIndex <= 0}
            style={{
              ...iconButtonStyle(scrollIndex <= 0),
              background: t.white,
              border: `1px solid ${t.frost}`,
              color: scrollIndex <= 0 ? t.frost : t.edge,
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
            disabled={scrollIndex >= items.length - 1}
            style={{
              ...iconButtonStyle(scrollIndex >= items.length - 1),
              background: t.white,
              border: `1px solid ${t.frost}`,
              color: scrollIndex >= items.length - 1 ? t.frost : t.edge,
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

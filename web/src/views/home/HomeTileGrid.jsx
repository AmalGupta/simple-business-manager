import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";
import { t } from "../../theme.js";
import {
  mergeHomeTileOrder,
  moveIdToIndex,
  persistHomeTileOrder,
  buildDefaultHomeTileOrder,
  DEFAULT_HOME_TILE_ORDER,
} from "./homeTileOrder.js";

const DRAG_THRESHOLD_PX = 4;
const LAYOUT_MS = 250;

const GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: "1.5rem",
  alignItems: "stretch",
};

const FILL_CSS = `
[data-home-tile-grid] > [data-tile-id] {
  min-width: 0;
  width: 100%;
  height: var(--tile-height);
}
[data-home-tile-grid] > [data-tile-id] > [data-tile-inner] {
  position: relative;
  width: 100%;
  height: 100%;
}
[data-home-tile-grid] > [data-tile-id] > [data-tile-inner] > *:not([data-tile-grip]) {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: block;
}
[data-home-tile-grid] > [data-tile-id] > [data-tile-inner] > button {
  width: 100%;
  height: 100%;
}
@media (prefers-reduced-motion: reduce) {
  [data-home-tile-grid] [data-tile-inner] {
    transition: none !important;
  }
}
`;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sameIdList(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function visibleKey(ids) {
  return ids.join("\0");
}

/**
 * Admin home tile grid with phone-style reorder via a top-right grip.
 *
 * Display order is local-first after mount: dropping does not re-apply
 * `savedOrder` (that was flashing the pre-drag layout while the PATCH
 * round-tripped). `savedOrder` is only used to seed, to reconcile when the
 * visible tile set changes, and when the user resets order in settings.
 */
export function HomeTileGrid({ items, savedOrder = null, onOrderChange, arrangeable = true }) {
  const visibleIds = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const defaultOrder = useMemo(() => buildDefaultHomeTileOrder(visibleIds, DEFAULT_HOME_TILE_ORDER), [visibleIds]);
  const visKey = visibleKey(visibleIds);

  const seed = useMemo(
    () => mergeHomeTileOrder(savedOrder, visibleIds, defaultOrder),
    // Seed once per visible-set; intentional — do not re-seed on every savedOrder write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visKey],
  );

  const [order, setOrder] = useState(seed);
  const [draggingId, setDraggingId] = useState(null);

  const cellRefs = useRef(new Map());
  const innerRefs = useRef(new Map());
  const prevRectsRef = useRef(new Map());
  const dragRef = useRef(null);
  const orderRef = useRef(order);
  const savedOrderRef = useRef(savedOrder);
  const suppressClickUntilRef = useRef(0);
  const listenersRef = useRef(null);
  const skipFlipRef = useRef(false);
  orderRef.current = order;
  savedOrderRef.current = savedOrder;

  /* Visible tiles appeared/disappeared — reconcile, keeping relative order. */
  useEffect(() => {
    setOrder((prev) => {
      const next = mergeHomeTileOrder(
        persistHomeTileOrder(savedOrderRef.current, prev, defaultOrder),
        visibleIds,
        defaultOrder,
      );
      return sameIdList(prev, next) ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visKey]);

  /* Account menu "Reset home tile order" clears the preference. */
  const savedKey = Array.isArray(savedOrder) && savedOrder.length ? savedOrder.join("\0") : "";
  const prevSavedKeyRef = useRef(savedKey);
  useEffect(() => {
    const prevKey = prevSavedKeyRef.current;
    prevSavedKeyRef.current = savedKey;
    if (prevKey && !savedKey) {
      skipFlipRef.current = true;
      setOrder(mergeHomeTileOrder(null, visibleIds, defaultOrder));
    }
  }, [savedKey, visibleIds, defaultOrder]);

  const setCellRef = useCallback((id, el) => {
    if (el) cellRefs.current.set(id, el);
    else cellRefs.current.delete(id);
  }, []);

  const setInnerRef = useCallback((id, el) => {
    if (el) innerRefs.current.set(id, el);
    else innerRefs.current.delete(id);
  }, []);

  const baselineRects = useCallback(() => {
    const next = new Map();
    for (const id of orderRef.current) {
      const el = cellRefs.current.get(id);
      if (el) next.set(id, el.getBoundingClientRect());
    }
    prevRectsRef.current = next;
  }, []);

  const clearInnerTransforms = useCallback(() => {
    for (const inner of innerRefs.current.values()) {
      inner.style.transition = "none";
      inner.style.transform = "";
    }
  }, []);

  /* FLIP only when `order` changes — not when draggingId toggles (that was
     animating a bogus invert after drop and looked like a layout flash). */
  useLayoutEffect(() => {
    if (skipFlipRef.current) {
      skipFlipRef.current = false;
      baselineRects();
      return;
    }

    const nextRects = new Map();
    for (const id of order) {
      const el = cellRefs.current.get(id);
      if (!el) continue;
      nextRects.set(id, el.getBoundingClientRect());
    }

    if (!prefersReducedMotion() && prevRectsRef.current.size > 0) {
      for (const id of order) {
        const inner = innerRefs.current.get(id);
        const prev = prevRectsRef.current.get(id);
        const next = nextRects.get(id);
        if (!inner || !prev || !next) continue;
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        const lift = id === dragRef.current?.id ? " scale(1.03)" : "";
        inner.style.transition = "none";
        inner.style.transform = `translate(${dx}px, ${dy}px)${lift}`;
        void inner.offsetWidth;
        inner.style.transition = `transform ${LAYOUT_MS}ms cubic-bezier(.22,.61,.36,1)`;
        inner.style.transform = id === dragRef.current?.id ? "scale(1.03)" : "";
      }
    }

    prevRectsRef.current = nextRects;
  }, [order, baselineRects]);

  /* Lift style for the active tile without going through FLIP. */
  useLayoutEffect(() => {
    for (const [id, inner] of innerRefs.current.entries()) {
      if (!inner) continue;
      if (id === draggingId) {
        if (!inner.style.transform || inner.style.transform === "none") {
          inner.style.transition = "transform 120ms ease";
          inner.style.transform = "scale(1.03)";
        }
      } else if (!dragRef.current) {
        /* idle — leave FLIP-owned transforms alone while they animate */
      }
    }
    if (!draggingId) {
      /* Drop finished: ensure no leftover scale after a tick */
      const t = window.setTimeout(() => {
        if (dragRef.current) return;
        for (const inner of innerRefs.current.values()) {
          if (inner.style.transform.includes("scale")) {
            inner.style.transition = `transform ${LAYOUT_MS}ms ease`;
            inner.style.transform = "";
          }
        }
      }, LAYOUT_MS + 40);
      return () => window.clearTimeout(t);
    }
  }, [draggingId]);

  const detachDragListeners = useCallback(() => {
    const L = listenersRef.current;
    if (!L) return;
    window.removeEventListener("pointermove", L.move);
    window.removeEventListener("pointerup", L.up);
    window.removeEventListener("pointercancel", L.cancel);
    listenersRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  const endDrag = useCallback(
    (commit) => {
      const state = dragRef.current;
      dragRef.current = null;
      detachDragListeners();

      if (!state) {
        setDraggingId(null);
        return;
      }

      if (commit && state.moved) {
        suppressClickUntilRef.current = Date.now() + 400;
        const visibleOrder = orderRef.current.slice();
        const full = persistHomeTileOrder(savedOrderRef.current, visibleOrder, defaultOrder);
        /* Keep local order as-is — do not re-seed from savedOrder (flash). */
        skipFlipRef.current = true;
        clearInnerTransforms();
        baselineRects();
        setDraggingId(null);
        onOrderChange?.(full);
      } else {
        skipFlipRef.current = true;
        clearInnerTransforms();
        baselineRects();
        setDraggingId(null);
        setOrder(mergeHomeTileOrder(savedOrderRef.current, visibleIds, defaultOrder));
      }
    },
    [onOrderChange, defaultOrder, visibleIds, detachDragListeners, clearInnerTransforms, baselineRects],
  );

  const indexFromPoint = useCallback((clientX, clientY, currentOrder) => {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < currentOrder.length; i++) {
      const el = cellRefs.current.get(currentOrder[i]);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = (clientX - cx) ** 2 + (clientY - cy) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }, []);

  const onGripPointerDown = useCallback(
    (e, id) => {
      if (!arrangeable) return;
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      detachDragListeners();

      dragRef.current = {
        id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      baselineRects();
      setDraggingId(id);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";

      const move = (ev) => {
        const st = dragRef.current;
        if (!st || ev.pointerId !== st.pointerId) return;
        const dx = ev.clientX - st.startX;
        const dy = ev.clientY - st.startY;
        if (!st.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          st.moved = true;
        }
        if (!st.moved) return;
        const target = indexFromPoint(ev.clientX, ev.clientY, orderRef.current);
        setOrder((prev) => {
          const next = moveIdToIndex(prev, st.id, target);
          if (next.length === prev.length && next.every((tid, i) => tid === prev[i])) return prev;
          return next;
        });
      };

      const up = (ev) => {
        const st = dragRef.current;
        if (!st || ev.pointerId !== st.pointerId) return;
        endDrag(true);
      };

      const cancel = (ev) => {
        const st = dragRef.current;
        if (!st || ev.pointerId !== st.pointerId) return;
        endDrag(false);
      };

      listenersRef.current = { move, up, cancel };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    },
    [arrangeable, detachDragListeners, endDrag, indexFromPoint, baselineRects],
  );

  useEffect(() => () => detachDragListeners(), [detachDragListeners]);

  const onCellClickCapture = useCallback((e) => {
    if (Date.now() < suppressClickUntilRef.current || dragRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  return (
    <div style={GRID_STYLE} data-home-tile-grid="">
      <style>{FILL_CSS}</style>
      {order.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        const isDragging = draggingId === id;
        return (
          <div
            key={id}
            ref={(el) => setCellRef(id, el)}
            data-tile-id={id}
            onClickCapture={onCellClickCapture}
            style={{
              opacity: isDragging ? 0.92 : 1,
              zIndex: isDragging ? 3 : 1,
              touchAction: "manipulation",
              pointerEvents: draggingId && !isDragging ? "none" : undefined,
            }}
          >
            <div
              ref={(el) => setInnerRef(id, el)}
              data-tile-inner=""
              style={{ willChange: draggingId ? "transform" : undefined }}
            >
              {arrangeable && (
                <button
                  type="button"
                  aria-label={`Reorder ${id}`}
                  data-tile-grip={id}
                  onPointerDown={(e) => onGripPointerDown(e, id)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    zIndex: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    padding: 0,
                    border: "none",
                    borderRadius: 4,
                    background: isDragging ? "rgba(20,24,31,0.08)" : "transparent",
                    color: t.edge2,
                    cursor: isDragging ? "grabbing" : "grab",
                    touchAction: "none",
                  }}
                >
                  <GripHorizontal size={16} strokeWidth={2.25} aria-hidden />
                </button>
              )}
              {item.node}
            </div>
          </div>
        );
      })}
    </div>
  );
}

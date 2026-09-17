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

/**
 * Admin home tile grid with phone-style reorder via a top-right grip.
 * Any `{ id, node }` item is rearrangeable — not limited to today's catalog.
 * On drop, persists a full preference (including currently hidden tile ids)
 * so when tiles appear/disappear the user's relative order is restored.
 */
export function HomeTileGrid({ items, savedOrder = null, onOrderChange, arrangeable = true }) {
  const visibleIds = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const defaultOrder = useMemo(() => buildDefaultHomeTileOrder(visibleIds, DEFAULT_HOME_TILE_ORDER), [visibleIds]);

  const resolved = useMemo(
    () => mergeHomeTileOrder(savedOrder, visibleIds, defaultOrder),
    [savedOrder, visibleIds, defaultOrder],
  );

  const [order, setOrder] = useState(resolved);
  const [draggingId, setDraggingId] = useState(null);

  const cellRefs = useRef(new Map());
  const innerRefs = useRef(new Map());
  const prevRectsRef = useRef(new Map());
  const dragRef = useRef(null);
  const orderRef = useRef(order);
  const suppressClickUntilRef = useRef(0);
  /** After a successful drop, ignore stale `resolved` until savedOrder catches up. */
  const pendingFullOrderRef = useRef(null);
  const listenersRef = useRef(null);
  orderRef.current = order;

  useEffect(() => {
    if (draggingId) return;

    const pending = pendingFullOrderRef.current;
    if (pending) {
      const fromSaved = mergeHomeTileOrder(savedOrder, visibleIds, defaultOrder);
      if (sameIdList(savedOrder, pending) || sameIdList(fromSaved, orderRef.current)) {
        pendingFullOrderRef.current = null;
        if (!sameIdList(orderRef.current, fromSaved)) setOrder(fromSaved);
        return;
      }
      /* Parent has not applied the optimistic save yet — keep local order
         so we do not flash back to the pre-drag layout. */
      return;
    }

    setOrder((prev) => (sameIdList(prev, resolved) ? prev : resolved));
  }, [resolved, draggingId, savedOrder, visibleIds, defaultOrder]);

  const setCellRef = useCallback((id, el) => {
    if (el) cellRefs.current.set(id, el);
    else cellRefs.current.delete(id);
  }, []);

  const setInnerRef = useCallback((id, el) => {
    if (el) innerRefs.current.set(id, el);
    else innerRefs.current.delete(id);
  }, []);

  const clearInnerTransforms = useCallback(() => {
    for (const inner of innerRefs.current.values()) {
      inner.style.transform = "";
      inner.style.transition = "";
    }
  }, []);

  /* FLIP on the inner wrapper so React style updates on the cell don't
     clear the sliding transform mid-animation. */
  useLayoutEffect(() => {
    const nextRects = new Map();
    for (const id of order) {
      const el = cellRefs.current.get(id);
      if (!el) continue;
      nextRects.set(id, el.getBoundingClientRect());
    }

    if (!prefersReducedMotion()) {
      for (const id of order) {
        const inner = innerRefs.current.get(id);
        const prev = prevRectsRef.current.get(id);
        const next = nextRects.get(id);
        if (!inner || !prev || !next) continue;
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          if (id === draggingId) inner.style.transform = "scale(1.03)";
          continue;
        }
        const lift = id === draggingId ? " scale(1.03)" : "";
        inner.style.transition = "none";
        inner.style.transform = `translate(${dx}px, ${dy}px)${lift}`;
        void inner.offsetWidth;
        inner.style.transition = `transform ${LAYOUT_MS}ms cubic-bezier(.22,.61,.36,1)`;
        inner.style.transform = id === draggingId ? "scale(1.03)" : "";
      }
    }

    prevRectsRef.current = nextRects;
  }, [order, draggingId]);

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
      clearInnerTransforms();

      if (!state) {
        setDraggingId(null);
        return;
      }

      if (commit && state.moved) {
        suppressClickUntilRef.current = Date.now() + 400;
        const visibleOrder = orderRef.current.slice();
        const full = persistHomeTileOrder(savedOrder, visibleOrder, defaultOrder);
        pendingFullOrderRef.current = full;
        setOrder(visibleOrder);
        setDraggingId(null);
        onOrderChange?.(full);
      } else {
        setDraggingId(null);
        pendingFullOrderRef.current = null;
        setOrder(resolved);
      }
    },
    [onOrderChange, resolved, savedOrder, defaultOrder, detachDragListeners, clearInnerTransforms],
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

      /* Window listeners — not element capture. Reordering remounts/moves the
         grip mid-drag and would drop setPointerCapture, leaving the tile stuck. */
      detachDragListeners();

      dragRef.current = {
        id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      setDraggingId(id);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";

      const move = (ev) => {
        const state = dragRef.current;
        if (!state || ev.pointerId !== state.pointerId) return;
        const dx = ev.clientX - state.startX;
        const dy = ev.clientY - state.startY;
        if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          state.moved = true;
        }
        if (!state.moved) return;
        const target = indexFromPoint(ev.clientX, ev.clientY, orderRef.current);
        setOrder((prev) => {
          const next = moveIdToIndex(prev, state.id, target);
          if (next.length === prev.length && next.every((tid, i) => tid === prev[i])) return prev;
          return next;
        });
      };

      const up = (ev) => {
        const state = dragRef.current;
        if (!state || ev.pointerId !== state.pointerId) return;
        endDrag(true);
      };

      const cancel = (ev) => {
        const state = dragRef.current;
        if (!state || ev.pointerId !== state.pointerId) return;
        endDrag(false);
      };

      listenersRef.current = { move, up, cancel };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    },
    [arrangeable, detachDragListeners, endDrag, indexFromPoint],
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

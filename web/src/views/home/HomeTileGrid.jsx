import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";
import { t } from "../../theme.js";
import { mergeHomeTileOrder, moveIdToIndex, DEFAULT_HOME_TILE_ORDER } from "./homeTileOrder.js";

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

/**
 * Admin home tile grid with phone-style reorder via a top-right grip.
 * `items` is [{ id, node }]; `savedOrder` is the persisted preference (or null).
 * `onOrderChange(nextIds)` fires on drop after a real drag.
 */
export function HomeTileGrid({ items, savedOrder = null, onOrderChange, arrangeable = true }) {
  const visibleIds = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const resolved = useMemo(
    () => mergeHomeTileOrder(savedOrder, visibleIds, DEFAULT_HOME_TILE_ORDER),
    [savedOrder, visibleIds],
  );

  const [order, setOrder] = useState(resolved);
  const [draggingId, setDraggingId] = useState(null);

  useEffect(() => {
    if (draggingId) return;
    setOrder(resolved);
  }, [resolved, draggingId]);

  const cellRefs = useRef(new Map());
  const innerRefs = useRef(new Map());
  const prevRectsRef = useRef(new Map());
  const dragRef = useRef(null);
  const orderRef = useRef(order);
  const suppressClickUntilRef = useRef(0);
  orderRef.current = order;

  const setCellRef = useCallback((id, el) => {
    if (el) cellRefs.current.set(id, el);
    else cellRefs.current.delete(id);
  }, []);

  const setInnerRef = useCallback((id, el) => {
    if (el) innerRefs.current.set(id, el);
    else innerRefs.current.delete(id);
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

  useEffect(() => {
    if (draggingId) return;
    for (const inner of innerRefs.current.values()) {
      inner.style.transform = "";
      inner.style.transition = "";
    }
  }, [draggingId]);

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

  const endDrag = useCallback(
    (commit) => {
      const state = dragRef.current;
      dragRef.current = null;
      setDraggingId(null);
      if (!state) return;
      if (commit && state.moved) {
        suppressClickUntilRef.current = Date.now() + 400;
        onOrderChange?.(orderRef.current.slice());
      } else if (!state.moved) {
        setOrder(resolved);
      }
    },
    [onOrderChange, resolved],
  );

  const onGripPointerDown = useCallback(
    (e, id) => {
      if (!arrangeable) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      setDraggingId(id);
    },
    [arrangeable],
  );

  const onGripPointerMove = useCallback(
    (e) => {
      const state = dragRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        state.moved = true;
      }
      if (!state.moved) return;
      const target = indexFromPoint(e.clientX, e.clientY, orderRef.current);
      setOrder((prev) => {
        const next = moveIdToIndex(prev, state.id, target);
        if (next.length === prev.length && next.every((tid, i) => tid === prev[i])) return prev;
        return next;
      });
    },
    [indexFromPoint],
  );

  const onGripPointerUp = useCallback(
    (e) => {
      const state = dragRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      endDrag(true);
    },
    [endDrag],
  );

  const onGripPointerCancel = useCallback(() => {
    endDrag(false);
  }, [endDrag]);

  const onCellClickCapture = useCallback((e) => {
    if (Date.now() < suppressClickUntilRef.current) {
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
            }}
          >
            <div ref={(el) => setInnerRef(id, el)} data-tile-inner="" style={{ willChange: draggingId ? "transform" : undefined }}>
              {arrangeable && (
                <button
                  type="button"
                  aria-label={`Reorder ${id}`}
                  data-tile-grip={id}
                  onPointerDown={(e) => onGripPointerDown(e, id)}
                  onPointerMove={onGripPointerMove}
                  onPointerUp={onGripPointerUp}
                  onPointerCancel={onGripPointerCancel}
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

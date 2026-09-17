import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";
import { t } from "../../theme.js";
import { mergeHomeTileOrder, moveIdToIndex, DEFAULT_HOME_TILE_ORDER } from "./homeTileOrder.js";

const DRAG_THRESHOLD_PX = 4;

const GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginBottom: "1.5rem",
};

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
  const dragRef = useRef(null);
  const orderRef = useRef(order);
  const suppressClickUntilRef = useRef(0);
  orderRef.current = order;

  const setCellRef = useCallback((id, el) => {
    if (el) cellRefs.current.set(id, el);
    else cellRefs.current.delete(id);
  }, []);

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
        if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
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
              position: "relative",
              opacity: isDragging ? 0.85 : 1,
              transform: isDragging ? "scale(1.02)" : "none",
              transition: draggingId ? "transform 120ms ease, opacity 120ms ease" : undefined,
              zIndex: isDragging ? 2 : 1,
              touchAction: "manipulation",
            }}
          >
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
                  zIndex: 3,
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
                  cursor: "grab",
                  touchAction: "none",
                }}
              >
                <GripHorizontal size={16} strokeWidth={2.25} aria-hidden />
              </button>
            )}
            {item.node}
          </div>
        );
      })}
    </div>
  );
}

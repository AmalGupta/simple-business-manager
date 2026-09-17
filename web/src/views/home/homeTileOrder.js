import { WORKFLOW_CATEGORIES } from "../../lib/constants.js";

/** Stable home-tile ids in the product default left-to-right / top-to-bottom order. */
export const DEFAULT_HOME_TILE_ORDER = [
  "closed-today",
  "calls-logged",
  "sites-attention",
  "escalations",
  "staff",
  "callers",
  "material-shortages",
  "calls-needing-action",
  "my-open-todos",
  "complaints",
  ...WORKFLOW_CATEGORIES.map((c) => `workflow:${c.key}`),
  "open-today",
  "parked",
];

export function workflowTileId(categoryKey) {
  return `workflow:${categoryKey}`;
}

/**
 * Resolve display order for currently visible tiles.
 * Prefers the user's saved order; drops hidden ids; inserts newly visible
 * ids at their default-relative positions (phone-grid style).
 */
export function mergeHomeTileOrder(saved, visibleIds, defaultOrder = DEFAULT_HOME_TILE_ORDER) {
  const visible = new Set(visibleIds);
  const result = (Array.isArray(saved) ? saved : []).filter((id) => visible.has(id));
  const used = new Set(result);

  for (const id of defaultOrder) {
    if (!visible.has(id) || used.has(id)) continue;
    const defIdx = defaultOrder.indexOf(id);
    let after = -1;
    for (let j = defIdx - 1; j >= 0; j--) {
      const pos = result.indexOf(defaultOrder[j]);
      if (pos !== -1) {
        after = pos;
        break;
      }
    }
    let before = result.length;
    for (let j = defIdx + 1; j < defaultOrder.length; j++) {
      const pos = result.indexOf(defaultOrder[j]);
      if (pos !== -1) {
        before = pos;
        break;
      }
    }
    const insertAt = after + 1 <= before ? after + 1 : before;
    result.splice(insertAt, 0, id);
    used.add(id);
  }

  for (const id of visibleIds) {
    if (!used.has(id)) {
      result.push(id);
      used.add(id);
    }
  }

  return result;
}

/** Reorder `order` by moving `fromId` to the slot currently occupied by `toIndex`. */
export function moveIdToIndex(order, fromId, toIndex) {
  const from = order.indexOf(fromId);
  if (from < 0) return order;
  const next = order.slice();
  next.splice(from, 1);
  const clamped = Math.max(0, Math.min(toIndex, next.length));
  next.splice(clamped, 0, fromId);
  return next;
}

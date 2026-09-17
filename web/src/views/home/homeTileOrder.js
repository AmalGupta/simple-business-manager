import { WORKFLOW_CATEGORIES } from "../../lib/constants.js";

/**
 * Product default left-to-right / top-to-bottom order for known tiles.
 * Not an exclusive allowlist — any other tile id (future or dynamic) is
 * still rearrangeable; defaults only guide where first-seen tiles land.
 */
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

/** Default catalog plus any live ids the catalog does not yet list. */
export function buildDefaultHomeTileOrder(extraIds = [], catalog = DEFAULT_HOME_TILE_ORDER) {
  const out = catalog.slice();
  const seen = new Set(out);
  for (const id of extraIds) {
    if (!id || seen.has(id)) continue;
    out.push(id);
    seen.add(id);
  }
  return out;
}

/**
 * Resolve display order for currently visible tiles.
 * Prefers the user's saved order; drops hidden ids (without forgetting them
 * in storage — see persistHomeTileOrder); inserts newly visible ids at their
 * default-relative positions. Works for any id, not only the catalog.
 */
export function mergeHomeTileOrder(saved, visibleIds, defaultOrder = DEFAULT_HOME_TILE_ORDER) {
  const visible = new Set(visibleIds);
  const catalog = buildDefaultHomeTileOrder(visibleIds, defaultOrder);
  const result = (Array.isArray(saved) ? saved : []).filter((id) => visible.has(id));
  const used = new Set(result);

  for (const id of catalog) {
    if (!visible.has(id) || used.has(id)) continue;
    const defIdx = catalog.indexOf(id);
    let after = -1;
    for (let j = defIdx - 1; j >= 0; j--) {
      const pos = result.indexOf(catalog[j]);
      if (pos !== -1) {
        after = pos;
        break;
      }
    }
    let before = result.length;
    for (let j = defIdx + 1; j < catalog.length; j++) {
      const pos = result.indexOf(catalog[j]);
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

/**
 * Write-back after a visible reorder. Keeps currently-hidden tile ids in the
 * preference so when they reappear (count goes from 0→N, workflow category
 * opens, etc.) they return to their previous relative slot — not the default.
 *
 * Walks the prior full order and replaces each visible slot with the next id
 * from `visibleOrderedIds` (phone-style: hidden icons keep their holes).
 * First save (no prior preference) stores only the visible order.
 */
export function persistHomeTileOrder(previousSaved, visibleOrderedIds, defaultOrder = DEFAULT_HOME_TILE_ORDER) {
  if (!Array.isArray(previousSaved) || previousSaved.length === 0) {
    return visibleOrderedIds.slice();
  }

  const visibleSet = new Set(visibleOrderedIds);
  const base = previousSaved.slice();
  const seen = new Set(base);
  for (const id of visibleOrderedIds) {
    if (!seen.has(id)) {
      base.push(id);
      seen.add(id);
    }
  }

  const queue = visibleOrderedIds.slice();
  const result = [];
  const placed = new Set();

  for (const id of base) {
    if (visibleSet.has(id)) {
      const next = queue.shift();
      if (next != null && !placed.has(next)) {
        result.push(next);
        placed.add(next);
      }
    } else if (!placed.has(id)) {
      result.push(id);
      placed.add(id);
    }
  }

  for (const id of queue) {
    if (!placed.has(id)) {
      result.push(id);
      placed.add(id);
    }
  }

  // defaultOrder kept in the signature so callers can pass a live catalog;
  // unused on the write path once a preference exists (hidden ids already live in previousSaved).
  void defaultOrder;
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

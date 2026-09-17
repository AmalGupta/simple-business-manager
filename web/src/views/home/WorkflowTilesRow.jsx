import { WORKFLOW_CATEGORIES } from "../../lib/constants.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { workflowTileId } from "./homeTileOrder.js";

/* ------------------------------------------------------------------
   Workflow-category tiles — migration 0013. Same template as StaffTile:
   count + label, clickable. `tasks` is the flat open-site-tasks list (see
   fetchOpenSiteTasks) already scoped server-side to "mine" for a staff
   session or "everyone" for admin — this component just groups it by
   category and renders one tile per non-empty category, hidden at zero
   rather than shown as a permanent 0 (same rule as the escalations tile).
   ------------------------------------------------------------------ */

/** Visible non-zero workflow categories with counts (stable WORKFLOW_CATEGORIES order). */
export function listVisibleWorkflowTiles(tasks, excludeCategories = []) {
  const hidden = new Set(excludeCategories);
  const counts = new Map();
  for (const task of tasks) {
    if (hidden.has(task.category)) continue;
    counts.set(task.category, (counts.get(task.category) ?? 0) + 1);
  }
  return WORKFLOW_CATEGORIES.filter((c) => !hidden.has(c.key) && counts.get(c.key) > 0).map((c) => ({
    id: workflowTileId(c.key),
    category: c.key,
    label: c.label,
    count: counts.get(c.key),
  }));
}

export function WorkflowCategoryTile({ category, label, count, onOpen }) {
  return (
    <button
      onClick={() => onOpen(category)}
      style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", height: "100%" }}
      aria-label={`${label} — ${count} open`}
    >
      <Card tile>
        <TileLabel>{label}</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

export function WorkflowTilesRow({ tasks, onOpenCategory, excludeCategories = [] }) {
  return listVisibleWorkflowTiles(tasks, excludeCategories).map((c) => (
    <WorkflowCategoryTile
      key={c.category}
      category={c.category}
      label={c.label}
      count={c.count}
      onOpen={onOpenCategory}
    />
  ));
}

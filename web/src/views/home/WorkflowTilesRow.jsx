import { useMemo } from "react";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { WORKFLOW_CATEGORIES, STAFF_HIDDEN_WORKFLOW_CATEGORIES } from "../../lib/constants.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* ------------------------------------------------------------------
   Workflow-category tiles — migration 0013. Same template as StaffTile:
   count + label, clickable. `tasks` is the flat open-site-tasks list (see
   fetchOpenSiteTasks) already scoped server-side to "mine" for a staff
   session or "everyone" for admin — this component just groups it by
   category and renders one tile per non-empty category, hidden at zero
   rather than shown as a permanent 0 (same rule as the escalations tile).
   ------------------------------------------------------------------ */
export function WorkflowTilesRow({ tasks, onOpenCategory, excludeCategories = [] }) {
  const hidden = useMemo(() => new Set(excludeCategories), [excludeCategories]);
  const counts = useMemo(() => {
    const m = new Map();
    for (const task of tasks) {
      if (hidden.has(task.category)) continue;
      m.set(task.category, (m.get(task.category) ?? 0) + 1);
    }
    return m;
  }, [tasks, hidden]);

  return WORKFLOW_CATEGORIES.filter((c) => !hidden.has(c.key) && counts.get(c.key) > 0).map((c) => (
    <button
      key={c.key}
      onClick={() => onOpenCategory(c.key)}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`${c.label} — ${counts.get(c.key)} open`}
    >
      <Card tile>
        <TileLabel>{c.label}</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{counts.get(c.key)}</span>
        </div>
      </Card>
    </button>
  ));
}

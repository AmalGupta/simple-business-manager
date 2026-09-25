import { useState, useEffect } from "react";
import { Hammer } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { fetchProductionJobs } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Home-panel entry point into the production job tracker (migration 0042)
   — admin/superadmin only, same StaffTile/StatCard template as the other
   admin tiles. Counts jobs not yet dispatched (active + ready_for_dispatch)
   — a dispatched/completed job has left this desk's attention. */
export function ProductionJobsTile({ onOpen }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchProductionJobs("active"), fetchProductionJobs("ready_for_dispatch")])
      .then(([active, ready]) => {
        if (!cancelled) setCount((active?.length ?? 0) + (ready?.length ?? 0));
      })
      .catch((err) => {
        console.error("[sbm] failed to load production jobs", err);
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Production — ${count ?? 0} jobs in progress`}
    >
      <Card tile>
        <TileLabel action={<Hammer size={14} color={t.edge2} />}>Production</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count ?? 0}</span>
        </div>
      </Card>
    </button>
  );
}

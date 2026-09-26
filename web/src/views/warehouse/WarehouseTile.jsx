import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { fetchWarehouseMovements } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00Z`);
  const now = new Date();
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
}

/* Home-panel entry point into the warehouse register (migration 0042) —
   any staff or admin session (Manglesh is `staff`; admin needs the same
   buttons to cover for him). Shows today's entry count, always visible
   (not hidden at zero) since this is a workspace, not an alert. */
export function WarehouseTile({ onOpen }) {
  const [todayCount, setTodayCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchWarehouseMovements({ limit: 100 })
      .then((rows) => {
        if (!cancelled) setTodayCount(rows.filter((r) => isToday(r.created_at)).length);
      })
      .catch((err) => {
        console.error("[sbm] failed to load warehouse movements", err);
        if (!cancelled) setTodayCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button onClick={onOpen} style={{ all: "unset", cursor: "pointer", display: "block" }} aria-label={`Warehouse — ${todayCount ?? 0} entries today`}>
      <Card tile>
        <TileLabel action={<Package size={14} color={t.edge2} />}>Warehouse</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{todayCount ?? 0}</span>
        </div>
      </Card>
    </button>
  );
}

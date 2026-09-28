import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { fetchTaskAudit } from "../../lib/api.js";

/* Admin home — every transition on any task (done, passed on, routed,
   re-planned…). The number is today's activity (IST). */
export function TaskAuditTile({ onOpen, refreshKey = 0 }) {
  const [today, setToday] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchTaskAudit({ limit: 1 })
      .then((r) => !cancelled && setToday(r.today_count ?? 0))
      .catch((err) => console.error("[sbm] failed to load task audit count", err));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Task audit — ${today ?? 0} changes today`}
    >
      <Card tile>
        <TileLabel action={<History size={14} color={t.edge2} />}>Task audit</TileLabel>
        <div style={{ ...TILE_VALUE_ROW_STYLE, flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 4 }}>
          <span style={TILE_NUMBER_STYLE}>{today ?? "–"}</span>
          <span style={{ fontSize: 12, color: t.edge2 }}>changes today</span>
        </div>
      </Card>
    </button>
  );
}

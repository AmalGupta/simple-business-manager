import { useState, useEffect } from "react";
import { MessageSquareWarning } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { fetchComplaintsCount } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Home-panel Complaints tile — open staff-filed complaint count for staff
   and admin. Always shows the number (including 0). */
export function ComplaintsTile({ onOpen, refreshKey = 0 }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchComplaintsCount()
      .then((n) => {
        if (!cancelled) setCount(n);
      })
      .catch((err) => {
        console.error("[sbm] failed to load complaints count", err);
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`Complaints — ${count ?? 0} open`}
    >
      <Card tile>
        <TileLabel action={<MessageSquareWarning size={14} color={t.edge2} />}>Complaints</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count ?? 0}</span>
        </div>
      </Card>
    </button>
  );
}

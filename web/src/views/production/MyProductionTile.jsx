import { useState, useEffect } from "react";
import { Hammer } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { fetchOpenProductionSteps } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* Staff home — "My production steps": steps currently assigned to this
   staff member (Tanseem's measurement/cutting, or a junior's routing/
   assembly/glass-integration hand-off). Hidden at zero, same convention as
   MaterialShortagesTile/ComplaintsTile. */
export function MyProductionTile({ onOpen, forUserId = null }) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchOpenProductionSteps({ forUserId: forUserId || undefined })
      .then((rows) => {
        if (!cancelled) setCount(rows.length);
      })
      .catch((err) => {
        console.error("[sbm] failed to load production steps", err);
        if (!cancelled) setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [forUserId]);

  if (!count) return null;

  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`My production steps — ${count}`}
    >
      <Card tile>
        <TileLabel action={<Hammer size={14} color={t.edge2} />}>Production</TileLabel>
        <div style={TILE_VALUE_ROW_STYLE}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
        </div>
      </Card>
    </button>
  );
}

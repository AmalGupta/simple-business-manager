import { ClipboardList } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { useT } from "../../lib/i18n.jsx";

/* Staff home — open work assigned to this person. The big number is tasks
   (call todos + site stages); SBM-72 adds a red line underneath for the
   complaints they hold, which the owner asked to stand out the same way
   urgent work does. */
export function AssignedWorkTile({ count, urgentCount = 0, complaintsCount = 0, onOpen }) {
  const tr = useT();
  return (
    <button
      onClick={onOpen}
      style={{ all: "unset", cursor: "pointer", display: "block" }}
      aria-label={`${tr("assignedWork")} — ${tr("nOpen", { n: count })}${urgentCount ? `, ${tr("nUrgent", { n: urgentCount })}` : ""}${
        complaintsCount ? `, ${tr(complaintsCount === 1 ? "nComplaint" : "nComplaints", { n: complaintsCount })}` : ""
      }`}
    >
      <Card tile>
        <TileLabel action={<ClipboardList size={14} color={t.edge2} />}>{tr("assignedWork")}</TileLabel>
        <div style={{ ...TILE_VALUE_ROW_STYLE, flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 6 }}>
          <span style={TILE_NUMBER_STYLE}>{count}</span>
          {complaintsCount > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, color: t.signal }}>
              {tr(complaintsCount === 1 ? "nComplaint" : "nComplaints", { n: complaintsCount })}
            </span>
          )}
          {urgentCount > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: t.signal }}>{tr("nUrgent", { n: urgentCount })}</span>}
        </div>
      </Card>
    </button>
  );
}

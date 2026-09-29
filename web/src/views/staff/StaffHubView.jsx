import { useEffect, useState } from "react";
import { UserMinus, Users } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_NUMBER_STYLE, TILE_VALUE_ROW_STYLE } from "../../styles.js";
import { fetchOffboardingList } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { BackLink } from "../../components/BackLink.jsx";

function HubTile({ label, icon, count, note, onOpen }) {
  return (
    <button type="button" onClick={onOpen} style={{ all: "unset", cursor: "pointer", display: "block" }} aria-label={`${label} — ${count}`}>
      <Card tile>
        <TileLabel action={icon}>{label}</TileLabel>
        <div style={{ ...TILE_VALUE_ROW_STYLE, flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 6 }}>
          <span style={TILE_NUMBER_STYLE}>{count ?? "–"}</span>
          {note && <span style={{ fontSize: 12, color: t.edge2 }}>{note}</span>}
        </div>
      </Card>
    </button>
  );
}

/* SBM-64 — the Staff tile's landing page: the same tile grid as home, with
   the staff list on one side and staff transitions (offboarding) on the
   other. */
export function StaffHubView({ staffCount, onBack, onOpenList, onOpenOffboarding }) {
  const [leaving, setLeaving] = useState(null);

  useEffect(() => {
    fetchOffboardingList()
      .then(setLeaving)
      .catch((err) => {
        console.error("[sbm] failed to load offboarding list", err);
        setLeaving([]);
      });
  }, []);

  const left = leaving?.reduce((n, l) => n + l.remaining, 0) ?? 0;

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>Staff</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <HubTile
          label="Staff list"
          icon={<Users size={14} color={t.edge2} />}
          count={staffCount}
          note="Add, PINs, joining dates"
          onOpen={onOpenList}
        />
        <HubTile
          label="Offboard a staff member"
          icon={<UserMinus size={14} color={t.edge2} />}
          count={leaving ? leaving.length : null}
          note={leaving?.length ? `${left} task${left === 1 ? "" : "s"} still to hand over` : "Nobody leaving"}
          onOpen={onOpenOffboarding}
        />
      </div>
    </div>
  );
}

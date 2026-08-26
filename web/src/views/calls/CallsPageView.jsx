import { useState, useMemo } from "react";
import { t } from "../../theme.js";
import { sortCalls } from "../../lib/constants.js";
import { TILE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { DownloadButton } from "../../components/DownloadButton.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { CallCard } from "../../components/CallCard.jsx";

/* Calls Transcripts page — everything that used to sit directly on the
   admin home feed, relocated behind the "Calls logged" tile. Adds the two
   summary tiles (Important/Regular — see CallTypeBadge above for the same
   split) and per-card badges; todo toggling, park, and download are
   unchanged from the old home feed. */
export function CallsPageView({ calls, onBack, onOpen, onToggle, onPark, busyIds }) {
  const [filter, setFilter] = useState(null); // null = all, "important", "regular"

  const importantCalls = useMemo(() => calls.filter((c) => c.call_type !== "low_signal"), [calls]);
  const regularCalls = useMemo(() => calls.filter((c) => c.call_type === "low_signal"), [calls]);
  const shown = filter === "important" ? importantCalls : filter === "regular" ? regularCalls : calls;
  const ordered = useMemo(() => sortCalls(shown), [shown]);

  const toggle = (key) => setFilter((current) => (current === key ? null : key));

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>Calls</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <button onClick={() => toggle("important")} style={{ all: "unset", cursor: "pointer", display: "block" }}>
          <Card style={{ borderColor: filter === "important" ? t.accent : t.frost }}>
            <TileLabel>Important calls</TileLabel>
            <div style={{ ...TILE_ROW_STYLE, borderTop: "none", padding: "6px 0 0" }}>
              <span style={TILE_NUMBER_STYLE}>{importantCalls.length}</span>
            </div>
          </Card>
        </button>
        <button onClick={() => toggle("regular")} style={{ all: "unset", cursor: "pointer", display: "block" }}>
          <Card style={{ borderColor: filter === "regular" ? t.accent : t.frost }}>
            <TileLabel>Regular calls</TileLabel>
            <div style={{ ...TILE_ROW_STYLE, borderTop: "none", padding: "6px 0 0" }}>
              <span style={TILE_NUMBER_STYLE}>{regularCalls.length}</span>
            </div>
          </Card>
        </button>
      </div>

      {calls.length === 0 ? (
        <EmptyState />
      ) : ordered.length === 0 ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>No {filter} calls.</p>
      ) : (
        <>
          {ordered.map((call, i) => (
            <CallCard
              key={call.id}
              index={i}
              call={call}
              showTypeBadge
              onOpen={onOpen}
              onToggle={onToggle}
              onPark={onPark}
              busyIds={busyIds}
            />
          ))}
          <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
            <DownloadButton calls={ordered} label={filter ?? "all"}>
              Download {filter ?? "everything"}
            </DownloadButton>
          </div>
        </>
      )}
    </div>
  );
}

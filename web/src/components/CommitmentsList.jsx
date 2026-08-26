import { t } from "../theme.js";
import { fmtShort } from "../lib/dates.js";

export function CommitmentsList({ commitments }) {
  if (!commitments || commitments.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {commitments.map((c) => (
        <div key={c.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13 }}>
          <span style={{ color: t.edge2, fontStyle: "italic" }}>{c.raw_phrase}</span>
          {c.resolved_datetime && (
            <>
              <span style={{ color: t.edge2 }}>→</span>
              <span style={{ color: t.edge }}>{fmtShort(c.resolved_datetime)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

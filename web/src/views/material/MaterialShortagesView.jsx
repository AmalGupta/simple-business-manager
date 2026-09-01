import { useState, useEffect } from "react";
import { Circle } from "lucide-react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { fetchMaterialShortages, patchMaterialShortage } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* Full material-shortage ledger — admin/superadmin only. Reported from the
   staff site-visit flow ("Material Short" checklist row); resolving here
   is the only way a row leaves the open count on the home tile. */
export function MaterialShortagesView({ onBack }) {
  const [rows, setRows] = useState(null);
  const [busyIds, setBusyIds] = useState(new Set());

  const load = () => {
    fetchMaterialShortages()
      .then(setRows)
      .catch((err) => {
        console.error("[sbm] failed to load material shortages", err);
        setRows([]);
      });
  };

  useEffect(load, []);

  const resolve = async (id) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await patchMaterialShortage(id);
      load();
    } catch (err) {
      console.error("[sbm] failed to resolve material shortage", err);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>Material Shortages</h1>

      {rows === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No material shortages reported.</p>
        </Card>
      ) : (
        <Card>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderTop: `1px solid ${t.frost}` }}>
              {r.status === "open" ? (
                <button
                  onClick={() => resolve(r.id)}
                  disabled={busyIds.has(r.id)}
                  aria-label={`Mark fulfilled: ${r.site_name}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 44,
                    height: 44,
                    margin: "-11px 0 -11px -11px",
                    flexShrink: 0,
                    padding: 0,
                    border: "none",
                    background: "none",
                    cursor: busyIds.has(r.id) ? "wait" : "pointer",
                    color: t.edge2,
                  }}
                >
                  <Circle size={17} strokeWidth={1.75} />
                </button>
              ) : (
                <span style={{ width: 44, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, fontSize: 14, lineHeight: 1.5, color: t.edge }}>
                <span style={{ fontWeight: 500, color: t.edgeStrong }}>{r.site_name}</span>
                {r.description && <div style={{ marginTop: 2 }}>{r.description}</div>}
                <div style={{ fontSize: 12, color: t.edge2, marginTop: 2 }}>
                  {r.reported_by_name ? `Reported by ${r.reported_by_name}` : "Reported"} · {fmtShort(r.reported_at)}
                  {r.status === "fulfilled" && r.resolved_at && ` · Fulfilled ${fmtShort(r.resolved_at)}`}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

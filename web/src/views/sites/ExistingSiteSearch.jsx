import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE } from "../../styles.js";
import { searchSites } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { useT } from "../../lib/i18n.jsx";

/* SBM-95 — on "Add new site", let staff find a site that already exists
   (any confirmed site, not just their own) before creating a duplicate.
   Picking one hands the site to `onPick`; the caller joins them to its team. */
export function ExistingSiteSearch({ onPick, disabled = false }) {
  const tr = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchSites(term)
        .then((rows) => !cancelled && setResults(rows))
        .catch((err) => {
          console.error("[sbm] site search failed", err);
          if (!cancelled) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <Card style={{ padding: "1rem", marginBottom: "1.25rem" }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: t.edge, marginBottom: 8 }}>
        {tr("findExistingSite")}
      </label>
      <div style={{ position: "relative" }}>
        <Search size={16} color={t.edge2} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("phSearchSite")}
          aria-label={tr("findExistingSite")}
          style={{ ...TEXT_INPUT_STYLE, width: "100%", minHeight: 44, paddingLeft: 32, boxSizing: "border-box" }}
        />
      </div>
      {results && results.length === 0 && (
        <p style={{ fontSize: 13, color: t.edge2, margin: "10px 0 0" }}>{tr("noSiteMatches")}</p>
      )}
      {results && results.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {results.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              style={{
                display: "flex",
                width: "100%",
                minHeight: 44,
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 0",
                border: "none",
                borderTop: `1px solid ${t.frost}`,
                background: "none",
                cursor: disabled ? "default" : "pointer",
                textAlign: "left",
                fontFamily: t.body,
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: t.edgeStrong }}>{s.name}</span>
                {s.site_name_being_used && s.site_name_being_used !== s.name && (
                  <span style={{ display: "block", fontSize: 12, color: t.edge2 }}>{s.site_name_being_used}</span>
                )}
              </span>
              {s.is_member ? <span style={{ fontSize: 11, color: t.edge2, whiteSpace: "nowrap" }}>{tr("yourSite")}</span> : null}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

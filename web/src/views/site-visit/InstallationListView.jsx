import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { fetchSiteInstallations, postSiteInstallation } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* Installations at one site — "one site, multiple installations" from the
   brainstorm sketch (separate windows/openings, each accumulating its own
   checklist over repeat visits). The staff-typed label here is purely for
   list display; the checklist's own "Location of Work / Window" row still
   captures the voice+photo evidence for that instance. */
export function InstallationListView({ site, onBack, onOpenInstallation }) {
  const [installations, setInstallations] = useState(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetchSiteInstallations(site.id)
      .then(setInstallations)
      .catch((err) => {
        console.error("[sbm] failed to load installations", err);
        setInstallations([]);
      });
  };

  useEffect(load, [site.id]);

  const submit = async () => {
    const trimmed = label.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const created = await postSiteInstallation(site.id, trimmed);
      setLabel("");
      setAdding(false);
      setInstallations((prev) => [...(prev ?? []), created]);
      onOpenInstallation(created);
    } catch (err) {
      console.error("[sbm] failed to create installation", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>{site.name} — Installations</h1>
      </div>

      {adding ? (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Window 3 - Living Room"
              style={{ ...TEXT_INPUT_STYLE, flex: 1 }}
            />
            <button
              onClick={submit}
              disabled={saving || !label.trim()}
              style={{ ...PRIMARY_BUTTON_STYLE, cursor: saving ? "wait" : "pointer", opacity: saving || !label.trim() ? 0.6 : 1 }}
            >
              Add
            </button>
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minHeight: 44,
            padding: "8px 14px",
            marginBottom: 12,
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            background: t.white,
            color: t.edge,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Plus size={15} /> New installation
        </button>
      )}

      {installations === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : installations.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No installations logged yet at this site.</p>
        </Card>
      ) : (
        <Card>
          {installations.map((i) => (
            <button
              key={i.id}
              onClick={() => onOpenInstallation(i)}
              style={{
                display: "block",
                width: "100%",
                minHeight: 44,
                padding: "12px 0",
                border: "none",
                borderTop: `1px solid ${t.frost}`,
                background: "none",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: t.body,
                fontSize: 15,
                fontWeight: 500,
                color: t.edgeStrong,
              }}
            >
              {i.label}
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

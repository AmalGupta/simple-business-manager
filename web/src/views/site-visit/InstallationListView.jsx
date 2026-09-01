import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { fetchSiteInstallations, postSiteInstallation } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";

/* Copy per site-visit category — kept local to this view since the grid
   (SITE_VISIT_CATEGORIES) only needs the enable/gate logic, not display
   strings. All three categories share this exact list+create+checklist
   pattern (migration 0017) — only labels differ. */
const COPY = {
  installation: {
    listTitle: "Installations",
    emptyState: "No installations logged yet at this site.",
    newButton: "New installation",
    placeholder: "e.g. Window 3 - Living Room",
  },
  measurement: {
    listTitle: "Measurements",
    emptyState: "No measurements logged yet at this site.",
    newButton: "New measurement",
    placeholder: "e.g. Living room windows",
  },
  material_delivery: {
    listTitle: "Material Deliveries",
    emptyState: "No material deliveries logged yet at this site.",
    newButton: "New delivery",
    placeholder: "e.g. Glass sheets - 12mm toughened",
  },
};

/* Instances at one site for one category — "one site, multiple
   installations" from the brainstorm sketch generalizes to measurements
   and material deliveries too (migration 0017): each accumulates its own
   checklist over repeat visits. The staff-typed label here is purely for
   list display; the checklist's own "Location of Work / Window" row still
   captures the voice+photo evidence for that instance. */
export function InstallationListView({ site, category, onBack, onOpenInstallation }) {
  const copy = COPY[category];
  const [installations, setInstallations] = useState(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetchSiteInstallations(site.id, category)
      .then(setInstallations)
      .catch((err) => {
        console.error("[sbm] failed to load installations", err);
        setInstallations([]);
      });
  };

  useEffect(load, [site.id, category]);

  const submit = async () => {
    const trimmed = label.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const created = await postSiteInstallation(site.id, trimmed, category);
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
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>
          {site.name} — {copy.listTitle}
        </h1>
      </div>

      {adding ? (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={copy.placeholder}
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
          <Plus size={15} /> {copy.newButton}
        </button>
      )}

      {installations === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : installations.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>{copy.emptyState}</p>
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

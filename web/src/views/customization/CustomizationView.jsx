import { useState } from "react";
import { t } from "../../theme.js";
import { BackLink } from "../../components/BackLink.jsx";
import { Card } from "../../components/Card.jsx";
import { patchMyCustomization } from "../../lib/api.js";

const PREFS = [
  {
    key: "inner_scrolls",
    label: "Scroll inside cards & table",
    description: "Fixed-height call cards and a viewport-locked Calls table with their own vertical scrollbars.",
  },
  {
    key: "horizontal_scrolls",
    label: "Scroll sideways for wide content",
    description: "When off, wide table cells and card text wrap instead of scrolling horizontally.",
  },
];

function defaultsFromMe(customization) {
  return {
    inner_scrolls: customization?.inner_scrolls ?? false,
    horizontal_scrolls: customization?.horizontal_scrolls ?? false,
  };
}

export function CustomizationView({ customization, onCustomizationChange, onBack }) {
  const [values, setValues] = useState(() => defaultsFromMe(customization));
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");

  const toggle = async (key) => {
    const next = !values[key];
    setBusyKey(key);
    setError("");
    setValues((v) => ({ ...v, [key]: next }));
    try {
      const data = await patchMyCustomization({ [key]: next });
      const resolved = data.customization ?? { ...values, [key]: next };
      setValues(defaultsFromMe(resolved));
      onCustomizationChange?.(resolved);
    } catch (err) {
      console.error("[sbm] failed to save customization", err);
      setValues((v) => ({ ...v, [key]: !next }));
      setError("Failed to save — try again.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1
        style={{
          fontFamily: t.display,
          fontSize: 22,
          fontWeight: 500,
          color: t.edge,
          margin: "0 0 8px",
        }}
      >
        Customization
      </h1>
      <p style={{ fontSize: 14, color: t.edge2, margin: "0 0 1.25rem", lineHeight: 1.5 }}>
        Personal UI preferences for your account. Other admins keep their own settings.
      </p>

      {error ? <p style={{ fontSize: 13, color: t.signal, margin: "0 0 12px" }}>{error}</p> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {PREFS.map((pref) => (
          <Card key={pref.key}>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                cursor: busyKey === pref.key ? "wait" : "pointer",
                margin: 0,
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(values[pref.key])}
                disabled={busyKey === pref.key}
                onChange={() => toggle(pref.key)}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--color-accent)", flexShrink: 0 }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: t.edge }}>{pref.label}</span>
                <span style={{ display: "block", fontSize: 13, color: t.edge2, marginTop: 4, lineHeight: 1.45 }}>
                  {pref.description}
                </span>
              </span>
            </label>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Circle } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_ROW_STYLE, TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";

/* ------------------------------------------------------------------
   Tile 4 — escalations. Manual only, the pipeline never writes here —
   see docs/ADDITIONAL_FEATURES_M0.md "Tile 4 — Escalations".
   ------------------------------------------------------------------ */
export function EscalationsTile({ escalations, onAdd, onClose, busyIds }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setText("");
      setAdding(false);
    } catch (err) {
      console.error("[sbm] failed to add escalation", err);
    } finally {
      setSaving(false);
    }
  };

  const addButton = (
    <button
      onClick={() => setAdding((v) => !v)}
      aria-label={adding ? "Cancel" : "Add escalation"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        border: `1px solid ${t.frost}`,
        borderRadius: t.radiusButton,
        background: t.white,
        color: t.edge,
        cursor: "pointer",
        padding: 0,
      }}
    >
      {adding ? <span style={{ fontSize: 16, lineHeight: 1 }}>×</span> : <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
    </button>
  );

  return (
    <Card tile>
      <TileLabel action={addButton}>Escalations</TileLabel>

      {adding && (
        <div style={{ display: "flex", gap: 8, flexShrink: 0, ...TILE_ROW_STYLE }}>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="What needs attention?"
            style={{ ...TEXT_INPUT_STYLE, flex: 1 }}
          />
          <button
            onClick={submit}
            disabled={saving || !text.trim()}
            style={{ ...PRIMARY_BUTTON_STYLE, cursor: saving ? "wait" : "pointer", opacity: saving || !text.trim() ? 0.6 : 1 }}
          >
            Add
          </button>
        </div>
      )}

      {/* Scrolls internally past --tile-height rather than growing the tile
          — see the Card `tile` comment. */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {escalations.length === 0 ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: "10px 0 0" }}>Nothing escalated.</p>
        ) : (
          escalations.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, ...TILE_ROW_STYLE }}>
              <button
                onClick={() => onClose(e.id)}
                disabled={busyIds.has(e.id)}
                aria-label={`Close: ${e.text}`}
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
                  cursor: busyIds.has(e.id) ? "wait" : "pointer",
                  color: t.edge2,
                }}
              >
                <Circle size={17} strokeWidth={1.75} />
              </button>
              <div style={{ flex: 1, fontSize: 14, lineHeight: 1.5, color: t.edge }}>
                {e.text}
                {e.site_name && <span style={{ display: "block", fontSize: 11, color: t.edge2, marginTop: 2 }}>{e.site_name}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

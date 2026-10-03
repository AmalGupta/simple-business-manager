import { useState } from "react";
import { t } from "../../theme.js";
import { BackLink } from "../../components/BackLink.jsx";
import { Card } from "../../components/Card.jsx";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";
import { MY_PAGE_SECTIONS, MY_PAGE_VIEW_LABELS } from "../../lib/my-page-views.js";

const MAX_NAME = 40;
const MAX_VIEWS = 12;
const sectionHead = { fontFamily: t.label, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: t.edge, padding: "12px 0 4px" };

/* SBM-106 — create or edit one of the admin's pages. Views are ticked in the
   order they should appear; the order badges show that. */
export function MyPageBuilderView({ page, onBack, onSave, onDelete }) {
  const [name, setName] = useState(page?.name ?? "");
  const [views, setViews] = useState(page?.views ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = (id) => setViews((v) => (v.includes(id) ? v.filter((x) => x !== id) : v.length < MAX_VIEWS ? [...v, id] : v));

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the page a name.");
    if (trimmed.length > MAX_NAME) return setError(`Keep the name under ${MAX_NAME} characters.`);
    if (views.length === 0) return setError("Pick at least one view.");
    setError("");
    setSaving(true);
    try {
      await onSave({ id: page?.id ?? `p${Date.now().toString(36)}`, name: trimmed, views });
    } catch (err) {
      setError(err.message || "Couldn’t save — try again.");
      setSaving(false);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1rem" }}>
        {page ? "Edit page" : "New page"}
      </h1>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: "1rem" }}>
        <span style={{ fontFamily: t.label, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: t.edge2 }}>Page name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME + 10} placeholder="e.g. Monday review" style={{ ...TEXT_INPUT_STYLE, minHeight: 44 }} />
      </label>

      <Card style={{ padding: "6px 16px 12px", marginBottom: "1rem" }}>
        {MY_PAGE_SECTIONS.map((section) => (
          <div key={section.key}>
            <div style={sectionHead}>{section.label}</div>
            {section.views.map((id) => {
              const pos = views.indexOf(id);
              return (
                <label key={id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, fontSize: 14, color: t.edge, cursor: "pointer" }}>
                  <input type="checkbox" checked={pos >= 0} onChange={() => toggle(id)} style={{ width: 18, height: 18, margin: 0 }} />
                  <span>{MY_PAGE_VIEW_LABELS[id]}</span>
                  {pos >= 0 && (
                    <span style={{ marginLeft: "auto", fontFamily: t.label, fontSize: 10, fontWeight: 700, color: t.white, background: t.accent, borderRadius: 4, padding: "2px 6px" }}>
                      {pos + 1}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        ))}
      </Card>

      <p style={{ fontSize: 12, color: t.edge2, margin: "0 0 1rem" }}>Only you see your pages. Each view opens as it does in its section.</p>
      {error && <p style={{ fontSize: 13, color: t.signal, margin: "0 0 1rem" }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button type="button" onClick={onBack} disabled={saving} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={saving} style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 44, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save page"}
        </button>
      </div>
      {page && (
        <button type="button" onClick={onDelete} disabled={saving} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, marginTop: 10, width: "100%", color: t.signal }}>
          Delete page
        </button>
      )}
    </div>
  );
}

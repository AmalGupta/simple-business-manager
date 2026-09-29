import { useState } from "react";
import { t } from "../../theme.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";
import { useT } from "../../lib/i18n.jsx";

/* Pick a teammate to hand a piece of work to. Shared by the Assigned work
   cards and the complaint page (where an admin gets "Route to…" wording). */
export function PassOnPicker({ roster, selfId, busy, onPick, onCancel, placeholder, actionLabel }) {
  const tr = useT();
  const [to, setTo] = useState("");
  const options = roster.filter((s) => s.id !== selfId);
  const prompt = placeholder ?? tr("passOnTo");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
      <select
        aria-label={prompt}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{ ...TEXT_INPUT_STYLE, gridColumn: "1 / -1", minHeight: 44 }}
      >
        <option value="">{prompt}</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!to || busy}
        onClick={() => onPick(to)}
        style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, background: t.accent, color: t.white, border: "none", opacity: !to || busy ? 0.5 : 1 }}
      >
        {actionLabel ?? tr("passOn")}
      </button>
      <button type="button" onClick={onCancel} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
        {tr("cancel")}
      </button>
    </div>
  );
}

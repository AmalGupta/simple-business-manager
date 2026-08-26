import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";

/* ------------------------------------------------------------------
   Login gate — name + short PIN. Submit is owned by the parent so the
   dashboard can paint home chrome immediately (optimistic handoff) while
   POST /api/login is still in flight. See Dashboard.jsx.
   ------------------------------------------------------------------ */
export function LoginScreen({ onSubmit, error = "", initialName = "" }) {
  const [name, setName] = useState(initialName);
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !pin.trim()) {
      setLocalError("Enter your name and PIN.");
      return;
    }
    setLocalError("");
    onSubmit(name.trim(), pin.trim());
  };

  const shownError = localError || error;

  return (
    <div style={{ background: t.pane, minHeight: "100vh", fontFamily: t.body, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.25rem" }}>
      <form
        onSubmit={submit}
        style={{ width: "100%", maxWidth: 340, background: t.white, border: `1px solid ${t.frost}`, borderRadius: t.radiusCard, padding: "1.75rem 1.5rem", display: "flex", flexDirection: "column", gap: 12 }}
      >
        <span style={{ fontFamily: t.display, fontSize: 18, fontWeight: 500, color: t.edge, marginBottom: 4 }}>
          Simple Business Manager
        </span>
        <input
          autoFocus
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        {shownError && <span style={{ fontSize: 12, color: t.signal }}>{shownError}</span>}
        <button type="submit" style={PRIMARY_BUTTON_STYLE}>
          Log in
        </button>
      </form>
    </div>
  );
}

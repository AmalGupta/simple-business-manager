import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";

/* ------------------------------------------------------------------
   Login gate — name + short PIN. Submits as a real form POST so the
   browser applies the HttpOnly session cookie (fetch Set-Cookie is not
   reliable). See handleLogin in src/handlers/auth.ts.
   ------------------------------------------------------------------ */
export function LoginScreen({ error = "", initialName = "" }) {
  const [name, setName] = useState(initialName);
  const [pin, setPin] = useState("");
  const [localError, setLocalError] = useState("");

  const submit = (e) => {
    if (!name.trim() || !pin.trim()) {
      e.preventDefault();
      setLocalError("Enter your name and PIN.");
      return;
    }
    setLocalError("");
  };

  const shownError = localError || error;

  return (
    <div style={{ background: t.pane, minHeight: "100vh", fontFamily: t.body, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.25rem" }}>
      <form
        action="/api/login"
        method="POST"
        onSubmit={submit}
        style={{ width: "100%", maxWidth: 340, background: t.white, border: `1px solid ${t.frost}`, borderRadius: t.radiusCard, padding: "1.75rem 1.5rem", display: "flex", flexDirection: "column", gap: 12 }}
      >
        <span style={{ fontFamily: t.display, fontSize: 18, fontWeight: 500, color: t.edge, marginBottom: 4 }}>
          Simple Business Manager
        </span>
        <input
          autoFocus
          name="name"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={TEXT_INPUT_STYLE}
        />
        <input
          name="pin"
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

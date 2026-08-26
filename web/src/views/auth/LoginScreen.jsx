import { useState } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { postLogin } from "../../lib/api.js";

/* ------------------------------------------------------------------
   Login gate — name + short PIN, session cookie set by POST /api/login.
   See src/lib/auth.ts. Shown in place of the whole dashboard until
   GET /api/me succeeds.
   ------------------------------------------------------------------ */
export function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !pin.trim()) {
      setError("Enter your name and PIN.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const me = await postLogin(name.trim(), pin.trim());
      onLogin(me);
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

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
        {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}
        <button type="submit" disabled={submitting} style={{ ...PRIMARY_BUTTON_STYLE, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}

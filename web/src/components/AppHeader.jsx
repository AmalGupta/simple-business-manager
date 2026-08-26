import { t } from "../theme.js";
import { AccountMenu } from "./account/AccountMenu.jsx";

/* The dark header bar shown at the top of every top-level view (admin home,
   staff-home, and sites-directory when a staff session lands there) — the
   wordmark plus the account menu, with an optional extra item next to the
   menu (the admin home's date readout) and optional content below the
   header itself, inside the same colored band (the admin home's
   StreakWall). Consolidated from three near-identical inline blocks in
   Dashboard.jsx's view router that had drifted apart only by accident,
   not by design. */
export function AppHeader({ me, onLogout, onResetPin, onUpdatePhone, right, children, hideAccount = false }) {
  return (
    <div style={{ background: t.accent, margin: "-2rem -1.25rem 1.5rem", padding: "1.25rem 1.25rem 1.5rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          ...(children ? { marginBottom: "1.25rem" } : {}),
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 600, color: t.white }}>
          Simple Business Manager
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {right}
          {!hideAccount && me && (
            <AccountMenu me={me} onLogout={onLogout} onResetPin={onResetPin} onUpdatePhone={onUpdatePhone} />
          )}
        </div>
      </header>
      {children}
    </div>
  );
}

import { t } from "../theme.js";
import { AccountMenu } from "./account/AccountMenu.jsx";

/** Fixed height of the admin console bar — the frozen nav sits directly below it. */
export const ADMIN_CONSOLE_HEADER_HEIGHT = 60;

/* The dark header bar shown at the top of every top-level view (admin home,
   staff-home, and sites-directory when a staff session lands there) — the
   wordmark plus the account menu, with an optional extra item next to the
   menu (the admin home's date readout) and optional content below the
   header itself, inside the same colored band (the admin home's
   StreakWall). Consolidated from three near-identical inline blocks in
   Dashboard.jsx's view router that had drifted apart only by accident,
   not by design. */
export function AppHeader({
  me,
  onLogout,
  onResetPin,
  onUpdatePhone,
  customization,
  onCustomizationChange,
  onRequestReport,
  onOpenMaintenanceSiteContact,
  onOpenMaintenanceScopes,
  right,
  children,
  hideAccount = false,
  /** SBM-106 admin console: slim ink bar spanning the window, outside shell's
      padded <main>. The band content (calendar) is not shown — the calendar
      lives on Calls Needing Action, reached from the admin nav. */
  adminConsole = false,
  /** Rendered before the wordmark (admin console: the nav collapse toggle). */
  leading = null,
}) {
  const band = adminConsole ? null : children;
  return (
    <div
      style={{
        background: adminConsole ? t.edge : t.accent,
        margin: adminConsole ? 0 : "-2rem -1.25rem 1.5rem",
        padding: adminConsole ? "0 1.75rem 0 1rem" : "1.25rem 1.25rem 1.5rem",
        ...(adminConsole ? { height: ADMIN_CONSOLE_HEADER_HEIGHT, display: "flex", alignItems: "center" } : {}),
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: adminConsole ? "center" : "baseline",
          ...(adminConsole ? { flex: 1, minWidth: 0 } : {}),
          ...(band ? { marginBottom: "1.25rem" } : {}),
        }}
      >
        <span style={{ display: "inline-flex", alignItems: adminConsole ? "center" : "baseline", gap: 12 }}>
          {leading}
          <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 600, color: t.white }}>
            Simple Business Manager
          </span>
          {adminConsole ? (
            <span
              style={{
                fontFamily: t.label,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              Admin console
            </span>
          ) : null}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {right}
          {!hideAccount && me && (
            <AccountMenu
              me={me}
              onLogout={onLogout}
              onResetPin={onResetPin}
              onUpdatePhone={onUpdatePhone}
              customization={customization}
              onCustomizationChange={onCustomizationChange}
              onRequestReport={onRequestReport}
              onOpenMaintenanceSiteContact={onOpenMaintenanceSiteContact}
              onOpenMaintenanceScopes={onOpenMaintenanceScopes}
            />
          )}
        </div>
      </header>
      {band}
    </div>
  );
}

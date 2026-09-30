import { createContext, useContext } from "react";

/* SBM-81 — view-as scopes. An admin looking at a staff member's bookmark tab
   gets per-component levels (none | read | write) from /api/me `scopes`,
   fetched once at load. Anywhere else (own dashboard, staff session) every
   scope is `write`. The server enforces the same levels (src/lib/scopes.ts);
   this only stops the UI offering what would be refused. */

const ScopesContext = createContext({ viewAsUserId: null, scopes: {} });

export function ScopesProvider({ me, viewAsUserId, children }) {
  const value = {
    viewAsUserId: me?.role === "staff" ? null : viewAsUserId || null,
    scopes: me?.scopes ?? {},
  };
  return <ScopesContext.Provider value={value}>{children}</ScopesContext.Provider>;
}

/** { level, canRead, canWrite, viewAs } for a scope key. Outside view-as → always write. */
export function useScope(key) {
  const { viewAsUserId, scopes } = useContext(ScopesContext);
  if (!viewAsUserId) return { level: "write", canRead: true, canWrite: true, viewAs: false };
  const level = scopes[key] ?? "none";
  return { level, canRead: level !== "none", canWrite: level === "write", viewAs: true };
}

/** Renders children only when the scope is at least `read`; otherwise `fallback`. */
export function ScopeGate({ scope, fallback = null, children }) {
  const { canRead } = useScope(scope);
  return canRead ? children : fallback;
}

/** True while an admin is viewing a staff dashboard and ANY visible scope is below write. */
export function useViewAsReadOnly() {
  const { viewAsUserId, scopes } = useContext(ScopesContext);
  if (!viewAsUserId) return false;
  return Object.values(scopes).some((l) => l !== "write");
}

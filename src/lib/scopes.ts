// SBM-81 — server-side enforcement of view-as scopes (packages/core/src/scopes.ts).
//
// The staff-bookmark tab on the admin home sends `X-SBM-View-As: <staffId>` on
// every request. When that header is present and the session is admin/superadmin,
// the route is looked up in ROUTE_RULES and the actor's effective level must
// meet the route's need, else 403 {error:"read_only"}. Unlisted routes and
// requests without the header are never gated.
//
// This is a guardrail against accidental admin action from a staff screen, not
// a barrier against an admin who deliberately omits the header — the admin's own
// privileges are unchanged.

import { getEffectiveScopes, meetsLevel, scopeForRoute } from "@sbm/core";
import type { Env } from "../index";
import { requireSession } from "./auth";

export const VIEW_AS_HEADER = "X-SBM-View-As";

export async function enforceViewAsScope(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const viewAs = request.headers.get(VIEW_AS_HEADER)?.trim();
  if (!viewAs) return null;

  const rule = scopeForRoute(request.method, pathname);
  if (!rule) return null;

  const session = await requireSession(request, env);
  // Staff are never gated; an unauthenticated request is left to the handler's own 401.
  if (!session || session.user_role === "staff") return null;
  // Viewing yourself is not view-as.
  if (viewAs === session.user_id) return null;

  const scopes = await getEffectiveScopes(env.DB, session.user_id, session.user_role);
  if (meetsLevel(scopes[rule.key] ?? "none", rule.need)) return null;

  return new Response(JSON.stringify({ error: "read_only", scope: rule.key }), {
    status: 403,
    headers: { "content-type": "application/json" },
  });
}

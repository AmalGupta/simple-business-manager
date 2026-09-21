// Optional ?for_user_id= scoping so an admin can load another staff member's
// staff-home data (home bookmark tabs). Staff sessions always scope to self.

import { getUserById, type SessionWithUser } from "@sbm/core";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Resolve the user id to scope list/summary queries to.
 * - staff → always their own id
 * - admin/superadmin → optional ?for_user_id= (must be an existing staff user), else null (global)
 * Returns a Response on validation failure.
 */
export async function resolveForUserId(
  request: Request,
  env: Env,
  session: SessionWithUser
): Promise<string | null | Response> {
  if (session.user_role === "staff") return session.user_id;

  const raw = new URL(request.url).searchParams.get("for_user_id")?.trim() ?? "";
  if (!raw) return null;

  const user = await getUserById(env.DB, raw);
  if (!user || user.role !== "staff") return json({ error: "invalid for_user_id" }, 400);
  return user.id;
}

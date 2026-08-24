// POST /api/login, POST /api/logout, GET /api/me — session-cookie auth for
// the dashboard SPA, additive to the existing X-SBM-Key gate (see
// src/lib/auth.ts header comment). POST /api/admin/users and
// POST /api/admin/users/:id/revoke-sessions are the admin-seeding path,
// gated by X-SBM-Key only — see plan's "Admin seeding" note for why.

import {
  createSession,
  createUser,
  getUserByName,
  getUserById,
  incrementFailedLogin,
  resetFailedLogin,
  revokeAllSessionsForUser,
  revokeSession,
  updateUserPin,
} from "@sbm/core";
import {
  clearSessionCookieHeader,
  hashPin,
  hashToken,
  newSessionToken,
  requireSession,
  sessionCookieHeader,
  sessionExpiryFromNow,
  verifyPin,
} from "../lib/auth";
import type { Env } from "../index";

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const pin = typeof record.pin === "string" ? record.pin : "";
  if (!name || !pin) return json({ error: "name and pin are required" }, 400);

  const user = await getUserByName(env.DB, name);
  if (!user || user.disabled_at) return json({ error: "invalid name or pin" }, 401);

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return json({ error: "account locked — try again later" }, 423);
  }

  const valid = await verifyPin(env, pin, user.pin_hash, user.pin_salt);
  if (!valid) {
    await incrementFailedLogin(env.DB, user.id);
    return json({ error: "invalid name or pin" }, 401);
  }

  await resetFailedLogin(env.DB, user.id);

  const token = newSessionToken();
  const tokenHash = await hashToken(token);
  await createSession(env.DB, user.id, tokenHash, sessionExpiryFromNow());

  return json({ id: user.id, name: user.name }, 200, { "set-cookie": sessionCookieHeader(request, token) });
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (session) {
    const cookie = request.headers.get("Cookie") ?? "";
    const match = cookie.match(/sbm_session=([^;]+)/);
    if (match) await revokeSession(env.DB, await hashToken(match[1]));
  }
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookieHeader(request) });
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  return json({ id: session.user_id, name: session.user_name });
}

/** Self-service PIN reset — session-gated, requires the current PIN (not the admin key). */
export async function handleResetPin(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const currentPin = typeof record.current_pin === "string" ? record.current_pin : "";
  const newPin = typeof record.new_pin === "string" ? record.new_pin : "";
  if (!/^\d{4,6}$/.test(newPin)) return json({ error: "new pin must be 4-6 digits" }, 400);

  const user = await getUserById(env.DB, session.user_id);
  if (!user) return json({ error: "not found" }, 404);

  const valid = await verifyPin(env, currentPin, user.pin_hash, user.pin_salt);
  if (!valid) return json({ error: "current pin is incorrect" }, 401);

  const { hash, salt } = await hashPin(env, newPin);
  await updateUserPin(env.DB, user.id, hash, salt);
  return json({ ok: true });
}

/** Admin bootstrap — gated by X-SBM-Key only (see module header). */
export async function handleAdminCreateUser(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const pin = typeof record.pin === "string" ? record.pin : "";
  if (!name || !/^\d{4,6}$/.test(pin)) {
    return json({ error: "name is required and pin must be 4-6 digits" }, 400);
  }

  if (await getUserByName(env.DB, name)) return json({ error: "a user with that name already exists" }, 409);

  const { hash, salt } = await hashPin(env, pin);
  const user = await createUser(env.DB, name, hash, salt);
  return json({ id: user.id, name: user.name }, 201);
}

/** Lost/compromised device — the escape hatch when a PIN can't be trusted anymore. */
export async function handleAdminRevokeSessions(env: Env, userId: string): Promise<Response> {
  const user = await getUserById(env.DB, userId);
  if (!user) return json({ error: "not found" }, 404);
  await revokeAllSessionsForUser(env.DB, userId);
  return json({ ok: true });
}

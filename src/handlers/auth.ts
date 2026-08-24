// POST /api/login, POST /api/logout, GET /api/me — session-cookie auth for
// the dashboard SPA, additive to the existing X-SBM-Key gate (see
// src/lib/auth.ts header comment). POST /api/admin/users and
// POST /api/admin/users/:id/revoke-sessions are the admin-seeding path,
// gated by X-SBM-Key only — see plan's "Admin seeding" note for why.
//
// GET/POST /api/staff, PATCH /api/staff/:id, and POST /api/staff/:id/reset-pin
// (migration 0011) are the day-to-day staff-management path used from the
// dashboard's Staff page — session-gated, admin/superadmin only. Distinct
// from the X-SBM-Key bootstrap above: this is how Piyush (admin) manages the
// staff roster without ever needing the shared dev secret.

import {
  createSession,
  createUser,
  getUserByName,
  getUserById,
  incrementFailedLogin,
  listStaffAndSelf,
  listStaffRoster,
  resetFailedLogin,
  revokeAllSessionsForUser,
  revokeSession,
  updateUserPhone,
  updateUserPin,
  type SessionWithUser,
  type User,
} from "@sbm/core";
import {
  clearSessionCookieHeader,
  decryptPin,
  encryptPin,
  generateRandomPin,
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

/** admin/superadmin only — every new staff-management route needs this. Returns the session on success, or the Response to short-circuit with otherwise. */
async function requireAdmin(request: Request, env: Env): Promise<SessionWithUser | Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff") return json({ error: "forbidden" }, 403);
  return session;
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

  return json(
    { id: user.id, name: user.name, role: user.role },
    200,
    { "set-cookie": sessionCookieHeader(request, token) }
  );
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
  return json({ id: session.user_id, name: session.user_name, role: session.user_role });
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
  const pinEncrypted = await encryptPin(env, newPin);
  await updateUserPin(env.DB, user.id, hash, salt, pinEncrypted);
  return json({ ok: true });
}

const VALID_ROLES = new Set(["staff", "admin", "superadmin"]);

/** Admin bootstrap — gated by X-SBM-Key only (see module header). Also how a superadmin account (e.g. the developer's own) gets created — there's no self-service UI for that role. */
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
  const role = typeof record.role === "string" && VALID_ROLES.has(record.role) ? (record.role as User["role"]) : "staff";
  const phone = typeof record.phone === "string" && record.phone.trim() ? record.phone.trim() : null;
  if (!name || !/^\d{4,6}$/.test(pin)) {
    return json({ error: "name is required and pin must be 4-6 digits" }, 400);
  }

  if (await getUserByName(env.DB, name)) return json({ error: "a user with that name already exists" }, 409);

  const { hash, salt } = await hashPin(env, pin);
  const pinEncrypted = await encryptPin(env, pin);
  const user = await createUser(env.DB, name, hash, salt, role, phone, pinEncrypted);
  return json({ id: user.id, name: user.name, role: user.role }, 201);
}

/** Lost/compromised device — the escape hatch when a PIN can't be trusted anymore. */
export async function handleAdminRevokeSessions(env: Env, userId: string): Promise<Response> {
  const user = await getUserById(env.DB, userId);
  if (!user) return json({ error: "not found" }, 404);
  await revokeAllSessionsForUser(env.DB, userId);
  return json({ ok: true });
}

/** GET /api/staff — the Staff page's data source: every staff account plus the requesting admin/superadmin's own row, PIN decrypted inline (null if not recoverable — see docs "PIN visibility" decision). */
export async function handleListStaff(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const users = await listStaffAndSelf(env.DB, gate.user_id);
  const rows = await Promise.all(
    users.map(async (u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      pin: u.pin_encrypted ? await decryptPin(env, u.pin_encrypted) : null,
      is_self: u.id === gate.user_id,
    }))
  );
  return json(rows);
}

/**
 * GET /api/staff/roster — the "assign team member" dropdown's data source.
 * `staff` accounts only (no admin/superadmin, no self-inclusion) and no PIN
 * decryption, unlike GET /api/staff above: the dropdown never shows a PIN,
 * and decrypting every row on every modal open was making it slow to open
 * for no reason.
 */
export async function handleListStaffRoster(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  return json(await listStaffRoster(env.DB));
}

/** POST /api/staff — admin adds a new staff member; PIN is generated server-side and returned once (also stored for later viewing via GET /api/staff). */
export async function handleCreateStaff(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const phone = typeof record.phone === "string" && record.phone.trim() ? record.phone.trim() : null;
  if (!name) return json({ error: "name is required" }, 400);
  if (await getUserByName(env.DB, name)) return json({ error: "a user with that name already exists" }, 409);

  const pin = generateRandomPin();
  const { hash, salt } = await hashPin(env, pin);
  const pinEncrypted = await encryptPin(env, pin);
  const user = await createUser(env.DB, name, hash, salt, "staff", phone, pinEncrypted);
  return json({ id: user.id, name: user.name, phone: user.phone, role: user.role, pin }, 201);
}

/** PATCH /api/staff/:id — admin editing a staff member's phone (e.g. backfilling it so site-assignment auto-fill has something to show). */
export async function handleUpdateStaffPhone(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const phone = typeof record.phone === "string" && record.phone.trim() ? record.phone.trim() : null;

  const user = await getUserById(env.DB, id);
  if (!user) return json({ error: "not found" }, 404);

  await updateUserPhone(env.DB, id, phone);
  return json({ id, phone });
}

/** POST /api/staff/:id/reset-pin — new PIN, existing sessions revoked (same lost/compromised-device reasoning as handleAdminRevokeSessions). */
export async function handleResetStaffPin(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const user = await getUserById(env.DB, id);
  if (!user) return json({ error: "not found" }, 404);

  const pin = generateRandomPin();
  const { hash, salt } = await hashPin(env, pin);
  const pinEncrypted = await encryptPin(env, pin);
  await updateUserPin(env.DB, id, hash, salt, pinEncrypted);
  await revokeAllSessionsForUser(env.DB, id);
  return json({ pin });
}

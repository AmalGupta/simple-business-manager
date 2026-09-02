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
  readSessionToken,
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

function loginFailedRedirect(name: string): Response {
  const qs = new URLSearchParams({ login_error: "1" });
  if (name) qs.set("name", name);
  return new Response(null, {
    status: 303,
    headers: { Location: `/?${qs.toString()}` },
  });
}

async function establishSession(request: Request, env: Env, userId: string): Promise<{ token: string; clearCookie: string; setCookie: string }> {
  const existingToken = readSessionToken(request);
  if (existingToken) await revokeSession(env.DB, await hashToken(existingToken));

  const token = newSessionToken();
  const tokenHash = await hashToken(token);
  await createSession(env.DB, userId, tokenHash, sessionExpiryFromNow());

  return {
    token,
    clearCookie: clearSessionCookieHeader(request),
    setCookie: sessionCookieHeader(request, token),
  };
}

/** admin/superadmin only — every new staff-management route needs this. Returns the session on success, or the Response to short-circuit with otherwise. */
async function requireAdmin(request: Request, env: Env): Promise<SessionWithUser | Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff") return json({ error: "forbidden" }, 403);
  return session;
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  const isForm =
    contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");

  let name = "";
  let pin = "";

  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    name = typeof record.name === "string" ? record.name.trim() : "";
    pin = typeof record.pin === "string" ? record.pin : "";
  } else if (isForm) {
    const form = await request.formData();
    name = String(form.get("name") ?? "").trim();
    pin = String(form.get("pin") ?? "");
  } else {
    return json({ error: "unsupported content type" }, 415);
  }

  if (!name || !pin) {
    if (isForm) return loginFailedRedirect(name);
    return json({ error: "name and pin are required" }, 400);
  }

  const user = await getUserByName(env.DB, name);
  if (!user || user.disabled_at) {
    if (isForm) return loginFailedRedirect(name);
    return json({ error: "invalid name or pin" }, 401);
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    if (isForm) return loginFailedRedirect(name);
    return json({ error: "account locked — try again later" }, 423);
  }

  const valid = await verifyPin(env, pin, user.pin_hash, user.pin_salt);
  if (!valid) {
    await incrementFailedLogin(env.DB, user.id);
    if (isForm) return loginFailedRedirect(name);
    return json({ error: "invalid name or pin" }, 401);
  }

  await resetFailedLogin(env.DB, user.id);

  const session = await establishSession(request, env, user.id);

  if (isForm) {
    const headers = new Headers({ Location: "/" });
    headers.append("set-cookie", session.clearCookie);
    headers.append("set-cookie", session.setCookie);
    return new Response(null, { status: 303, headers });
  }

  return json(
    { id: user.id, name: user.name, role: user.role, phone: user.phone },
    200,
    { "set-cookie": session.setCookie }
  );
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = readSessionToken(request);
  if (token) await revokeSession(env.DB, await hashToken(token));
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookieHeader(request) });
}

/** Browser navigation logout — Set-Cookie on a document navigation is more reliable than fetch(). */
export async function handleLogoutRedirect(request: Request, env: Env): Promise<Response> {
  const token = readSessionToken(request);
  if (token) await revokeSession(env.DB, await hashToken(token));
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "set-cookie": clearSessionCookieHeader(request) },
  });
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  return json({ id: session.user_id, name: session.user_name, role: session.user_role, phone: session.user_phone });
}

/**
 * Self-service phone update — session-gated, any role. Unlike the PIN reset
 * below this needs no current-value confirmation (a phone number isn't a
 * credential); it's the "Update phone" item in AccountMenu. Writes straight
 * to users.phone, which listSiteTeamMembers and the assign-team roster both
 * read live from, so this is the only place a phone number needs updating.
 */
export async function handleUpdateMyPhone(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const phone = typeof record.phone === "string" && record.phone.trim() ? record.phone.trim() : null;

  await updateUserPhone(env.DB, session.user_id, phone);
  return json({ phone });
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
/**
 * Session required, but not admin-only — unlike every other staff-management
 * route. Found live while testing migration 0013's staff handoff flow: a
 * staff member completing their own stage needs this same lean roster
 * (id/name/phone, no PIN) to pick who the next stage goes to, and the
 * narrow handoff permission (isUserActiveOnSiteTasks) already limits what
 * they can actually do with a name from this list.
 */
export async function handleListStaffRoster(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
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
/**
 * Optional `{ pin }` in the body picks a specific PIN instead of generating
 * a random one — always computed here against env.PIN_PEPPER/
 * PIN_ENCRYPTION_KEY, never by hand against a local copy of those secrets,
 * since a hash computed with the wrong pepper silently fails to verify.
 */
export async function handleResetStaffPin(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const user = await getUserById(env.DB, id);
  if (!user) return json({ error: "not found" }, 404);

  let requestedPin: string | undefined;
  try {
    const body = (await request.json()) as { pin?: unknown };
    if (typeof body?.pin === "string") requestedPin = body.pin;
  } catch {
    // no body / not JSON — fall through to a generated PIN
  }
  if (requestedPin !== undefined && !/^\d{4,6}$/.test(requestedPin)) {
    return json({ error: "pin must be 4-6 digits" }, 400);
  }

  const pin = requestedPin ?? generateRandomPin();
  const { hash, salt } = await hashPin(env, pin);
  const pinEncrypted = await encryptPin(env, pin);
  await updateUserPin(env.DB, id, hash, salt, pinEncrypted);
  await revokeAllSessionsForUser(env.DB, id);
  return json({ pin });
}

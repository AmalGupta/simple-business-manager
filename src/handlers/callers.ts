// GET/POST /api/callers, PATCH /api/callers/:id — Callers Directory
// management (migration 0021). Admin/superadmin only, session-cookie
// gated exactly like GET/POST /api/staff and PATCH /api/staff/:id (see
// src/handlers/auth.ts) — not the X-SBM-Key pattern used by /api/sites*.

import {
  createCaller,
  listCallers,
  countCallers,
  countCallersByCategory,
  countCallersByBucket,
  updateCaller,
  getCallerById,
  listCallerAliases,
  addCallerAlias,
  deleteCallerAlias,
  createUser,
  getUserByName,
  getUserById,
  updateUserName,
  updateUserPin,
  updateUserPhone,
  revokeAllSessionsForUser,
  CALLER_CATEGORIES,
  type CallerBucket,
  type CallerCategory,
} from "@sbm/core";
import { requireAdmin } from "./auth";
import { decryptPin, encryptPin, generateRandomPin, hashPin, normalizePin } from "../lib/auth";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const VALID_CATEGORIES = new Set<CallerCategory>(CALLER_CATEGORIES);
const VALID_BUCKETS = new Set<CallerBucket>(["saved", "unsaved", "spam", "staff"]);

function parseCategory(value: unknown): CallerCategory | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value === "string" && VALID_CATEGORIES.has(value as CallerCategory)) return value as CallerCategory;
  return null; // present but invalid
}

function parseBucket(value: string | null): CallerBucket | undefined | null {
  if (!value) return undefined;
  if (VALID_BUCKETS.has(value as CallerBucket)) return value as CallerBucket;
  return null;
}

/** Cap on one page of callers — the directory is a ~3.3k-row phone-contacts import. */
const CALLERS_MAX_LIMIT = 200;
/** Contacts directory grid pagination (unsaved tab can be large). */
const CONTACTS_DIRECTORY_MAX_LIMIT = 500;

function parsePositiveInt(value: string | null, max: number): number | null | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) return null; // present but invalid
  return n;
}

/**
 * GET /api/callers — Callers Directory list and category counts.
 *
 * `?category=` filters as before. `?bucket=saved|unsaved|spam|staff` drives the
 * Contacts directory tabs (saved = named contacts, unsaved = phone-only labels,
 * staff = category staff with linked sites).
 * `?siteId=` narrows saved/staff rows linked to one site via caller_sites.
 * `?linked_sites=1` on Saved/Staff: only contacts with any site link.
 * `?include_linked_sites=1`: hydrate each row's linked_sites (Contacts directory Sites column).
 * `?q=` (substring on name or phone) and `?limit=`/`?offset=` were added
 * for the site-contacts picker, which can't load the whole directory.
 */
export async function handleListCallers(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const url = new URL(request.url);
  const categoryParam = url.searchParams.get("category");
  let category: CallerCategory | undefined;
  if (categoryParam) {
    const parsed = parseCategory(categoryParam);
    if (parsed === null || parsed === undefined) {
      return json({ error: "category must be one of spam, client, family, staff" }, 400);
    }
    category = parsed;
  }

  const bucket = parseBucket(url.searchParams.get("bucket"));
  if (url.searchParams.has("bucket") && bucket === null) {
    return json({ error: "bucket must be one of saved, unsaved, spam, staff" }, 400);
  }

  const siteId = url.searchParams.get("siteId")?.trim() || undefined;
  const linkedSitesOnly = url.searchParams.get("linked_sites") === "1";
  const includeLinkedSites = url.searchParams.get("include_linked_sites") === "1";
  const includeAliases = url.searchParams.get("include_aliases") === "1";

  const q = url.searchParams.get("q")?.trim() || undefined;

  const maxLimit = bucket ? CONTACTS_DIRECTORY_MAX_LIMIT : CALLERS_MAX_LIMIT;
  const limit = parsePositiveInt(url.searchParams.get("limit"), maxLimit);
  if (limit === null) return json({ error: `limit must be an integer between 0 and ${maxLimit}` }, 400);
  const offset = parsePositiveInt(url.searchParams.get("offset"), Number.MAX_SAFE_INTEGER);
  if (offset === null) return json({ error: "offset must be a non-negative integer" }, 400);

  const opts = {
    category,
    ...(bucket ? { bucket } : {}),
    siteId,
    ...(linkedSitesOnly ? { linkedSitesOnly: true } : {}),
    ...(includeLinkedSites ? { includeLinkedSites: true } : {}),
    ...(includeAliases ? { includeAliases: true } : {}),
    q,
    limit,
    offset,
  };
  /* Bucket counts are for the Contacts directory tabs. Category counts are
     unused by pickers. Associate contacts / Add people only need items+total
     — skipping the full-table scans keeps those modals snappy on UAT (~4k). */
  const [items, total, counts, bucket_counts] = await Promise.all([
    listCallers(env.DB, opts),
    countCallers(env.DB, opts),
    bucket
      ? countCallersByCategory(env.DB)
      : Promise.resolve({ client: 0, staff: 0, family: 0, spam: 0 }),
    bucket
      ? countCallersByBucket(env.DB)
      : Promise.resolve({ saved: 0, unsaved: 0, spam: 0, staff: 0 }),
  ]);
  return json({ items, total, counts, bucket_counts });
}

/** POST /api/callers — admin adds a caller directly (e.g. seeding a Family/Spam number). */
export async function handleCreateCaller(request: Request, env: Env): Promise<Response> {
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
  const staffUserId =
    typeof record.staff_user_id === "string" && record.staff_user_id.trim()
      ? record.staff_user_id.trim()
      : null;

  if (!name) return json({ error: "name is required" }, 400);

  const category = parseCategory(record.category ?? "client");
  if (category === null) return json({ error: "category must be one of family, staff, client, spam" }, 400);

  try {
    const caller = await createCaller(env.DB, {
      name,
      phone,
      category: category ?? "client",
      staffUserId,
    });
    return json(caller, 201);
  } catch (err) {
    // UNIQUE(phone) conflict — see callers.phone in schema.sql.
    if (String(err).includes("UNIQUE")) return json({ error: "a caller with that phone already exists" }, 409);
    return json({ error: `create failed: ${String(err)}` }, 500);
  }
}

/** PATCH /api/callers/:id — admin edits a caller's name/phone/category, or links/unlinks a staff-roster member. */
export async function handleUpdateCaller(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const patch: Partial<{
    name: string;
    phone: string | null;
    category: CallerCategory;
    staff_user_id: string | null;
  }> = {};

  if ("name" in record) {
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return json({ error: "name cannot be empty" }, 400);
    patch.name = name;
  }
  if ("phone" in record) {
    patch.phone = typeof record.phone === "string" && record.phone.trim() ? record.phone.trim() : null;
  }
  if ("category" in record) {
    const category = parseCategory(record.category);
    if (category === null) return json({ error: "category must be one of family, staff, client, spam" }, 400);
    if (category !== undefined) patch.category = category;
  }
  if ("staff_user_id" in record) {
    patch.staff_user_id =
      typeof record.staff_user_id === "string" && record.staff_user_id.trim()
        ? record.staff_user_id.trim()
        : null;
  }

  try {
    const caller = await updateCaller(env.DB, id, patch);
    if (!caller) return json({ error: "not found" }, 404);
    return json(caller);
  } catch (err) {
    if (String(err).includes("UNIQUE")) return json({ error: "a caller with that phone already exists" }, 409);
    return json({ error: `update failed: ${String(err)}` }, 500);
  }
}

export interface PromoteStaffResult {
  caller_id: string;
  contact_name: string;
  alias: string;
  login_name: string;
  pin: string;
  user_id: string;
  created: boolean;
  already_linked: boolean;
  /** True when we attached the contact to a pre-existing staff login (same name). */
  linked_existing: boolean;
}

async function pinForUser(env: Env, user: { id: string; pin_encrypted: string | null }): Promise<string> {
  const decrypted = user.pin_encrypted ? await decryptPin(env, user.pin_encrypted) : null;
  const cleaned = decrypted ? normalizePin(decrypted) : "";
  if (cleaned && /^\d{4,6}$/.test(cleaned)) {
    if (cleaned !== decrypted) {
      const { hash, salt } = await hashPin(env, cleaned);
      const pinEncrypted = await encryptPin(env, cleaned);
      await updateUserPin(env.DB, user.id, hash, salt, pinEncrypted);
    }
    return cleaned;
  }
  const pin = normalizePin(generateRandomPin());
  const { hash, salt } = await hashPin(env, pin);
  const pinEncrypted = await encryptPin(env, pin);
  await updateUserPin(env.DB, user.id, hash, salt, pinEncrypted);
  return pin;
}

/**
 * Ensure a contact marked Staff has a login account. Creates a staff user +
 * PIN when missing; links an existing staff user with the same name when
 * present. Always sets category=staff and callers.staff_user_id.
 */
export async function promoteCallerToStaff(env: Env, callerId: string): Promise<PromoteStaffResult | Response> {
  const caller = await getCallerById(env.DB, callerId);
  if (!caller) return json({ error: "not found" }, 404);

  const aliases = await listCallerAliases(env.DB, callerId);
  const aliasPreview = aliases[0]?.alias?.trim() || caller.name;

  if (caller.staff_user_id) {
    const user = await getUserById(env.DB, caller.staff_user_id);
    if (!user) return json({ error: "linked staff account missing" }, 500);
    if (caller.category !== "staff") {
      await updateCaller(env.DB, callerId, { category: "staff" });
    }
    const pin = await pinForUser(env, user);
    return {
      caller_id: callerId,
      contact_name: caller.name,
      alias: aliasPreview,
      login_name: user.name,
      pin,
      user_id: user.id,
      created: false,
      already_linked: true,
      linked_existing: true,
    };
  }

  const preferredName = caller.name.trim();
  const existing = preferredName ? await getUserByName(env.DB, preferredName) : null;
  if (existing && existing.role === "staff") {
    await updateCaller(env.DB, callerId, { category: "staff", staff_user_id: existing.id });
    if (!existing.phone && caller.phone) {
      await updateUserPhone(env.DB, existing.id, caller.phone);
    }
    const pin = await pinForUser(env, existing);
    return {
      caller_id: callerId,
      contact_name: caller.name,
      alias: aliasPreview,
      login_name: existing.name,
      pin,
      user_id: existing.id,
      created: false,
      already_linked: false,
      linked_existing: true,
    };
  }

  let loginName = preferredName || "Staff";
  if (existing && existing.role !== "staff") {
    loginName = `${preferredName} (staff)`;
    let n = 2;
    while (await getUserByName(env.DB, loginName)) {
      loginName = `${preferredName} (staff ${n})`;
      n += 1;
    }
  }

  const pin = normalizePin(generateRandomPin());
  const { hash, salt } = await hashPin(env, pin);
  const pinEncrypted = await encryptPin(env, pin);
  const user = await createUser(env.DB, loginName, hash, salt, "staff", caller.phone, pinEncrypted);
  await updateCaller(env.DB, callerId, { category: "staff", staff_user_id: user.id });

  return {
    caller_id: callerId,
    contact_name: caller.name,
    alias: aliasPreview,
    login_name: user.name,
    pin,
    user_id: user.id,
    created: true,
    already_linked: false,
    linked_existing: false,
  };
}

/** POST /api/callers/:id/promote-staff — create/link staff login + return PIN for confirm UI. */
export async function handlePromoteCallerStaff(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const result = await promoteCallerToStaff(env, id);
  if (result instanceof Response) return result;
  return json(result, result.created ? 201 : 200);
}

/**
 * POST /api/callers/:id/confirm-staff-promotion — apply editable login name / PIN / alias
 * after the promote notification. Staff can then log in with the confirmed PIN.
 *
 * If the chosen login_name already belongs to another staff account, re-link
 * this contact to that account and update that account's PIN (instead of 409).
 */
export async function handleConfirmCallerStaffPromotion(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const caller = await getCallerById(env.DB, id);
  if (!caller) return json({ error: "not found" }, 404);
  if (!caller.staff_user_id) {
    return json({ error: "contact is not linked to a staff account — promote first" }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const loginName = typeof record.login_name === "string" ? record.login_name.trim() : "";
  const pin = normalizePin(typeof record.pin === "string" ? record.pin : "");
  const alias = typeof record.alias === "string" ? record.alias.trim() : "";

  if (!loginName) return json({ error: "login_name is required" }, 400);
  if (!/^\d{4,6}$/.test(pin)) return json({ error: "pin must be 4-6 digits" }, 400);

  let user = await getUserById(env.DB, caller.staff_user_id);
  if (!user) return json({ error: "linked staff account missing" }, 500);

  const nameOwner = await getUserByName(env.DB, loginName);
  if (nameOwner && nameOwner.id !== user.id) {
    if (nameOwner.role !== "staff") {
      return json(
        {
          error:
            "that login name is already used by a non-staff account — edit the login name",
        },
        409
      );
    }
    /* Re-link to the existing staff login the admin typed. */
    await updateCaller(env.DB, id, { category: "staff", staff_user_id: nameOwner.id });
    user = nameOwner;
  } else if (user.name !== loginName) {
    try {
      await updateUserName(env.DB, user.id, loginName);
    } catch (err) {
      if (String(err).includes("UNIQUE")) {
        return json({
          error: "a user with that login name already exists — edit the login name",
        }, 409);
      }
      throw err;
    }
  }

  const { hash, salt } = await hashPin(env, pin);
  const pinEncrypted = await encryptPin(env, pin);
  await updateUserPin(env.DB, user.id, hash, salt, pinEncrypted);
  await revokeAllSessionsForUser(env.DB, user.id);

  if (caller.category !== "staff") {
    await updateCaller(env.DB, id, { category: "staff" });
  }

  if (alias) {
    const existingAliases = await listCallerAliases(env.DB, id);
    const hasAlias = existingAliases.some((a) => a.alias.toLowerCase() === alias.toLowerCase());
    if (!hasAlias) {
      try {
        await addCallerAlias(env.DB, id, alias);
      } catch (err) {
        if (!String(err).includes("UNIQUE")) throw err;
      }
    }
  }

  return json({
    ok: true,
    caller_id: id,
    user_id: user.id,
    login_name: user.name === loginName ? loginName : (await getUserById(env.DB, user.id))?.name ?? loginName,
    pin,
    alias: alias || null,
    linked_existing: Boolean(nameOwner && nameOwner.role === "staff"),
  });
}

/** GET /api/callers/:id/aliases — list aliases for one contact. */
export async function handleListCallerAliases(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const caller = await getCallerById(env.DB, id);
  if (!caller) return json({ error: "not found" }, 404);

  const items = await listCallerAliases(env.DB, id);
  return json({ items, staff_user_id: caller.staff_user_id });
}

/** POST /api/callers/:id/aliases — body `{ alias }`. */
export async function handleAddCallerAlias(request: Request, env: Env, id: string): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const alias = typeof record.alias === "string" ? record.alias : "";

  try {
    const row = await addCallerAlias(env.DB, id, alias);
    return json(row, 201);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("caller not found")) return json({ error: "not found" }, 404);
    if (msg.includes("alias cannot be empty")) return json({ error: "alias is required" }, 400);
    if (msg.includes("UNIQUE")) return json({ error: "that alias is already in use" }, 409);
    return json({ error: `create failed: ${msg}` }, 500);
  }
}

/** DELETE /api/callers/:id/aliases/:aliasId */
export async function handleDeleteCallerAlias(
  request: Request,
  env: Env,
  id: string,
  aliasId: string
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  const deleted = await deleteCallerAlias(env.DB, id, aliasId);
  if (!deleted) return json({ error: "not found" }, 404);
  return json({ ok: true });
}

// GET/POST /api/callers, PATCH /api/callers/:id — Callers Directory
// management (migration 0021). Admin/superadmin only, session-cookie
// gated exactly like GET/POST /api/staff and PATCH /api/staff/:id (see
// src/handlers/auth.ts) — not the X-SBM-Key pattern used by /api/sites*.

import {
  createCaller,
  listCallers,
  countCallers,
  countCallersByCategory,
  updateCaller,
  CALLER_CATEGORIES,
  type CallerCategory,
} from "@sbm/core";
import { requireAdmin } from "./auth";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const VALID_CATEGORIES = new Set<CallerCategory>(CALLER_CATEGORIES);

function parseCategory(value: unknown): CallerCategory | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value === "string" && VALID_CATEGORIES.has(value as CallerCategory)) return value as CallerCategory;
  return null; // present but invalid
}

/** Cap on one page of callers — the directory is a ~3.3k-row phone-contacts import. */
const CALLERS_MAX_LIMIT = 200;

function parsePositiveInt(value: string | null, max: number): number | null | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) return null; // present but invalid
  return n;
}

/**
 * GET /api/callers — Callers Directory list and category counts.
 *
 * `?category=` filters as before. `?q=` (substring on name or phone) and
 * `?limit=`/`?offset=` were added for the site-contacts picker, which can't
 * load the whole directory. Both are optional and omitted by the existing
 * Callers Directory screen, which still gets the full category unpaginated —
 * `total` is always the count matching category+q ignoring the page window,
 * so a paginated caller can render "showing N of M".
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

  const q = url.searchParams.get("q")?.trim() || undefined;

  const limit = parsePositiveInt(url.searchParams.get("limit"), CALLERS_MAX_LIMIT);
  if (limit === null) return json({ error: `limit must be an integer between 0 and ${CALLERS_MAX_LIMIT}` }, 400);
  const offset = parsePositiveInt(url.searchParams.get("offset"), Number.MAX_SAFE_INTEGER);
  if (offset === null) return json({ error: "offset must be a non-negative integer" }, 400);

  const opts = { category, q, limit, offset };
  const [items, total, counts] = await Promise.all([
    listCallers(env.DB, opts),
    countCallers(env.DB, opts),
    countCallersByCategory(env.DB),
  ]);
  return json({ items, total, counts });
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
  const staffUserId = typeof record.staff_user_id === "string" && record.staff_user_id.trim() ? record.staff_user_id.trim() : null;

  if (!name) return json({ error: "name is required" }, 400);

  const category = parseCategory(record.category ?? "client");
  if (category === null) return json({ error: "category must be one of family, staff, client, spam" }, 400);

  try {
    const caller = await createCaller(env.DB, { name, phone, category: category ?? "client", staffUserId });
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

  const patch: Partial<{ name: string; phone: string | null; category: CallerCategory; staff_user_id: string | null }> = {};

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
    patch.staff_user_id = typeof record.staff_user_id === "string" && record.staff_user_id.trim() ? record.staff_user_id.trim() : null;
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

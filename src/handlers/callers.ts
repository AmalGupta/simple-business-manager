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
  CALLER_CATEGORIES,
  type CallerBucket,
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
const VALID_BUCKETS = new Set<CallerBucket>(["saved", "unsaved", "spam"]);

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
 * `?category=` filters as before. `?bucket=saved|unsaved|spam` drives the
 * Contacts directory tabs (saved = named contacts, unsaved = phone-only labels).
 * `?siteId=` narrows saved rows linked to one site via caller_sites.
 * `?linked_sites=1` on Saved: only contacts with any site link (paginated total respects this).
 * `?include_linked_sites=1`: hydrate each row's linked_sites (Contacts directory Sites column).
 * site. `?q=` (substring on name or phone) and `?limit=`/`?offset=` were added
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
    return json({ error: "bucket must be one of saved, unsaved, spam" }, 400);
  }

  const siteId = url.searchParams.get("siteId")?.trim() || undefined;
  const linkedSitesOnly = url.searchParams.get("linked_sites") === "1";
  const includeLinkedSites = url.searchParams.get("include_linked_sites") === "1";

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
    q,
    limit,
    offset,
  };
  const [items, total, counts, bucket_counts] = await Promise.all([
    listCallers(env.DB, opts),
    countCallers(env.DB, opts),
    countCallersByCategory(env.DB),
    countCallersByBucket(env.DB),
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

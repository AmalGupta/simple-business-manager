// GET /api/warehouse/stores, GET /api/warehouse/stock, GET/POST
// /api/warehouse/movements, PATCH /api/warehouse/movements/:id/void,
// GET /api/warehouse/item-suggestions, GET/POST /api/warehouse/tools,
// PATCH /api/warehouse/tools/:id/return — the warehouse register
// (migration 0042). Routed the same way as site-tasks.ts: X-SBM-Key gated
// at the router (src/index.ts), session used inside handlers for
// attribution. See migrations/0042_production_warehouse.sql.

import {
  createToolMovement,
  createWarehouseMovement,
  listOpenToolMovements,
  listWarehouseItemSuggestions,
  listWarehouseMovements,
  listWarehouseStock,
  listWarehouseStores,
  returnToolMovement,
  voidWarehouseMovement,
  type ToolMovementLocation,
  type WarehouseMovementKind,
} from "@sbm/core";
import { requireSession } from "../lib/auth";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

const MOVEMENT_KINDS: readonly WarehouseMovementKind[] = ["in", "out", "dispatch", "maintenance"];
const TOOL_LOCATIONS: readonly ToolMovementLocation[] = ["workshop", "site"];

export async function handleGetWarehouseStores(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  return json(await listWarehouseStores(env.DB));
}

export async function handleGetWarehouseStock(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const storeId = new URL(request.url).searchParams.get("store_id");
  return json(await listWarehouseStock(env.DB, storeId));
}

export async function handleGetWarehouseMovements(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const params = new URL(request.url).searchParams;
  const kindParam = params.get("kind");
  const kind = kindParam && MOVEMENT_KINDS.includes(kindParam as WarehouseMovementKind) ? (kindParam as WarehouseMovementKind) : null;
  return json(
    await listWarehouseMovements(env.DB, {
      storeId: params.get("store_id"),
      kind,
      siteId: params.get("site_id"),
      includeVoided: params.get("include_voided") === "1",
      limit: params.get("limit") ? Number(params.get("limit")) : undefined,
    })
  );
}

/** Any session may log a movement — Manglesh is `staff`, and admin needs the same buttons when covering for him. */
export async function handlePostWarehouseMovement(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const storeId = typeof record.store_id === "string" ? record.store_id.trim() : "";
  const kind = typeof record.kind === "string" ? record.kind : "";
  const item = typeof record.item === "string" ? record.item.trim() : "";
  const quantity = typeof record.quantity === "number" ? record.quantity : Number(record.quantity);

  if (!storeId) return json({ error: "store_id is required" }, 400);
  if (!MOVEMENT_KINDS.includes(kind as WarehouseMovementKind)) return json({ error: "invalid kind" }, 400);
  if (!item) return json({ error: "item is required" }, 400);
  if (!Number.isFinite(quantity) || quantity <= 0) return json({ error: "quantity must be a positive number" }, 400);

  const siteId = typeof record.site_id === "string" && record.site_id.trim() ? record.site_id.trim() : null;
  if (kind === "dispatch" && !siteId) return json({ error: "site_id is required for a dispatch" }, 400);

  const movement = await createWarehouseMovement(env.DB, {
    storeId,
    kind: kind as WarehouseMovementKind,
    item,
    quantity,
    unit: typeof record.unit === "string" ? record.unit : null,
    batchNo: typeof record.batch_no === "string" ? record.batch_no : null,
    siteId,
    productionJobId: typeof record.production_job_id === "string" && record.production_job_id.trim() ? record.production_job_id.trim() : null,
    supplier: typeof record.supplier === "string" ? record.supplier : null,
    machineOrArea: typeof record.machine_or_area === "string" ? record.machine_or_area : null,
    note: typeof record.note === "string" ? record.note : null,
    createdByUserId: session.user_id,
  });
  return json(movement, 201);
}

/** Void — never an edit. Anyone logged in may void (same low-friction "mistakes happen" posture as the rest of this ledger); the voided-by attribution stays on the row either way. */
export async function handleVoidWarehouseMovement(request: Request, env: Env, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const updated = await voidWarehouseMovement(env.DB, id, session.user_id);
  if (!updated) return json({ error: "not found or already voided" }, 404);
  return json(updated);
}

export async function handleGetWarehouseItemSuggestions(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const storeId = new URL(request.url).searchParams.get("store_id");
  if (!storeId) return json({ error: "store_id is required" }, 400);
  return json(await listWarehouseItemSuggestions(env.DB, storeId));
}

export async function handleGetOpenToolMovements(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  return json(await listOpenToolMovements(env.DB));
}

export async function handlePostToolMovement(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const toolName = typeof record.tool_name === "string" ? record.tool_name.trim() : "";
  const takenByUserId = typeof record.taken_by_user_id === "string" ? record.taken_by_user_id.trim() : "";
  const location = typeof record.location === "string" ? record.location : "site";
  if (!toolName) return json({ error: "tool_name is required" }, 400);
  if (!takenByUserId) return json({ error: "taken_by_user_id is required" }, 400);
  if (!TOOL_LOCATIONS.includes(location as ToolMovementLocation)) return json({ error: "invalid location" }, 400);

  const movement = await createToolMovement(env.DB, {
    toolName,
    takenByUserId,
    location: location as ToolMovementLocation,
    siteId: typeof record.site_id === "string" && record.site_id.trim() ? record.site_id.trim() : null,
    note: typeof record.note === "string" ? record.note : null,
    createdByUserId: session.user_id,
  });
  return json(movement, 201);
}

export async function handleReturnToolMovement(request: Request, env: Env, id: string): Promise<Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  const updated = await returnToolMovement(env.DB, id);
  if (!updated) return json({ error: "not found" }, 404);
  return json(updated);
}

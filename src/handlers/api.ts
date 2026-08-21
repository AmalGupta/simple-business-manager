// GET /api/calls, GET /api/calls/:id, PATCH /api/todos/:id — Tasks 6-7.
// Shapes match the mock block at the bottom of web/src/Dashboard.jsx exactly.

import { getCallWithTodos, listCallsWithTodos, updateTodo } from "@sbm/core";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleGetCalls(env: Env): Promise<Response> {
  return json(await listCallsWithTodos(env.DB));
}

export async function handleGetCall(env: Env, id: string): Promise<Response> {
  const call = await getCallWithTodos(env.DB, id);
  if (!call) return json({ error: "not found" }, 404);
  return json(call);
}

const TODO_PATCH_KEYS = ["status", "completed_at", "snoozed_until"] as const;

export async function handlePatchTodo(request: Request, env: Env, id: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  if (typeof body !== "object" || body === null) return json({ error: "invalid body" }, 400);

  const patch: Partial<Record<(typeof TODO_PATCH_KEYS)[number], string | null>> = {};
  for (const key of TODO_PATCH_KEYS) {
    if (key in (body as Record<string, unknown>)) {
      patch[key] = (body as Record<string, unknown>)[key] as string | null;
    }
  }

  const updated = await updateTodo(env.DB, id, patch);
  if (!updated) return json({ error: "not found" }, 404);
  return json(updated);
}

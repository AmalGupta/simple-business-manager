// Admin Drive Calls poller — settings + manual "Get latest calls".

import {
  DRIVE_POLL_ENABLED_KEY,
  getDrivePollSettings,
  setAppSetting,
  type SessionWithUser,
} from "@sbm/core";
import { requireSession } from "../lib/auth";
import { pollDriveCalls } from "../lib/drive-calls-poller";
import type { Env } from "../index";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function requireAdmin(request: Request, env: Env): Promise<SessionWithUser | Response> {
  const session = await requireSession(request, env);
  if (!session) return json({ error: "not logged in" }, 401);
  if (session.user_role === "staff") return json({ error: "forbidden" }, 403);
  return session;
}

export async function handleGetDrivePollSettings(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;
  const settings = await getDrivePollSettings(env.DB);
  return json(settings);
}

export async function handlePatchDrivePollSettings(request: Request, env: Env): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (typeof record.enabled !== "boolean") {
    return json({ error: "enabled (boolean) required" }, 400);
  }

  await setAppSetting(env.DB, DRIVE_POLL_ENABLED_KEY, record.enabled ? "1" : "0");
  const settings = await getDrivePollSettings(env.DB);
  return json(settings);
}

/** Manual pull — same batch size as the cron (DRIVE_POLL_BATCH_SIZE). */
export async function handlePostDrivePoll(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const gate = await requireAdmin(request, env);
  if (gate instanceof Response) return gate;

  try {
    const result = await pollDriveCalls(env, ctx, {
      callbackOrigin: new URL(request.url).origin,
    });
    return json(result, 202);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
}

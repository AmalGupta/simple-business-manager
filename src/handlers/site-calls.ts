// GET /api/sites/:id/calls — calls that mention a site, discovering call
// first. Backs "Listen" on the unconfirmed-sites review screen; audio itself
// streams from GET /api/calls/:id/recording. See listSiteCalls.

import { listSiteCalls } from "@sbm/core";
import type { Env } from "../index";

export async function handleGetSiteCalls(env: Env, siteId: string): Promise<Response> {
  const calls = await listSiteCalls(env.DB, siteId);
  return new Response(JSON.stringify(calls), { status: 200, headers: { "content-type": "application/json" } });
}

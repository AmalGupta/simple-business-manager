// GET /api/sites/:id/timeline — the unified activity feed backing the
// vertical timeline on SiteView. See getSiteTimeline in packages/core/src/queries.ts.

import { getSiteTimeline } from "@sbm/core";
import type { Env } from "../index";

export async function handleGetSiteTimeline(env: Env, siteId: string, includeCallDetails: boolean): Promise<Response> {
  const entries = await getSiteTimeline(env.DB, siteId, includeCallDetails);
  return new Response(JSON.stringify(entries), { status: 200, headers: { "content-type": "application/json" } });
}

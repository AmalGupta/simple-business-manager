/**
 * Simple Business Manager — pipeline Worker.
 *
 * Serves the dashboard SPA as static assets (ASSETS binding) and owns the
 * API/upload/webhook routes on the same origin. See docs/SCAFFOLDING.md §1-2
 * and docs/BUILD_BRIEF.md for build order and scope.
 */

import { handleUploadPage, handleUploadPost } from "./handlers/upload";
import { handleSarvamWebhook } from "./handlers/stt-webhook";
import {
  handleCloseEscalation,
  handleGetCall,
  handleGetCalls,
  handleGetEscalations,
  handleGetSites,
  handleGetSitesAttention,
  handlePatchSite,
  handlePatchTodo,
  handlePostEscalation,
  handlePostSitesBackfill,
} from "./handlers/api";

export interface Env {
  ENVIRONMENT: string;
  SARVAM_STT_MODE: string;
  SARVAM_LANGUAGE_CODE: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_HAIKU_MODEL: string;
  INGEST_PREFIX: string;

  RECORDINGS: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;

  /** Shared secret gating POST /upload and /api/* — see docs/BUILD_BRIEF.md "No Cloudflare Access". */
  SBM_API_KEY?: string;
  SARVAM_API_KEY?: string;
  SARVAM_WEBHOOK_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.SBM_API_KEY) return false;
  const key = request.headers.get("X-SBM-Key") ?? "";
  return key.length > 0 && timingSafeEqual(key, env.SBM_API_KEY);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // GET /upload is the entry point — no header auth (a phone browser can't
    // set custom headers on a plain navigation). The page's own fetch() to
    // POST /upload carries the key, injected server-side below.
    if (url.pathname === "/upload" && request.method === "GET") {
      return handleUploadPage(env);
    }

    if (url.pathname === "/upload" && request.method === "POST") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleUploadPost(request, env, ctx);
    }

    if (url.pathname === "/webhooks/sarvam" && request.method === "POST") {
      return handleSarvamWebhook(request, env, ctx);
    }

    if (url.pathname === "/api/calls" && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetCalls(env);
    }

    const callMatch = url.pathname.match(/^\/api\/calls\/([^/]+)$/);
    if (callMatch && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetCall(env, callMatch[1]);
    }

    const todoMatch = url.pathname.match(/^\/api\/todos\/([^/]+)$/);
    if (todoMatch && request.method === "PATCH") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handlePatchTodo(request, env, todoMatch[1]);
    }

    if (url.pathname === "/api/sites" && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetSites(env);
    }

    if (url.pathname === "/api/sites/attention" && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetSitesAttention(env);
    }

    if (url.pathname === "/api/sites/backfill" && request.method === "POST") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handlePostSitesBackfill(request, env);
    }

    const siteMatch = url.pathname.match(/^\/api\/sites\/([^/]+)$/);
    if (siteMatch && request.method === "PATCH") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handlePatchSite(request, env, siteMatch[1]);
    }

    if (url.pathname === "/api/escalations" && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetEscalations(env);
    }

    if (url.pathname === "/api/escalations" && request.method === "POST") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handlePostEscalation(request, env);
    }

    const escalationMatch = url.pathname.match(/^\/api\/escalations\/([^/]+)$/);
    if (escalationMatch && request.method === "PATCH") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleCloseEscalation(env, escalationMatch[1]);
    }

    return env.ASSETS.fetch(request);
  },
};

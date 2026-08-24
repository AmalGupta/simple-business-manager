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
  handlePostSite,
  handleGetConfirmedSites,
  handleGetSitesAttention,
  handleGetSiteTeam,
  handlePatchSite,
  handlePatchTodo,
  handlePostEscalation,
  handlePostSitesBackfill,
  handlePostSiteTeamMember,
} from "./handlers/api";
import {
  handleAdminCreateUser,
  handleAdminRevokeSessions,
  handleCreateStaff,
  handleListStaff,
  handleListStaffRoster,
  handleLogin,
  handleLogout,
  handleMe,
  handleResetPin,
  handleResetStaffPin,
  handleUpdateStaffPhone,
} from "./handlers/auth";
import { handleGetCallRecording, handleGetMedia, handleGetSiteMedia, handlePostSiteMedia } from "./handlers/site-media";
import { handlePostSiteVoiceNote } from "./handlers/site-voice-note";
import { handleGetSiteTimeline } from "./handlers/site-timeline";
import { assertSiteMembership, requireSession } from "./lib/auth";

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
  /** Pepper mixed into every PIN hash — see src/lib/auth.ts. */
  PIN_PEPPER?: string;
  /** AES-256-GCM key (base64, 32 raw bytes) for reversible PIN storage — see src/lib/auth.ts encryptPin/decryptPin. */
  PIN_ENCRYPTION_KEY?: string;
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
      return handleGetCalls(request, env);
    }

    const callMatch = url.pathname.match(/^\/api\/calls\/([^/]+)$/);
    if (callMatch && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetCall(request, env, callMatch[1]);
    }

    const todoMatch = url.pathname.match(/^\/api\/todos\/([^/]+)$/);
    if (todoMatch && request.method === "PATCH") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handlePatchTodo(request, env, todoMatch[1]);
    }

    if (url.pathname === "/api/sites" && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetSites(request, env);
    }

    if (url.pathname === "/api/sites" && request.method === "POST") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handlePostSite(request, env);
    }

    if (url.pathname === "/api/sites/attention" && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetSitesAttention(request, env);
    }

    if (url.pathname === "/api/sites/confirmed" && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetConfirmedSites(request, env);
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

    const siteTeamMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/team$/);
    if (siteTeamMatch && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetSiteTeam(request, env, siteTeamMatch[1]);
    }
    if (siteTeamMatch && request.method === "POST") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handlePostSiteTeamMember(request, env, siteTeamMatch[1]);
    }

    if (url.pathname === "/api/escalations" && request.method === "GET") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleGetEscalations(request, env);
    }

    if (url.pathname === "/api/escalations" && request.method === "POST") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handlePostEscalation(request, env);
    }

    const escalationMatch = url.pathname.match(/^\/api\/escalations\/([^/]+)$/);
    if (escalationMatch && request.method === "PATCH") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleCloseEscalation(request, env, escalationMatch[1]);
    }

    // --- Auth: session-cookie login for the dashboard SPA, additive to
    // X-SBM-Key above (see src/lib/auth.ts header comment). ---

    if (url.pathname === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }

    if (url.pathname === "/api/logout" && request.method === "POST") {
      return handleLogout(request, env);
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      return handleMe(request, env);
    }

    if (url.pathname === "/api/me/pin" && request.method === "POST") {
      return handleResetPin(request, env);
    }

    // Admin bootstrap — gated by X-SBM-Key only, not session (see
    // src/handlers/auth.ts module header for why).
    if (url.pathname === "/api/admin/users" && request.method === "POST") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleAdminCreateUser(request, env);
    }

    const revokeMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/revoke-sessions$/);
    if (revokeMatch && request.method === "POST") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401 });
      return handleAdminRevokeSessions(env, revokeMatch[1]);
    }

    // --- Staff management (migration 0011) — the Staff page's day-to-day
    // path, session-cookie gated (admin/superadmin only, enforced inside
    // each handler), no X-SBM-Key involved. ---

    if (url.pathname === "/api/staff" && request.method === "GET") {
      return handleListStaff(request, env);
    }
    if (url.pathname === "/api/staff" && request.method === "POST") {
      return handleCreateStaff(request, env);
    }
    if (url.pathname === "/api/staff/roster" && request.method === "GET") {
      return handleListStaffRoster(request, env);
    }

    const staffMatch = url.pathname.match(/^\/api\/staff\/([^/]+)$/);
    if (staffMatch && request.method === "PATCH") {
      return handleUpdateStaffPhone(request, env, staffMatch[1]);
    }

    const staffResetMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/reset-pin$/);
    if (staffResetMatch && request.method === "POST") {
      return handleResetStaffPin(request, env, staffResetMatch[1]);
    }

    // --- Site media, voice notes, and the unified timeline — session-cookie
    // gated only, since <img>/<video>/<audio> can't set X-SBM-Key. ---

    const siteMediaMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/media$/);
    if (siteMediaMatch && request.method === "GET") {
      const session = await requireSession(request, env);
      if (!session) return new Response("Unauthorized", { status: 401 });
      if (!(await assertSiteMembership(env, session, siteMediaMatch[1]))) return new Response("Forbidden", { status: 403 });
      return handleGetSiteMedia(env, siteMediaMatch[1]);
    }
    if (siteMediaMatch && request.method === "POST") {
      const session = await requireSession(request, env);
      if (!session) return new Response("Unauthorized", { status: 401 });
      if (!(await assertSiteMembership(env, session, siteMediaMatch[1]))) return new Response("Forbidden", { status: 403 });
      return handlePostSiteMedia(request, env, siteMediaMatch[1], session.user_id);
    }

    const mediaMatch = url.pathname.match(/^\/api\/media\/([^/]+)$/);
    if (mediaMatch && request.method === "GET") {
      const session = await requireSession(request, env);
      if (!session) return new Response("Unauthorized", { status: 401 });
      return handleGetMedia(request, env, mediaMatch[1]);
    }

    const voiceNoteMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/voice-note$/);
    if (voiceNoteMatch && request.method === "POST") {
      const session = await requireSession(request, env);
      if (!session) return new Response("Unauthorized", { status: 401 });
      if (!(await assertSiteMembership(env, session, voiceNoteMatch[1]))) return new Response("Forbidden", { status: 403 });
      return handlePostSiteVoiceNote(request, env, ctx, voiceNoteMatch[1], session.user_id);
    }

    const recordingMatch = url.pathname.match(/^\/api\/calls\/([^/]+)\/recording$/);
    if (recordingMatch && request.method === "GET") {
      const session = await requireSession(request, env);
      if (!session) return new Response("Unauthorized", { status: 401 });
      return handleGetCallRecording(request, env, recordingMatch[1]);
    }

    const timelineMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/timeline$/);
    if (timelineMatch && request.method === "GET") {
      const session = await requireSession(request, env);
      if (!session) return new Response("Unauthorized", { status: 401 });
      if (!(await assertSiteMembership(env, session, timelineMatch[1]))) return new Response("Forbidden", { status: 403 });
      return handleGetSiteTimeline(env, timelineMatch[1]);
    }

    return env.ASSETS.fetch(request);
  },
};

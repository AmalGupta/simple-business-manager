// PIN hashing, session tokens, and cookie handling for per-person accounts —
// see the "Site Media, Voice Notes & Unified Timeline" plan for why this
// exists (previously the app had no identity beyond the shared X-SBM-Key
// secret). Additive to X-SBM-Key, not a replacement: existing /api/* routes
// keep using isAuthorized() in src/index.ts unchanged; this module gates the
// new session-cookie-only routes (media/voice-note/timeline) that <img>/
// <video>/<audio> tags can't attach a custom header to.

import { getSessionWithUser, isUserAssignedToSite, touchSession, type SessionWithUser } from "@sbm/core";
import type { Env } from "../index";

const PBKDF2_ITERATIONS = 100_000;
const SESSION_COOKIE = "sbm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // only rewrite last_seen_at if >24h stale

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2(pepper: string, pin: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper + pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return toHex(bits);
}

export interface PinHash {
  hash: string;
  salt: string;
}

export async function hashPin(env: Env, pin: string): Promise<PinHash> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(env.PIN_PEPPER ?? "", pin, saltBytes);
  return { hash, salt: toHex(saltBytes.buffer) };
}

export async function verifyPin(env: Env, pin: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const candidate = await pbkdf2(env.PIN_PEPPER ?? "", pin, fromHex(storedSalt));
  return timingSafeEqualHex(candidate, storedHash);
}

/**
 * Reversible PIN storage, deliberately separate from the one-way hash above
 * — lets admin/superadmin view a staff member's current PIN from the Staff
 * page (see docs "Deploy the change to dev" PIN-visibility decision).
 * AES-256-GCM under PIN_ENCRYPTION_KEY, stored as `ivB64:cipherB64`.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importPinEncryptionKey(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", base64ToBytes(env.PIN_ENCRYPTION_KEY ?? ""), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptPin(env: Env, pin: string): Promise<string> {
  const key = await importPinEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(pin));
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(ciphertext))}`;
}

/** Returns null if decryption fails (wrong/missing key, corrupt value) rather than throwing — callers treat that as "not recoverable, offer a reset." */
export async function decryptPin(env: Env, encrypted: string): Promise<string | null> {
  const [ivB64, cipherB64] = encrypted.split(":");
  if (!ivB64 || !cipherB64) return null;
  try {
    const key = await importPinEncryptionKey(env);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivB64) },
      key,
      base64ToBytes(cipherB64)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

/** Random 4-digit PIN for admin-created/reset staff accounts — shown once in the response, then only recoverable via decryptPin. */
export function generateRandomPin(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** The raw token goes in the cookie; only its hash is ever stored (createSession). */
export function newSessionToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(digest);
}

export function sessionExpiryFromNow(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

/**
 * Secure is keyed off the actual request protocol, not env.ENVIRONMENT —
 * this milestone's single-environment wrangler.jsonc sets ENVIRONMENT to
 * "development" even on the deployed worker (see wrangler.jsonc comment),
 * so an env-based check would silently ship cookies without Secure in
 * production too. Local dev is plain http://localhost, so this still
 * resolves the same way there.
 */
export function sessionCookieHeader(request: Request, token: string): string {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearSessionCookieHeader(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";
  return `${SESSION_COOKIE}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Resolves the session cookie (if any) to its user, refreshing last_seen_at
 * only when it's gone stale (>24h) to avoid a D1 write on every request.
 * Returns null for "no session" — callers decide whether that's a 401 or,
 * for the opportunistic-attribution call sites (handlePatchSite,
 * handlePostSiteTeamMember), just "attribute nothing."
 */
export async function requireSession(request: Request, env: Env): Promise<SessionWithUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const session = await getSessionWithUser(env.DB, tokenHash);
  if (!session) return null;

  const lastSeenMs = new Date(session.last_seen_at).getTime();
  if (Date.now() - lastSeenMs > SESSION_REFRESH_THRESHOLD_MS) {
    await touchSession(env.DB, tokenHash);
  }
  return session;
}

/**
 * Role gate for the site-scoped routes (team/media/timeline/voice-note): a
 * `staff` session must actually be assigned to the site to read/write it —
 * without this, a staff member could still reach another site's data by
 * guessing its ID even though the UI never shows it to them. admin/superadmin
 * pass unconditionally.
 */
export async function assertSiteMembership(env: Env, session: SessionWithUser | null, siteId: string): Promise<boolean> {
  if (!session) return false;
  if (session.user_role !== "staff") return true;
  return isUserAssignedToSite(env.DB, session.user_id, siteId);
}

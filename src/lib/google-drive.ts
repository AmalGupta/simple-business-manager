// Google Drive via service-account JWT → OAuth access token.
// Secrets: GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY (never wrangler.jsonc).

import type { Env } from "../index";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
// Full drive scope — poller moves ingested files into Archive (readonly cannot PATCH parents).
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

const PEM_HEADER = "-----BEGIN PRIVATE KEY-----";
const PEM_FOOTER = "-----END PRIVATE KEY-----";

/** In-isolate token cache — Workers may reuse the isolate across requests. */
let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

function requireDriveSecrets(env: Env): { clientEmail: string; privateKeyPem: string } {
  const clientEmail = env.GOOGLE_DRIVE_CLIENT_EMAIL?.trim();
  const privateKeyPem = env.GOOGLE_DRIVE_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKeyPem) {
    throw new Error("GOOGLE_DRIVE_CLIENT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY not configured");
  }
  return { clientEmail, privateKeyPem };
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Accept real newlines or literal `\n` sequences from .dev.vars / secret put. */
function normalizePem(pem: string): string {
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const normalized = normalizePem(pem)
    .replace(PEM_HEADER, "")
    .replace(PEM_FOOTER, "")
    .replace(/(\r\n|\n|\r)/g, "")
    .trim();
  const binary = atob(normalized);
  const keyBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) keyBytes[i] = binary.charCodeAt(i);

  return crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signServiceAccountJwt(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Exchange a signed service-account JWT for a short-lived Google access token.
 * Cached in-memory until ~60s before expiry.
 */
export async function getGoogleAccessToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.accessToken;
  }

  const { clientEmail, privateKeyPem } = requireDriveSecrets(env);
  const assertion = await signServiceAccountJwt(clientEmail, privateKeyPem);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.json<{ access_token: string; expires_in: number }>();
  if (!body.access_token) {
    throw new Error("Google token exchange returned no access_token");
  }

  cachedToken = {
    accessToken: body.access_token,
    expiresAtMs: now + (body.expires_in ?? 3600) * 1000,
  };
  return body.access_token;
}

export interface DriveFileListItem {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
}

export interface ListDriveFilesOptions {
  /** Drive `q` query, e.g. `'FOLDER_ID' in parents and trashed = false`. */
  q?: string;
  pageSize?: number;
  pageToken?: string;
  orderBy?: string;
  fields?: string;
}

export interface ListDriveFilesResult {
  files: DriveFileListItem[];
  nextPageToken?: string;
}

/** List files via Drive API v3 using a fresh (or cached) bearer token. */
export async function listDriveFiles(
  env: Env,
  options: ListDriveFilesOptions = {}
): Promise<ListDriveFilesResult> {
  const accessToken = await getGoogleAccessToken(env);
  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set(
    "fields",
    options.fields ?? "nextPageToken,files(id,name,mimeType,modifiedTime,size)"
  );
  url.searchParams.set("pageSize", String(options.pageSize ?? 100));
  if (options.q) url.searchParams.set("q", options.q);
  if (options.pageToken) url.searchParams.set("pageToken", options.pageToken);
  if (options.orderBy) url.searchParams.set("orderBy", options.orderBy);
  // Shared drives / files shared with the SA need this for complete listings.
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Drive files.list failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.json<{
    files?: DriveFileListItem[];
    nextPageToken?: string;
  }>();
  return { files: body.files ?? [], nextPageToken: body.nextPageToken };
}

/** Download file bytes (alt=media). Caller streams into R2. */
export async function downloadDriveFile(
  env: Env,
  fileId: string
): Promise<{ body: ReadableStream; contentType: string | null }> {
  const accessToken = await getGoogleAccessToken(env);
  const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Drive files.get media failed: ${res.status} ${await res.text()}`);
  }
  return {
    body: res.body,
    contentType: res.headers.get("content-type"),
  };
}

/** List every page of files in a folder (newest modified first). */
export async function listDriveFilesInFolder(
  env: Env,
  folderId: string
): Promise<DriveFileListItem[]> {
  const files: DriveFileListItem[] = [];
  let pageToken: string | undefined;
  do {
    const page = await listDriveFiles(env, {
      q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      pageSize: 1000,
      pageToken,
      orderBy: "modifiedTime desc",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size)",
    });
    files.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return files;
}

/**
 * Move a file between folders by rewriting parents (Drive has no dedicated move API).
 * Requires Editor access on both folders and the drive scope (not readonly).
 */
export async function moveDriveFile(
  env: Env,
  fileId: string,
  opts: { addParentId: string; removeParentId: string }
): Promise<void> {
  const accessToken = await getGoogleAccessToken(env);
  const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("addParents", opts.addParentId);
  url.searchParams.set("removeParents", opts.removeParentId);
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,parents");

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(`Drive files.move failed: ${res.status} ${await res.text()}`);
  }
}


import { addDaysIso, todayIso } from "./dates.js";

/* Same-origin API, gated by the X-SBM-Key shared secret — see
   docs/BUILD_BRIEF.md "No Cloudflare Access on this worker". Baked in at
   build time (web/.env, gitignored) since this is a static SPA with no
   login step. */
export const SBM_KEY = import.meta.env.VITE_SBM_API_KEY ?? "";

/* ------------------------------------------------------------------
   API.
   ------------------------------------------------------------------ */
async function fetchJSON(path) {
  const res = await fetch(path, { headers: { "X-SBM-Key": SBM_KEY } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

/* Shared stale-while-revalidate cache, generalized from the
   Calls-Needing-Action singleton below. A view can call `load(key)` on
   mount to paint instantly from whatever's cached and only hit the
   network if that entry is missing or past `ttlMs` — so hopping back and
   forth between views (Open Items, Clients, Sites, ...) doesn't refetch
   on every navigation, but data still can't go stale forever. `key` lets
   one cache instance serve several variants (e.g. todo status, caller
   category) without separate module-level singletons per view. */
function createSwrCache(fetcher, { ttlMs = 20000 } = {}) {
  const entries = new Map();

  function get(key) {
    return entries.get(key)?.data ?? null;
  }

  function isStale(key) {
    const entry = entries.get(key);
    return !entry || Date.now() - entry.fetchedAt > ttlMs;
  }

  function refresh(key, ...args) {
    const existing = entries.get(key);
    if (existing?.inFlight) return existing.inFlight;
    const inFlight = fetcher(...args)
      .then((data) => {
        entries.set(key, { data, fetchedAt: Date.now(), inFlight: null });
        return data;
      })
      .catch((err) => {
        const entry = entries.get(key);
        if (entry) entry.inFlight = null;
        throw err;
      });
    entries.set(key, { data: existing?.data ?? null, fetchedAt: existing?.fetchedAt ?? 0, inFlight });
    return inFlight;
  }

  /** Cache hit within TTL → resolves immediately, no network. Otherwise fetches. */
  function load(key, ...args) {
    const cached = get(key);
    if (cached !== null && !isStale(key)) return Promise.resolve(cached);
    return refresh(key, ...args);
  }

  return { get, isStale, refresh, load };
}

export async function fetchCalls() {
  const page = await fetchCallsPage({ include_low_signal: false });
  return page.items;
}

function buildCallsQueryParams(filters = {}) {
  const params = new URLSearchParams();
  if (filters.include_low_signal) params.set("include_low_signal", "1");
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.callers?.length) params.set("callers", filters.callers.join(","));
  if (filters.important_only) params.set("important_only", "1");
  if (filters.with_todos_only) params.set("with_todos_only", "1");
  if (filters.entry_types?.length) params.set("entry_types", filters.entry_types.join(","));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  return params;
}

/** Paginated calls list — { items, total, next_cursor, has_more }. */
export async function fetchCallsPage(filters = {}) {
  const qs = buildCallsQueryParams(filters);
  return fetchJSON(`/api/calls?${qs.toString()}`);
}

/** All pages matching filters (for CSV export). */
export async function fetchAllCallsPages(filters = {}) {
  const items = [];
  let cursor = null;
  for (;;) {
    const page = await fetchCallsPage({ ...filters, cursor, limit: 50 });
    items.push(...(page.items ?? []));
    if (!page.has_more || !page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return items;
}

/** Calls dashboard grid — includes low_signal so Important / Regular filters work. */
export async function fetchCallsForDashboard(filters = {}) {
  return fetchCallsPage({ include_low_signal: true, ...filters });
}

export async function fetchCallCallers(includeLowSignal = true) {
  const qs = includeLowSignal ? "?include_low_signal=1" : "";
  return fetchJSON(`/api/calls/callers${qs}`);
}

export async function fetchCallsDay(date) {
  return fetchJSON(`/api/calls/day?date=${encodeURIComponent(date)}`);
}

export async function fetchCallsByTodoStatus(status) {
  return fetchJSON(`/api/calls/by-todo-status?status=${encodeURIComponent(status)}`);
}

/* Cached by status (open / snoozed) — Open Items and Parked share this
   endpoint/component, so caching by status keeps them independent. */
const callsByTodoStatusCache = createSwrCache(fetchCallsByTodoStatus);
export function getCachedCallsByTodoStatus(status) {
  return callsByTodoStatusCache.get(status);
}
export function loadCallsByTodoStatus(status) {
  return callsByTodoStatusCache.load(status, status);
}
export function refreshCallsByTodoStatus(status) {
  return callsByTodoStatusCache.refresh(status, status);
}

/** Background hydrate after lean fetchCalls() — map of call id → transcript text (or null). */
export async function fetchCallTranscripts() {
  return fetchJSON("/api/calls/transcripts");
}

/** Home tiles + small lists — no call transcripts. Role-scoped server-side.
 *  Admin may pass forUserId to load a staff member's staff-home summary.
 *  Personal-queue rows are empty; use my_open_todos_count + fetchMyOpenTodos. */
export async function fetchDashboardSummary({ forUserId } = {}) {
  const q = forUserId ? `?for_user_id=${encodeURIComponent(forUserId)}` : "";
  return fetchJSON(`/api/dashboard/summary${q}`);
}

/** Full My call tasks list (claims + site backfill). Admin may pass forUserId. */
export async function fetchMyOpenTodos({ forUserId } = {}) {
  const q = forUserId ? `?for_user_id=${encodeURIComponent(forUserId)}` : "";
  return fetchJSON(`/api/my-open-todos${q}`);
}

/**
 * Admin Open tasks — paginated by assignee bucket (mine | unassigned | staff | blocked).
 * Optional date_from / date_to (yyyy-mm-dd) filter on task identification date.
 * Returns { items, total, limit, offset }.
 */
export async function fetchOpenTodos({
  bucket = "mine",
  limit = 20,
  offset = 0,
  dateFrom = "",
  dateTo = "",
} = {}) {
  const params = new URLSearchParams({
    bucket,
    limit: String(limit),
    offset: String(offset),
  });
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  return fetchJSON(`/api/open-todos?${params}`);
}

/** Admin Open tasks tab badge counts — same optional date window as the list. */
export async function fetchOpenTodosCounts({ dateFrom = "", dateTo = "" } = {}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const q = params.toString();
  return fetchJSON(`/api/open-todos/counts${q ? `?${q}` : ""}`);
}

/* Single-call fetch, on demand — the bulk fetchCalls() list is never loaded
   for a `staff` session (no office dashboard for them), so opening a call
   from their site's timeline needs its own fetch. Same endpoint the admin
   dashboard would resolve from its already-loaded list. Also used when a
   lean list row has has_transcript but the blob is not hydrated yet. */
export async function fetchCall(id) {
  return fetchJSON(`/api/calls/${id}`);
}

export async function fetchSitesAttention() {
  return fetchJSON("/api/sites/attention");
}

export async function fetchSites() {
  return fetchJSON("/api/sites");
}

export async function fetchConfirmedSites({ forUserId } = {}) {
  const q = forUserId ? `?for_user_id=${encodeURIComponent(forUserId)}` : "";
  return fetchJSON(`/api/sites/confirmed${q}`);
}

/* Sites Directory has one shape (no filters), so a single-key cache. */
const confirmedSitesCache = createSwrCache(fetchConfirmedSites);
const CONFIRMED_SITES_KEY = "default";
export function getCachedConfirmedSites() {
  return confirmedSitesCache.get(CONFIRMED_SITES_KEY);
}
export function loadConfirmedSites() {
  return confirmedSitesCache.load(CONFIRMED_SITES_KEY);
}
export function refreshConfirmedSites() {
  return confirmedSitesCache.refresh(CONFIRMED_SITES_KEY);
}

/* SBM-95 — search every confirmed site (not just the caller's), and pick one;
   a staff member picking a site they aren't on joins its team. */
export async function searchSites(q) {
  return fetchJSON(`/api/sites/search?q=${encodeURIComponent(q)}`);
}

export async function postPickSite(siteId) {
  const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/pick`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-SBM-Key": SBM_KEY },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `POST /api/sites/${siteId}/pick → ${res.status}`);
  return body;
}

export async function postCreateSite(details) {
  const res = await fetch("/api/sites", {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    credentials: "same-origin",
    body: JSON.stringify(details),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/sites → ${res.status}`);
  }
  return res.json();
}

export async function patchSite(id, patch) {
  const res = await fetch(`/api/sites/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify(patch),
  });
  /* Server message first: a rename can come back 409 "a site with that name
     already exists", and the dialog shows this string to the operator. */
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/sites/${id} → ${res.status}`);
  }
  return res.json();
}

export async function fetchSiteTeam(siteId) {
  return fetchJSON(`/api/sites/${siteId}/team`);
}

/* Multi-select assign, the only path the UI uses now that AddPeopleModal
   replaced the single-select dropdown. The endpoint still accepts a lone
   `user_id` and a free-text `{ name, contact_number }`, so the API stays
   backward compatible — there's just no client helper for them.

   Returns { added, skipped } — `skipped` is accounts already on the
   roster, so re-submitting a selection is a no-op rather than a
   duplicate row (site_team_members has no UNIQUE(site_id, user_id)). */
export async function postSiteTeamMembers(siteId, userIds) {
  const res = await fetch(`/api/sites/${siteId}/team`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ user_ids: userIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/sites/${siteId}/team → ${res.status}`);
  }
  return res.json();
}

/* Site contacts — the caller axis (caller_sites, migration 0022). Distinct
   from the team roster above: a contact has no login and no site access. */
export async function fetchSiteContacts(siteId) {
  return fetchJSON(`/api/sites/${siteId}/contacts`);
}

/** Idempotent — re-adding an already-linked contact is a no-op. Returns the full list. */
export async function postSiteContacts(siteId, callerIds) {
  const res = await fetch(`/api/sites/${siteId}/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    credentials: "same-origin",
    body: JSON.stringify({ caller_ids: callerIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/sites/${siteId}/contacts → ${res.status}`);
  }
  return res.json();
}

export async function deleteSiteContact(siteId, callerId) {
  const res = await fetch(`/api/sites/${siteId}/contacts/${callerId}`, {
    method: "DELETE",
    headers: { "X-SBM-Key": SBM_KEY },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `DELETE /api/sites/${siteId}/contacts/${callerId} → ${res.status}`);
  }
  return res.json();
}

/* Backfill — scans calls that already have a transcript but predate the
   automatic per-call site scan. Manual only; see src/handlers/api.ts. */
export async function postSitesBackfill() {
  const res = await fetch("/api/sites/backfill", {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`POST /api/sites/backfill → ${res.status}`);
  return res.json();
}

export async function patchTodo(id, patch) {
  try {
    const res = await fetch(`/api/todos/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`PATCH /api/todos/${id} → ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[sbm] todo update failed", err);
    throw err;
  }
}

/* Session-cookie auth (login gate + site media/timeline) — additive to the
   X-SBM-Key mechanism above, not a replacement. See src/lib/auth.ts. */
function sessionFetch(path, init = {}) {
  return fetch(path, { credentials: "same-origin", ...init });
}

export async function fetchMe() {
  const res = await sessionFetch("/api/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/me → ${res.status}`);
  return res.json();
}

export async function patchMyCustomization(patch) {
  const res = await sessionFetch("/api/me/customization", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `PATCH /api/me/customization → ${res.status}`);
  return body;
}

export async function postLogin(name, pin) {
  /* Browser login uses a real form POST (LoginScreen) so Set-Cookie is
     applied reliably. Keep this for programmatic callers (e2e/api). */
  const res = await sessionFetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, pin }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/login → ${res.status}`);
  }
  return res.json();
}

export function postLogout() {
  /* Full navigation — browsers reliably apply HttpOnly Set-Cookie on
     document loads; fetch() responses often leave the cookie in place. */
  window.location.assign("/api/logout");
}

export async function postResetPin(currentPin, newPin) {
  const res = await fetch("/api/me/pin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/me/pin → ${res.status}`);
  }
  return res.json();
}

/* Self-service phone update — any role, no current-value confirmation (a
   phone number isn't a credential). Writes straight to users.phone, which
   the assign-team roster and a site's Team card both read live, so nothing
   else needs to know this happened. */
export async function postUpdateMyPhone(phone) {
  const res = await fetch("/api/me/phone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/me/phone → ${res.status}`);
  }
  return res.json();
}

/* Staff management (migration 0011) — session-cookie only, admin/superadmin
   gated server-side, no X-SBM-Key involved (same pattern as /api/me/pin). */
export async function fetchStaff() {
  const res = await fetch("/api/staff");
  if (!res.ok) throw new Error(`GET /api/staff → ${res.status}`);
  return res.json();
}

/* Lean roster (id/name/phone, staff role only, no PIN decryption) — the
   "assign team member" dropdown's data source. Deliberately not fetchStaff()
   above: that endpoint decrypts every row's PIN and includes the viewer's
   own row, neither of which the dropdown wants, and the decryption was
   making it slow to open for no reason. */
export async function fetchStaffRoster() {
  const res = await fetch("/api/staff/roster");
  if (!res.ok) throw new Error(`GET /api/staff/roster → ${res.status}`);
  return res.json();
}

/* SBM-98: active admins/superadmins ({id, name, role}) — the top of the Pass
   on picker, so staff can hand work back up. */
export async function fetchAdminHandoffTargets() {
  const res = await fetch("/api/staff/admins");
  if (!res.ok) throw new Error(`GET /api/staff/admins → ${res.status}`);
  return res.json();
}

export async function postCreateStaff(name, phone, joinedOn) {
  const res = await fetch("/api/staff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, phone: phone || null, joined_on: joinedOn || null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/staff → ${res.status}`);
  }
  return res.json();
}

export async function patchStaffPhone(id, phone) {
  const res = await fetch(`/api/staff/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: phone || null }),
  });
  if (!res.ok) throw new Error(`PATCH /api/staff/${id} → ${res.status}`);
  return res.json();
}

export async function postResetStaffPin(id) {
  const res = await fetch(`/api/staff/${id}/reset-pin`, { method: "POST" });
  if (!res.ok) throw new Error(`POST /api/staff/${id}/reset-pin → ${res.status}`);
  return res.json();
}

/* SBM-64 staff transitions — notice-period offboarding (migration 0050).
   Session-cookie gated, admin only, same as the rest of /api/staff*. */
async function staffJson(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${method} ${path} → ${res.status}`);
  return data;
}

export const fetchOffboardingList = () => staffJson("GET", "/api/staff/offboarding");
export const fetchOffboarding = (id) => staffJson("GET", `/api/staff/${id}/offboarding`);
export const postStartOffboarding = (id, lastWorkingDay) =>
  staffJson("POST", `/api/staff/${id}/offboarding`, { last_working_day: lastWorkingDay });
export const patchLastWorkingDay = (id, lastWorkingDay) =>
  staffJson("PATCH", `/api/staff/${id}/offboarding`, { last_working_day: lastWorkingDay });
export const deleteOffboarding = (id) => staffJson("DELETE", `/api/staff/${id}/offboarding`);
/** items: [{kind, id}]; toUserId: a staff id, or "self" for the acting admin. */
export const postOffboardingTransfer = (id, items, toUserId) =>
  staffJson("POST", `/api/staff/${id}/offboarding/transfer`, { items, to_user_id: toUserId });
export const postOffboardingHandoverSite = (id, siteId, toUserId) =>
  staffJson("POST", `/api/staff/${id}/offboarding/handover-site`, { site_id: siteId, to_user_id: toUserId });
export const postOffboardingFinishNow = (id) => staffJson("POST", `/api/staff/${id}/offboarding/finish-now`);
export const postReactivateStaff = (id) => staffJson("POST", `/api/staff/${id}/reactivate`);

export async function fetchStaffDeletePreview(id) {
  const res = await fetch(`/api/staff/${id}/delete-preview`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `GET /api/staff/${id}/delete-preview → ${res.status}`);
  }
  return res.json();
}

/** @param {{ contact_action: string, relink_user_id?: string, create?: { name: string, phone?: string, pin?: string } }} body */
export async function postDeleteStaff(id, body) {
  const res = await fetch(`/api/staff/${id}/delete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `POST /api/staff/${id}/delete → ${res.status}`);
  }
  return res.json();
}

/* Callers Directory (migration 0021) — session-cookie only, admin/superadmin
   gated server-side, same pattern as /api/staff* above. */
/* `q` / `limit` / `offset` are for the site-contacts picker — the directory
   is a ~3.3k-row phone-contacts import, too big to load whole. Omitting them
   keeps the original full-category behaviour the Callers Directory relies on.
   Response is { items, total, counts }, where `total` ignores the page window. */
export async function fetchCallers({
  category,
  bucket,
  siteId,
  linkedSitesOnly,
  includeLinkedSites,
  includeAliases,
  q,
  limit,
  offset,
} = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (bucket) params.set("bucket", bucket);
  if (siteId) params.set("siteId", siteId);
  if (linkedSitesOnly) params.set("linked_sites", "1");
  if (includeLinkedSites) params.set("include_linked_sites", "1");
  if (includeAliases) params.set("include_aliases", "1");
  if (q) params.set("q", q);
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));
  const qs = params.toString();
  const res = await fetch(`/api/callers${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`GET /api/callers → ${res.status}`);
  return res.json();
}

function contactsDirectoryCacheKey(opts) {
  return JSON.stringify({
    bucket: opts.bucket ?? "",
    siteId: opts.siteId ?? "",
    linkedSitesOnly: opts.linkedSitesOnly ? "1" : "",
    includeLinkedSites: opts.includeLinkedSites ? "1" : "",
    includeAliases: opts.includeAliases ? "1" : "",
    q: opts.q ?? "",
    limit: opts.limit ?? "",
    offset: opts.offset ?? "",
  });
}

/* Site-contacts picker — cached by category (unchanged). */
const callersByCategoryCache = createSwrCache((category) => fetchCallers({ category }));
export function getCachedCallersByCategory(category) {
  return callersByCategoryCache.get(category);
}
export function loadCallersByCategory(category) {
  return callersByCategoryCache.load(category, category);
}
export function refreshCallersByCategory(category) {
  return callersByCategoryCache.refresh(category, category);
}

/* Contacts directory — cached per bucket/page/filter window; live search bypasses cache. */
const contactsDirectoryCache = createSwrCache((key) => fetchCallers(JSON.parse(key)));
export function loadContactsDirectory(opts) {
  const key = contactsDirectoryCacheKey(opts);
  return contactsDirectoryCache.load(key, key);
}
export function refreshContactsDirectory(opts) {
  const key = contactsDirectoryCacheKey(opts);
  return contactsDirectoryCache.refresh(key, key);
}
export function getCachedContactsDirectory(opts) {
  return contactsDirectoryCache.get(contactsDirectoryCacheKey(opts));
}

export async function postCreateCaller(input) {
  const res = await fetch("/api/callers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `POST /api/callers → ${res.status}`);
    // 409: the number (or, with no number, the name) is already a contact.
    err.status = res.status;
    err.existing = body.existing ?? null;
    throw err;
  }
  return res.json();
}

/** Promote a contact to a staff login (creates user + PIN when missing). */
export async function postPromoteCallerStaff(callerId) {
  const res = await fetch(`/api/callers/${callerId}/promote-staff`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/callers/${callerId}/promote-staff → ${res.status}`);
  }
  return res.json();
}

/** Confirm editable login name / PIN / alias after promote. `category` = office_staff | service_staff. */
export async function postConfirmCallerStaffPromotion(callerId, { login_name, pin, alias, category }) {
  const res = await fetch(`/api/callers/${callerId}/confirm-staff-promotion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login_name, pin, alias, category }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/callers/${callerId}/confirm-staff-promotion → ${res.status}`);
  }
  return res.json();
}

/* SBM-81 — view-as. While an admin is on a staff-bookmark tab, every same-origin
   /api request carries X-SBM-View-As so the server can apply that admin's
   read-only scopes (src/lib/scopes.ts). Installed once, at module load, so it
   covers the many direct fetch() calls without touching each one. */
let viewAsUserId = null;
export function setViewAsUserId(id) {
  viewAsUserId = id || null;
}
if (typeof window !== "undefined" && !window.__sbmViewAsFetch) {
  window.__sbmViewAsFetch = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (viewAsUserId) {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.startsWith("/api/")) {
        const headers = new Headers(init?.headers ?? (typeof input !== "string" ? input.headers : undefined));
        headers.set("X-SBM-View-As", viewAsUserId);
        return nativeFetch(input, { ...init, headers });
      }
    }
    return nativeFetch(input, init);
  };
}

/* SBM-81 — Maintenance → Manage scopes (admin/superadmin). */
async function scopesRequest(path, method, level) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: level ? JSON.stringify({ level }) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${method} ${path} → ${res.status}`);
  return body;
}
export const fetchScopes = () => scopesRequest("/api/maintenance/scopes", "GET");
export const putScopeRoleGrant = (role, key, level) =>
  scopesRequest(`/api/maintenance/scopes/roles/${encodeURIComponent(role)}/${encodeURIComponent(key)}`, "PUT", level);
export const deleteScopeRoleGrant = (role, key) =>
  scopesRequest(`/api/maintenance/scopes/roles/${encodeURIComponent(role)}/${encodeURIComponent(key)}`, "DELETE");
export const putScopeUserOverride = (userId, key, level) =>
  scopesRequest(`/api/maintenance/scopes/users/${encodeURIComponent(userId)}/${encodeURIComponent(key)}`, "PUT", level);
export const deleteScopeUserOverride = (userId, key) =>
  scopesRequest(`/api/maintenance/scopes/users/${encodeURIComponent(userId)}/${encodeURIComponent(key)}`, "DELETE");

/* Maintenance — session-cookie only, admin/superadmin. */
export async function fetchSiteContactProposals() {
  const res = await fetch("/api/maintenance/site-contact-proposals", { credentials: "same-origin" });
  if (!res.ok) throw new Error(`GET /api/maintenance/site-contact-proposals → ${res.status}`);
  return res.json();
}

export async function postSiteContactMappings(mappings) {
  const res = await fetch("/api/maintenance/site-contact-mappings", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mappings }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/maintenance/site-contact-mappings → ${res.status}`);
  }
  return res.json();
}

export async function patchCaller(id, patch) {
  const res = await fetch(`/api/callers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/callers/${id} → ${res.status}`);
  }
  return res.json();
}

export async function fetchCallerAliases(callerId) {
  const res = await fetch(`/api/callers/${callerId}/aliases`);
  if (!res.ok) throw new Error(`GET /api/callers/${callerId}/aliases → ${res.status}`);
  return res.json();
}

export async function postCallerAlias(callerId, alias) {
  const res = await fetch(`/api/callers/${callerId}/aliases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ alias }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/callers/${callerId}/aliases → ${res.status}`);
  }
  return res.json();
}

export async function deleteCallerAlias(callerId, aliasId) {
  const res = await fetch(`/api/callers/${callerId}/aliases/${aliasId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `DELETE /api/callers/${callerId}/aliases/${aliasId} → ${res.status}`);
  }
  return res.json();
}

export async function fetchSiteMedia(siteId) {
  const res = await fetch(`/api/sites/${siteId}/media`);
  if (!res.ok) throw new Error(`GET /api/sites/${siteId}/media → ${res.status}`);
  return res.json();
}

export async function postSiteMedia(siteId, file, caption) {
  const fd = new FormData();
  fd.append("file", file);
  if (caption) fd.append("caption", caption);
  const res = await fetch(`/api/sites/${siteId}/media`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`POST /api/sites/${siteId}/media → ${res.status}`);
  return res.json();
}

export async function postSiteVoiceNote(siteId, blob, fileName) {
  const fd = new FormData();
  fd.append("recording", blob, fileName);
  const res = await fetch(`/api/sites/${siteId}/voice-note`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`POST /api/sites/${siteId}/voice-note → ${res.status}`);
  return res.json();
}

/** Admin-home desk conversation — STT + extraction + staff auto-assign. */
export async function postDeskVoiceNote(blob, fileName) {
  const fd = new FormData();
  fd.append("recording", blob, fileName);
  const res = await fetch(`/api/desk-voice-note`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`POST /api/desk-voice-note → ${res.status}`);
  return res.json();
}

/* Calls Needing Action carousel (migration 0025) — GET/PATCH on /api/calls/*
   use the X-SBM-Key mechanism like the rest of the calls API; the voice-note
   upload/stream routes below are session-cookie-only, same as site voice
   notes (a plain multipart POST/`<audio>` GET can't reliably carry the
   custom header). */

/** How far back the date strip marks days with calls (SBM-102: today − 30). */
export const CNA_LOOKBACK_DAYS = 30;

/** One day's cards — the carousel only ever shows the selected day (SBM-102). */
export function callsNeedingActionDay(date) {
  return { dateFrom: date, dateTo: date };
}

/** The day the carousel opens on: today. Shared with the home-page cache
 *  warm-up so the two can't pick different keys and miss each other. */
export function defaultCallsNeedingActionWindow() {
  return callsNeedingActionDay(todayIso());
}

/** The span the date strip's first block of dots covers: today and the
 *  CNA_LOOKBACK_DAYS before it. */
export function callsNeedingActionLookback() {
  return cnaCalendarWindow(0);
}

const isoToUtcDay = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

/* Dot windows, counted back from today: 0 = today−30 … today, 1 = today−60 …
   today−31, 2 = today−90 … today−61, and so on. */
function cnaCalendarWindow(index) {
  const to = todayIso();
  if (index === 0) return { dateFrom: addDaysIso(to, -CNA_LOOKBACK_DAYS), dateTo: to };
  return {
    dateFrom: addDaysIso(to, -CNA_LOOKBACK_DAYS * (index + 1)),
    dateTo: addDaysIso(to, -CNA_LOOKBACK_DAYS * index - 1),
  };
}

/** Which dot window a past date falls in (null for future dates). */
export function callsNeedingActionWindowIndex(date) {
  const back = isoToUtcDay(todayIso()) - isoToUtcDay(date);
  if (back < 0) return null;
  return back <= CNA_LOOKBACK_DAYS ? 0 : Math.floor((back - 1) / CNA_LOOKBACK_DAYS);
}

/* Which days have calls needing action, held in memory per window: window 0
   loads once per page; an older window loads only the first time a date
   inside it is clicked. Never re-asked within a day (the whole set resets
   when the date rolls over). Resolving a call adjusts its day in place. */
let cnaCalendar = { today: null, windows: new Map() }; // index → { promise, days }

function cnaCalendarWindows() {
  const now = todayIso();
  if (cnaCalendar.today !== now) cnaCalendar = { today: now, windows: new Map() };
  return cnaCalendar.windows;
}

/** Loads (once) the dots for window `index`; resolves to the merged { days } of every loaded window. */
export function loadCallsNeedingActionCalendar(index = 0) {
  const windows = cnaCalendarWindows();
  let entry = windows.get(index);
  if (!entry) {
    entry = { days: null, promise: null };
    const created = entry;
    created.promise = fetchCallsNeedingActionCalendar(cnaCalendarWindow(index))
      .then((data) => {
        created.days = data.days ?? {};
      })
      .catch((err) => {
        if (windows.get(index) === created) windows.delete(index);
        throw err;
      });
    windows.set(index, created);
  }
  return entry.promise.then(() => getCachedCallsNeedingActionCalendar());
}

/** Drops every loaded window — after a change (e.g. a call deleted) that can
 *  move counts outside the day on screen. */
export function invalidateCallsNeedingActionCalendar() {
  cnaCalendar = { today: null, windows: new Map() };
}

/** Whether window `index`'s dots are loaded or loading. */
export function hasCallsNeedingActionCalendarWindow(index) {
  return cnaCalendarWindows().has(index);
}

/** Merged { days } across the loaded windows, or null if none has loaded. */
export function getCachedCallsNeedingActionCalendar() {
  let days = null;
  for (const entry of cnaCalendarWindows().values()) {
    if (entry.days) days = { ...(days ?? {}), ...entry.days };
  }
  return days ? { days } : null;
}

/** Shift one day's count (e.g. −1 on resolve); returns the updated merged data. */
export function adjustCallsNeedingActionCalendar(date, delta) {
  const index = callsNeedingActionWindowIndex(date);
  const entry = index === null ? null : cnaCalendarWindows().get(index);
  if (!entry?.days) return getCachedCallsNeedingActionCalendar();
  const days = { ...entry.days };
  const n = (days[date] ?? 0) + delta;
  if (n > 0) days[date] = n;
  else delete days[date];
  entry.days = days;
  return getCachedCallsNeedingActionCalendar();
}

/** Returns { items, voiceNotesByTodoId } — the latter a Map<todoId, TodoVoiceNote>. */
export async function fetchCallsNeedingAction({ dateFrom = null, dateTo = null } = {}) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString();
  const url = `/api/calls/needing-action${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { "X-SBM-Key": SBM_KEY } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const data = await res.json();
  return {
    items: data.items ?? [],
    voiceNotesByTodoId: new Map(Object.entries(data.voice_notes_by_todo_id ?? {})),
  };
}

/* Shared cache for the Calls Needing Action list, keyed by date window — the
   carousel loads one window at a time and merges them client-side, so each
   window is its own cache entry (same pattern as callsByTodoStatusCache).
   The default window is warmed on home-page load (see Dashboard.jsx) so
   opening the carousel tile renders instantly from cache instead of showing
   a loading state, while a background refresh keeps it current. */
const callsNeedingActionCache = createSwrCache(fetchCallsNeedingAction);

const windowKey = ({ dateFrom = null, dateTo = null } = {}) => `${dateFrom ?? ""}..${dateTo ?? ""}`;

export function getCachedCallsNeedingAction(window) {
  return callsNeedingActionCache.get(windowKey(window));
}

/** Always hits the network and updates the cache — use after a mutation. */
export function refreshCallsNeedingAction(window) {
  return callsNeedingActionCache.refresh(windowKey(window), window);
}

/** Cache hit within TTL resolves instantly with no request; otherwise refreshes. */
export function loadCallsNeedingAction(window) {
  return callsNeedingActionCache.load(windowKey(window), window);
}

/** Per-day qualifying-call counts over a date range, for the carousel's date
 *  strip — { days }. */
export async function fetchCallsNeedingActionCalendar({ dateFrom, dateTo }) {
  return fetchJSON(`/api/calls/needing-action/calendar?date_from=${dateFrom}&date_to=${dateTo}`);
}

/** Total qualifying calls in a date range — the carousel's header count. */
export async function fetchCallsNeedingActionCount({ dateFrom, dateTo }) {
  const data = await fetchJSON(`/api/calls/needing-action/count?date_from=${dateFrom}&date_to=${dateTo}`);
  return data.count ?? 0;
}

export async function resolveCall(callId) {
  const res = await fetch(`/api/calls/${callId}/resolve`, {
    method: "PATCH",
    headers: { "X-SBM-Key": SBM_KEY },
  });
  if (!res.ok) throw new Error(`PATCH /api/calls/${callId}/resolve → ${res.status}`);
  return res.json();
}

/** CNA — suggested sites for Assign to Site (contact → caller_sites). */
export async function fetchTodoAssignSiteOptions(todoId) {
  return fetchJSON(`/api/todos/${todoId}/assign-site`);
}

/**
 * Assign site to a todo (and parent call). associateContact also writes caller_sites.
 */
export async function assignTodoSite(todoId, siteId, { associateContact = false } = {}) {
  const res = await fetch(`/api/todos/${todoId}/assign-site`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ site_id: siteId, associate_contact: associateContact }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/todos/${todoId}/assign-site → ${res.status}`);
  }
  return res.json();
}

/** Calls resolved from Calls Needing Action — Resolved Calls home tile / grid. */
export async function fetchResolvedCalls(limit = 500) {
  const data = await fetchJSON(`/api/calls/resolved?limit=${limit}`);
  return data.items ?? [];
}

/** Quick raw-audio clip attached to one todo row — no transcription, unlike postSiteVoiceNote. */
export async function postTodoVoiceNote(todoId, blob, fileName) {
  const fd = new FormData();
  fd.append("recording", blob, fileName);
  const res = await fetch(`/api/todos/${todoId}/voice-note`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`POST /api/todos/${todoId}/voice-note → ${res.status}`);
  return res.json();
}

export async function fetchSiteTimeline(siteId) {
  const res = await fetch(`/api/sites/${siteId}/timeline`);
  if (!res.ok) throw new Error(`GET /api/sites/${siteId}/timeline → ${res.status}`);
  return res.json();
}

/** Calls mentioning a site, discovering call first — review-screen "Listen". */
export async function fetchSiteCalls(siteId) {
  const res = await fetch(`/api/sites/${siteId}/calls`);
  if (!res.ok) throw new Error(`GET /api/sites/${siteId}/calls → ${res.status}`);
  return res.json();
}

/* Site-task workflow system — migration 0013. See WORKFLOW_CATEGORIES below
   for the tile grouping; these fetchers back the home-page workflow tiles,
   the admin "View work timeline" popup, and the staff mark-done/handoff flow. */

/** Home-page "Calls logged" tile — total count, including low_signal. */
export async function fetchCallsCount() {
  return fetchJSON("/api/calls/count");
}

/** Open (assigned, not done) site tasks — `staff` gets their own only, admin/superadmin get every one, scoped server-side.
 *  Admin may pass forUserId when viewing a staff home bookmark. */
export async function fetchOpenSiteTasks({ forUserId } = {}) {
  const q = forUserId ? `?for_user_id=${encodeURIComponent(forUserId)}` : "";
  return fetchJSON(`/api/site-tasks/open${q}`);
}

/** All 23 stages for one site — the admin "View work timeline" popup. */
export async function fetchSiteTasks(siteId) {
  return fetchJSON(`/api/sites/${siteId}/tasks`);
}

/** Open call todos for one site — confirmed-sites Open-count popup. */
export async function fetchSiteOpenTodos(siteId) {
  const data = await fetchJSON(`/api/sites/${siteId}/open-todos`);
  const notes = data.voice_notes_by_todo_id ?? {};
  return {
    items: data.items ?? [],
    voiceNotesByTodoId: new Map(Object.entries(notes)),
  };
}

/** Every still-unassigned stage at one site — the handoff picker shown after marking a stage done. */
export async function fetchUnassignedSiteTasks(siteId) {
  return fetchJSON(`/api/sites/${siteId}/tasks/unassigned`);
}

export async function patchSiteTask(id, patch) {
  const res = await fetch(`/api/site-tasks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/site-tasks/${id} → ${res.status}`);
  }
  return res.json();
}

/* Staff field workflow (migration 0016/0017) — installations at a site and
   their 6-category checklist. `category` is "installation" | "measurement"
   | "material_delivery" — one table/API serves all three (migration 0017).
   Session-cookie only, same as postSiteMedia/postSiteVoiceNote above — no
   X-SBM-Key involved. */

export async function fetchSiteInstallations(siteId, category) {
  const res = await fetch(`/api/sites/${siteId}/installations?category=${category}`);
  if (!res.ok) throw new Error(`GET /api/sites/${siteId}/installations → ${res.status}`);
  return res.json();
}

export async function postSiteInstallation(siteId, label, category) {
  const res = await sessionFetch(`/api/sites/${siteId}/installations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label, category }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/sites/${siteId}/installations → ${res.status}`);
  }
  return res.json();
}

/** Returns { installation, updates } — updates is the full history, oldest first. */
export async function fetchInstallation(id) {
  const res = await fetch(`/api/installations/${id}`);
  if (!res.ok) throw new Error(`GET /api/installations/${id} → ${res.status}`);
  return res.json();
}

/** The required voice note for one checklist row. `category` is one of the 6 InstallationUpdateCategory values. */
export async function postInstallationUpdate(installationId, category, blob, fileName) {
  const fd = new FormData();
  fd.append("category", category);
  fd.append("recording", blob, fileName);
  const res = await fetch(`/api/installations/${installationId}/updates`, { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/installations/${installationId}/updates → ${res.status}`);
  }
  return res.json();
}

/** Optional photo/video attached to an existing checklist row, once it has a voice note. */
export async function postInstallationUpdateMedia(updateId, file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/installation-updates/${updateId}/media`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`POST /api/installation-updates/${updateId}/media → ${res.status}`);
  return res.json();
}

/** Complaints list — staff (scoped) or admin (all). Session-only.
 *  Admin may pass forUserId when viewing a staff home bookmark. */
export async function fetchComplaints({ forUserId } = {}) {
  const q = forUserId ? `?for_user_id=${encodeURIComponent(forUserId)}` : "";
  const res = await fetch(`/api/complaints${q}`, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `GET /api/complaints → ${res.status}`);
  }
  return res.json();
}

/** Open complaints count — home tile. */
export async function fetchComplaintsCount({ forUserId } = {}) {
  const q = forUserId ? `?for_user_id=${encodeURIComponent(forUserId)}` : "";
  const res = await fetch(`/api/complaints/count${q}`, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `GET /api/complaints/count → ${res.status}`);
  }
  const data = await res.json();
  return data.count ?? 0;
}

export async function patchComplaint(id, assignedToUserId) {
  const res = await fetch(`/api/complaints/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ assigned_to_user_id: assignedToUserId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/complaints/${id} → ${res.status}`);
  }
  return res.json();
}

/** @deprecated Use fetchComplaints() */
export async function fetchStaffComplaints() {
  return fetchComplaints();
}

/** Site-level complaint — voice note required; optional text + photo/video attachments. */
/** SBM-72 — a staff member's display language (hi | en | pa); admin only. */
export async function fetchStaffLanguage(id) {
  const res = await fetch(`/api/staff/${id}/language`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`GET /api/staff/${id}/language → ${res.status}`);
  return res.json();
}

export async function patchStaffLanguage(id, displayLanguage) {
  const res = await fetch(`/api/staff/${id}/language`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ display_language: displayLanguage }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/staff/${id}/language → ${res.status}`);
  }
  return res.json();
}

/** SBM-71 — admin sets any of { assigned_to_user_id, site_id, due_date } on a complaint; returns the detail. */
export async function patchComplaintFields(id, patch) {
  const res = await fetch(`/api/complaints/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/complaints/${id} → ${res.status}`);
  }
  return res.json();
}

/** SBM-71 — one complaint with its voice transcript and photos/videos. */
export async function fetchComplaint(id) {
  const res = await fetch(`/api/complaints/${id}`, { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `GET /api/complaints/${id} → ${res.status}`);
  }
  return res.json();
}

/** Resolves to the created complaint ({ id, … }). */
export async function postSiteComplaint(siteId, text, blob, fileName, mediaFiles = []) {
  const fd = new FormData();
  if (text?.trim()) fd.append("text", text.trim());
  fd.append("recording", blob, fileName);
  for (const file of mediaFiles) fd.append("media", file);
  const res = await fetch(`/api/sites/${siteId}/complaints`, { method: "POST", body: fd, credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/sites/${siteId}/complaints → ${res.status}`);
  }
  return res.json();
}

/** Admin material-shortage ledger. `status` optional ("open" | "fulfilled"); omitted returns every row. */
export async function fetchMaterialShortages(status) {
  const qs = status ? `?status=${status}` : "";
  const res = await fetch(`/api/material-shortages${qs}`);
  if (!res.ok) throw new Error(`GET /api/material-shortages → ${res.status}`);
  return res.json();
}

export async function patchMaterialShortage(id) {
  const res = await fetch(`/api/material-shortages/${id}`, { method: "PATCH" });
  if (!res.ok) throw new Error(`PATCH /api/material-shortages/${id} → ${res.status}`);
  return res.json();
}

/* In-app "request/report an issue" form → Jira (migration 0033/0034) — voice
   only. Any role, session-cookie only, no X-SBM-Key. */

/** Uploads the recording; returns the row at status "pending" — poll fetchAppRequests() for it to move to "transcribing" then "submitted"/"failed". */
export async function postAppRequestVoiceNote(blob, fileName) {
  const fd = new FormData();
  fd.append("recording", blob, fileName);
  const res = await fetch("/api/app-requests", { method: "POST", body: fd, credentials: "same-origin" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `POST /api/app-requests → ${res.status}`);
  return body;
}

/** Own submissions only — scoped server-side. Refreshes Jira statuses on each call. */
export async function fetchAppRequests() {
  const res = await fetch("/api/app-requests", { credentials: "same-origin" });
  if (!res.ok) throw new Error(`GET /api/app-requests → ${res.status}`);
  return res.json();
}

/** Deletes own row; pass closeJira:true to transition the linked ticket to Done first. */
export async function deleteAppRequest(id, { closeJira = false } = {}) {
  const res = await fetch(`/api/app-requests/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ closeJira: Boolean(closeJira) }),
  });
  if (res.status === 204) return;
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error || `DELETE /api/app-requests/${id} → ${res.status}`);
}

/** Drive Calls-folder poller — admin Calls page controls. */
export async function fetchDrivePollSettings() {
  return fetchJSON("/api/admin/drive-poll");
}

export async function patchDrivePollSettings(enabled) {
  const res = await fetch("/api/admin/drive-poll", {
    method: "PATCH",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    credentials: "same-origin",
    body: JSON.stringify({ enabled: Boolean(enabled) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/admin/drive-poll → ${res.status}`);
  }
  return res.json();
}

export async function postDrivePoll() {
  const res = await fetch("/api/admin/drive-poll", {
    method: "POST",
    headers: { "X-SBM-Key": SBM_KEY },
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/admin/drive-poll → ${res.status}`);
  }
  return res.json();
}

/* Staff roster (migration 0044) — assigned work (call todos + site tasks)
   planned onto days, admin urgent flag, hand-off, roster grid, audit.
   `kind` is "todo" | "site_task". `forUserId` lets an admin act on one
   staff member's share (staff sessions are always scoped to self). */
async function workFetch(path, init = {}) {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY, ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${init.method ?? "GET"} ${path} → ${res.status}`);
  }
  return res.json();
}

function forUserQuery(forUserId) {
  return forUserId ? `?for_user_id=${encodeURIComponent(forUserId)}` : "";
}

/** Read receipts — marks these todos seen for the signed-in user only. */
export function postTodosSeen(todoIds) {
  return workFetch(`/api/todos/seen`, { method: "POST", body: JSON.stringify({ todo_ids: todoIds }) });
}

export function fetchAssignedWork({ forUserId } = {}) {
  return workFetch(`/api/work/assigned${forUserQuery(forUserId)}`);
}

export function patchWork(kind, id, patch, { forUserId } = {}) {
  return workFetch(`/api/work/${kind}/${id}${forUserQuery(forUserId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function postWorkHandoff(kind, id, toUserId, { forUserId } = {}) {
  return workFetch(`/api/work/${kind}/${id}/handoff${forUserQuery(forUserId)}`, {
    method: "POST",
    body: JSON.stringify({ to_user_id: toUserId }),
  });
}

/* SBM-103 — task updates. A "section" is { body, files: [{ file|blob, name }] }. */
function appendSection(fd, prefix, section) {
  if (section?.body?.trim()) fd.append(`${prefix}body`, section.body.trim());
  for (const f of section?.files ?? []) fd.append(`${prefix}media`, f.file, f.name);
}

async function multipartWork(path, fd) {
  const res = await fetch(path, { method: "POST", body: fd });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST ${path} → ${res.status}`);
  }
  return res.json();
}

/** { task, updates } — task header + transitions, and every post newest first. */
export function fetchTaskUpdates(kind, id) {
  return workFetch(`/api/work/${kind}/${id}/updates`);
}

export function postTaskUpdate(kind, id, section) {
  const fd = new FormData();
  appendSection(fd, "", section);
  return multipartWork(`/api/work/${kind}/${id}/updates`, fd);
}

/** Mark done with notes; a non-empty `pending` creates a follow-up task. */
export function postTaskComplete(kind, id, { completed, pending }, { forUserId } = {}) {
  const fd = new FormData();
  appendSection(fd, "completed_", completed);
  appendSection(fd, "pending_", pending);
  return multipartWork(`/api/work/${kind}/${id}/complete${forUserQuery(forUserId)}`, fd);
}

export function postTaskUpdatesSeen(kind, id) {
  return workFetch(`/api/work/${kind}/${id}/updates/seen`, { method: "POST", body: "{}" });
}

/** Items with posts from the other side not yet opened — the green-bubble list. */
export function fetchTaskUpdateInbox({ forUserId } = {}) {
  return workFetch(`/api/work/updates/inbox${forUserQuery(forUserId)}`);
}

export function fetchStaffRosterGrid(to) {
  return workFetch(`/api/work/roster?to=${encodeURIComponent(to)}`);
}

export function fetchWorkEvents(userId, { beforeSeq, limit = 100 } = {}) {
  const params = new URLSearchParams({ user_id: userId, limit: String(limit) });
  if (beforeSeq != null) params.set("before_seq", String(beforeSeq));
  return workFetch(`/api/work/events?${params}`);
}

/* Contact merge + multiple numbers (migration 0048). Errors carry `status`
   and, on 409, `existing` (the contact that already has the number). */
async function callerMergeFetch(path, init) {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `${init?.method ?? "GET"} ${path} → ${res.status}`);
    err.status = res.status;
    err.existing = body.existing ?? null;
    throw err;
  }
  return res.json();
}

/** Give a phoneless contact a number → { status: "set" | "merged_unsaved", caller, merged_name? }. */
export function postAssociateCallerPhone(callerId, phone) {
  return callerMergeFetch(`/api/callers/${callerId}/phone`, { method: "POST", body: JSON.stringify({ phone }) });
}

/** Merge two contacts; `keepName` is one of their two names. Returns the merged contact. */
export function postMergeCallers(ids, keepName) {
  return callerMergeFetch(`/api/callers/merge`, { method: "POST", body: JSON.stringify({ ids, keep_name: keepName }) });
}

/** [{ name, contacts: [...CallerRow, calls] }] — named contacts sharing a name on different numbers. */
export function fetchSameNameCallers() {
  return callerMergeFetch(`/api/callers/same-name`, { method: "GET" });
}

/** Admin Task Audit — { items: [...], today_count }. Paged by `seq`. */
/** scope: "tasks" (todos + site stages, the default) or "complaints" (SBM-71 Complaint audit tab). */
export function fetchTaskAudit({ beforeSeq, limit = 100, q, scope = "tasks" } = {}) {
  const params = new URLSearchParams({ limit: String(limit), scope });
  if (beforeSeq != null) params.set("before_seq", String(beforeSeq));
  if (q && q.trim()) params.set("q", q.trim());
  return workFetch(`/api/work/audit?${params}`);
}

/** One task's full timeline: { title, status, site_name, call_id, urgent, assignees, events }. */
export function fetchTaskTimeline(kind, id) {
  return workFetch(`/api/work/audit/task?${new URLSearchParams({ kind, id })}`);
}


/* ------------------------------------------------------------------
   Production job tracker — migration 0042. Same X-SBM-Key pattern as the
   site-tasks functions above.
   ------------------------------------------------------------------ */

export async function fetchProductionJobs(status) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return fetchJSON(`/api/production-jobs${q}`);
}

export async function postProductionJob({ siteId, title, surveyNote }) {
  const res = await fetch("/api/production-jobs", {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ site_id: siteId, title, survey_note: surveyNote || null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/production-jobs → ${res.status}`);
  }
  return res.json();
}

/** Returns { job, steps, problems }. */
export async function fetchProductionJob(id) {
  return fetchJSON(`/api/production-jobs/${id}`);
}

/** `staff` gets their own assigned steps only; admin/superadmin get every currently-assigned step. Admin may pass forUserId for a staff home bookmark. */
export async function fetchOpenProductionSteps({ forUserId } = {}) {
  const q = forUserId ? `?for_user_id=${encodeURIComponent(forUserId)}` : "";
  return fetchJSON(`/api/production-steps/open${q}`);
}

export async function patchProductionStep(id, patch) {
  const res = await fetch(`/api/production-steps/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/production-steps/${id} → ${res.status}`);
  }
  return res.json();
}

export async function postProductionJobProblem(jobId, description) {
  const res = await fetch(`/api/production-jobs/${jobId}/problems`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/production-jobs/${jobId}/problems → ${res.status}`);
  }
  return res.json();
}

export async function patchProductionJobProblem(id, resolutionNote) {
  const res = await fetch(`/api/production-job-problems/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ resolution_note: resolutionNote || null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/production-job-problems/${id} → ${res.status}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------
   Warehouse register — migration 0042. Same X-SBM-Key pattern.
   ------------------------------------------------------------------ */

export async function fetchWarehouseStores() {
  return fetchJSON("/api/warehouse/stores");
}

export async function fetchWarehouseStock(storeId) {
  const q = storeId ? `?store_id=${encodeURIComponent(storeId)}` : "";
  return fetchJSON(`/api/warehouse/stock${q}`);
}

export async function fetchWarehouseMovements({ storeId, kind, siteId, limit } = {}) {
  const params = new URLSearchParams();
  if (storeId) params.set("store_id", storeId);
  if (kind) params.set("kind", kind);
  if (siteId) params.set("site_id", siteId);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return fetchJSON(`/api/warehouse/movements${qs ? `?${qs}` : ""}`);
}

export async function postWarehouseMovement(fields) {
  const res = await fetch("/api/warehouse/movements", {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/warehouse/movements → ${res.status}`);
  }
  return res.json();
}

export async function voidWarehouseMovement(id) {
  const res = await fetch(`/api/warehouse/movements/${id}/void`, {
    method: "PATCH",
    headers: { "X-SBM-Key": SBM_KEY },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/warehouse/movements/${id}/void → ${res.status}`);
  }
  return res.json();
}

export async function fetchWarehouseItemSuggestions(storeId) {
  return fetchJSON(`/api/warehouse/item-suggestions?store_id=${encodeURIComponent(storeId)}`);
}

export async function fetchOpenToolMovements() {
  return fetchJSON("/api/warehouse/tools");
}

export async function postToolMovement(fields) {
  const res = await fetch("/api/warehouse/tools", {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/warehouse/tools → ${res.status}`);
  }
  return res.json();
}

export async function returnToolMovement(id) {
  const res = await fetch(`/api/warehouse/tools/${id}/return`, {
    method: "PATCH",
    headers: { "X-SBM-Key": SBM_KEY },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PATCH /api/warehouse/tools/${id}/return → ${res.status}`);
  }
  return res.json();
}

/* SBM-106 — an admin's own "My pages" list (admin nav). */
export async function fetchMyPages() {
  const res = await fetch("/api/me/pages", { credentials: "same-origin" });
  if (!res.ok) throw new Error(`GET /api/me/pages → ${res.status}`);
  return (await res.json()).pages;
}

export async function saveMyPages(pages) {
  const res = await fetch("/api/me/pages", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pages }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `PUT /api/me/pages → ${res.status}`);
  return body.pages;
}

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

export async function fetchCalls() {
  return fetchJSON("/api/calls");
}

/** Calls dashboard grid — includes low_signal so Important / Regular filters work. */
export async function fetchCallsForDashboard() {
  return fetchJSON("/api/calls?include_low_signal=1");
}

/** Background hydrate after lean fetchCalls() — map of call id → transcript text (or null). */
export async function fetchCallTranscripts() {
  return fetchJSON("/api/calls/transcripts");
}

/** Home tiles + small lists — no call transcripts. Role-scoped server-side. */
export async function fetchDashboardSummary() {
  return fetchJSON("/api/dashboard/summary");
}

/* Single-call fetch, on demand — the bulk fetchCalls() list is never loaded
   for a `staff` session (no office dashboard for them), so opening a call
   from their site's timeline needs its own fetch. Same endpoint the admin
   dashboard would resolve from its already-loaded list. Also used when a
   lean list row has has_transcript but the blob is not hydrated yet. */
export async function fetchCall(id) {
  return fetchJSON(`/api/calls/${id}`);
}

export async function fetchEscalations() {
  return fetchJSON("/api/escalations");
}

export async function fetchSitesAttention() {
  return fetchJSON("/api/sites/attention");
}

export async function fetchSites() {
  return fetchJSON("/api/sites");
}

export async function fetchConfirmedSites() {
  return fetchJSON("/api/sites/confirmed");
}

export async function postCreateSite(details) {
  const res = await fetch("/api/sites", {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  if (!res.ok) throw new Error(`PATCH /api/sites/${id} → ${res.status}`);
  return res.json();
}

export async function fetchSiteTeam(siteId) {
  return fetchJSON(`/api/sites/${siteId}/team`);
}

/* `userId` set = the "choose from dropdown" path (name/phone come from the
   account server-side); omitted = legacy free-text entry. */
export async function postSiteTeamMember(siteId, userId) {
  const res = await fetch(`/api/sites/${siteId}/team`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST /api/sites/${siteId}/team → ${res.status}`);
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

export async function postEscalation(text, siteId) {
  const res = await fetch("/api/escalations", {
    method: "POST",
    headers: { "content-type": "application/json", "X-SBM-Key": SBM_KEY },
    body: JSON.stringify({ text, site_id: siteId || null }),
  });
  if (!res.ok) throw new Error(`POST /api/escalations → ${res.status}`);
  return res.json();
}

export async function closeEscalationApi(id) {
  const res = await fetch(`/api/escalations/${id}`, {
    method: "PATCH",
    headers: { "X-SBM-Key": SBM_KEY },
  });
  if (!res.ok) throw new Error(`PATCH /api/escalations/${id} → ${res.status}`);
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

export async function postCreateStaff(name, phone) {
  const res = await fetch("/api/staff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, phone: phone || null }),
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

export async function fetchSiteTimeline(siteId) {
  const res = await fetch(`/api/sites/${siteId}/timeline`);
  if (!res.ok) throw new Error(`GET /api/sites/${siteId}/timeline → ${res.status}`);
  return res.json();
}

/* Site-task workflow system — migration 0013. See WORKFLOW_CATEGORIES below
   for the tile grouping; these fetchers back the home-page workflow tiles,
   the admin "View work timeline" popup, and the staff mark-done/handoff flow. */

/** Home-page "Calls logged" tile — total count, including low_signal. */
export async function fetchCallsCount() {
  return fetchJSON("/api/calls/count");
}

/** Open (assigned, not done) site tasks — `staff` gets their own only, admin/superadmin get every one, scoped server-side. */
export async function fetchOpenSiteTasks() {
  return fetchJSON("/api/site-tasks/open");
}

/** All 23 stages for one site — the admin "View work timeline" popup. */
export async function fetchSiteTasks(siteId) {
  return fetchJSON(`/api/sites/${siteId}/tasks`);
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
  const res = await fetch(`/api/sites/${siteId}/installations`, {
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

/** Complaints list — staff (scoped) or admin (all). Session-only. */
export async function fetchComplaints() {
  const res = await fetch("/api/complaints", { credentials: "same-origin" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `GET /api/complaints → ${res.status}`);
  }
  return res.json();
}

/** Open complaints count — home tile. */
export async function fetchComplaintsCount() {
  const res = await fetch("/api/complaints/count", { credentials: "same-origin" });
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

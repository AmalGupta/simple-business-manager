/* Rank Callers Directory rows against the names/phones already known for
   a site — used by AssociateContactsModal so the + on Review sites opens
   with a short "Most likely matches" list instead of making the reviewer
   dig through ~3k clients by hand.

   Conservative on purpose (same stance as assignment.js): a confident wrong
   guess is worse than an empty suggestion list. Scores are relative ranks
   for sorting; only rows above MIN_SCORE surface. */

const MIN_SCORE = 40;
const DEFAULT_LIMIT = 5;

/** Strip punctuation / collapse whitespace for name compares. */
export function normalizeContactName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(normalized) {
  return normalized.split(" ").filter((w) => w.length >= 3);
}

/** Digits only — Indian numbers often differ by +91 / leading 0 / spaces. */
export function normalizePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

/**
 * True when a directory `name` is really just a phone number — Cube ACR
 * filenames that were digits-only land this way via findOrCreateCaller
 * (callerLabel = phone). Those rows aren't useful as site contacts until
 * someone gives them a real name.
 */
export function isPhoneLikeName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const digits = normalizePhone(raw);
  if (digits.length < 7) return false;
  const stripped = raw.replace(/[\s\-()+]/g, "");
  return /^\+?\d+$/.test(stripped);
}

/**
 * Needles the site already carries: discovering caller (shown on the
 * review row) and intake contact person / phone. Site name is left out —
 * place names like "Homeland" would noise-match directory rows.
 * Phone-as-name discovering callers are not used as name needles — they
 * match via phone instead so we don't treat "98765…" as a person name.
 */
export function needlesFromSite(site) {
  if (!site) return { names: [], phones: [] };
  const names = [];
  const phones = [];
  for (const raw of [site.discovered_from_caller_name, site.poc_name]) {
    if (isPhoneLikeName(raw)) continue;
    const n = normalizeContactName(raw);
    if (n && !names.includes(n)) names.push(n);
  }
  for (const raw of [site.poc_contact_number, site.discovered_from_caller_phone, site.discovered_from_caller_name]) {
    const p = normalizePhone(raw);
    if (p.length >= 7 && !phones.includes(p)) phones.push(p);
  }
  return { names, phones };
}

/**
 * The contact the review row is pointing at — discovering caller and/or
 * intake POC — used to decide whether to offer "Add a new contact".
 */
export function identifiedContactFromSite(site) {
  if (!site) return null;
  const phone =
    normalizePhone(site.poc_contact_number) ||
    normalizePhone(site.discovered_from_caller_phone) ||
    (isPhoneLikeName(site.discovered_from_caller_name) ? normalizePhone(site.discovered_from_caller_name) : "");
  const phoneDisplay =
    site.poc_contact_number?.trim() ||
    site.discovered_from_caller_phone?.trim() ||
    (isPhoneLikeName(site.discovered_from_caller_name) ? String(site.discovered_from_caller_name).trim() : "") ||
    "";

  if (site.poc_name?.trim() && !isPhoneLikeName(site.poc_name)) {
    return {
      label: site.poc_name.trim(),
      suggestedName: site.poc_name.trim(),
      phone: phone || "",
      phoneDisplay,
      callerId: site.discovered_from_caller_id ?? null,
    };
  }
  if (site.discovered_from_caller_name?.trim()) {
    const raw = site.discovered_from_caller_name.trim();
    return {
      label: raw,
      suggestedName: isPhoneLikeName(raw) ? "" : raw,
      phone: phone || "",
      phoneDisplay,
      callerId: site.discovered_from_caller_id ?? null,
    };
  }
  return null;
}

/**
 * When to show "Add a new contact" beside the identified contact:
 * - not_listed: no strong directory hit for that name
 * - phone_only: the discovering caller (or best phone hit) is stored as digits-only
 * Returns null when a real named contact already matches strongly.
 */
export function newContactOffer(site, callers, likelyMatches = []) {
  const identified = identifiedContactFromSite(site);
  if (!identified) return null;

  const phoneOnlyCaller =
    (site.discovered_from_caller_id &&
      (callers ?? []).find((c) => c.id === site.discovered_from_caller_id && isPhoneLikeName(c.name))) ||
    (identified.phone &&
      (callers ?? []).find(
        (c) =>
          isPhoneLikeName(c.name) &&
          normalizePhone(c.phone || c.name) &&
          (normalizePhone(c.phone || c.name) === identified.phone ||
            normalizePhone(c.phone || c.name).endsWith(identified.phone) ||
            identified.phone.endsWith(normalizePhone(c.phone || c.name)))
      )) ||
    null;

  if (phoneOnlyCaller || isPhoneLikeName(identified.label)) {
    return {
      reason: "phone_only",
      identified,
      existingCallerId: phoneOnlyCaller?.id ?? identified.callerId ?? null,
    };
  }

  const hasStrongNamed = (likelyMatches ?? []).some((m) => m.strong && !isPhoneLikeName(m.caller.name));
  if (hasStrongNamed) return null;

  return { reason: "not_listed", identified, existingCallerId: null };
}

function scoreAgainstNeedles(caller, needles) {
  const name = normalizeContactName(caller.name);
  if (!name) return 0;
  const phone = normalizePhone(caller.phone);
  const nameTokens = significantTokens(name);
  let best = 0;

  for (const needlePhone of needles.phones) {
    if (phone && (phone === needlePhone || phone.endsWith(needlePhone) || needlePhone.endsWith(phone))) {
      best = Math.max(best, 100);
    }
  }

  for (const needle of needles.names) {
    if (!needle) continue;
    if (name === needle) {
      best = Math.max(best, 95);
      continue;
    }
    if (name.includes(needle) || needle.includes(name)) {
      best = Math.max(best, 80);
      continue;
    }
    const needleTokens = significantTokens(needle);
    if (needleTokens.length === 0 || nameTokens.length === 0) continue;
    const shared = needleTokens.filter((t) => nameTokens.some((nt) => nt === t || nt.includes(t) || t.includes(nt)));
    if (shared.length === 0) continue;
    /* Prefer overlapping the longer of the two token sets so "Ram" vs a
       long directory name doesn't outrank a real two-token hit. */
    const coverage = shared.length / Math.max(needleTokens.length, nameTokens.length);
    if (coverage >= 0.5) best = Math.max(best, Math.round(40 + coverage * 40));
    else if (shared.some((t) => t.length >= 4)) best = Math.max(best, 45);
  }

  return best;
}

/** Strong enough that we pre-tick the row; reviewer can still untick. */
export function isStrongContactMatch(score) {
  return score >= 80;
}

/**
 * @param {object} site
 * @param {Array<{id: string, name: string, phone?: string|null}>} callers
 * @param {{ limit?: number, excludeIds?: Iterable<string> }} [opts]
 * @returns {Array<{ caller: object, score: number, strong: boolean }>}
 */
export function rankContactMatches(site, callers, opts = {}) {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const exclude = new Set(opts.excludeIds ?? []);
  const needles = needlesFromSite(site);
  if (needles.names.length === 0 && needles.phones.length === 0) return [];

  const ranked = [];
  for (const caller of callers ?? []) {
    if (!caller?.id || exclude.has(caller.id)) continue;
    const score = scoreAgainstNeedles(caller, needles);
    if (score < MIN_SCORE) continue;
    ranked.push({ caller, score, strong: isStrongContactMatch(score) });
  }
  ranked.sort((a, b) => b.score - a.score || a.caller.name.localeCompare(b.caller.name));
  return ranked.slice(0, limit);
}

/**
 * Match spoken / extracted site phrases to existing sites rows.
 * Prefer house+sector and unique sector hits; never invent a site here.
 */

export interface SiteMatchCandidate {
  id: string;
  name: string;
  site_name_being_used?: string | null;
  house_no?: string | null;
  sector?: string | null;
  is_confirmed?: string | null;
}

export interface SiteTokens {
  normalized: string;
  house: string | null;
  sector: string | null;
}

const HOUSE_PREFIX = /^(?:#|h\.?\s?no\.?|house\s?(?:no\.?|number)?)\s*/i;
const SECTOR_WORD = /\b(?:sector|sec\.?|सैक्टर)\s*[#:]?\s*(\d{1,4}[a-z]?)\b/i;
const HOUSE_WORD =
  /\b(?:h\.?\s?no\.?|house\s?(?:no\.?|number)?|#)\s*([a-z]?\d{1,6}[a-z]?)\b/i;
/** Bare "1818" near "sector" / "house" already handled; also "House 1818, Sector 80". */
const HOUSE_BEFORE_SECTOR = /\b(?:house|h\.?\s?no\.?|#)?\s*([a-z]?\d{1,6}[a-z]?)\s*[,/]?\s*(?:sector|sec\.?)/i;

export function normalizeSiteKey(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[|]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractHouseNo(text: string): string | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const fromPrefix = raw.replace(HOUSE_PREFIX, "").trim();
  const m1 = raw.match(HOUSE_WORD);
  if (m1?.[1]) return m1[1].toLowerCase();
  const m2 = raw.match(HOUSE_BEFORE_SECTOR);
  if (m2?.[1]) return m2[1].toLowerCase();
  /* Structured house_no field often "H.NO 1818" — digit after prefix. */
  const digits = fromPrefix.match(/^([a-z]?\d{1,6}[a-z]?)\b/i);
  if (digits?.[1] && /(?:h\.?\s?no|house|#)/i.test(raw)) return digits[1].toLowerCase();
  return null;
}

export function extractSectorNo(text: string): string | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const m = raw.match(SECTOR_WORD);
  if (m?.[1]) return m[1].toLowerCase();
  /* Structured sector field "SECTOR 80". */
  const bare = raw.match(/^\s*(?:sector|sec\.?)\s*[#:]?\s*(\d{1,4}[a-z]?)\s*$/i);
  if (bare?.[1]) return bare[1].toLowerCase();
  return null;
}

export function normalizeSiteTokens(text: string): SiteTokens {
  const normalized = normalizeSiteKey(text);
  return {
    normalized,
    house: extractHouseNo(text) ?? extractHouseNo(normalized),
    sector: extractSectorNo(text) ?? extractSectorNo(normalized),
  };
}

function candidateTokens(c: SiteMatchCandidate): SiteTokens {
  const blob = [c.name, c.site_name_being_used, c.house_no, c.sector].filter(Boolean).join(" ");
  const fromFields = {
    house: extractHouseNo(c.house_no ?? "") ?? extractHouseNo(blob),
    sector: extractSectorNo(c.sector ?? "") ?? extractSectorNo(blob),
  };
  const nameTok = normalizeSiteTokens(blob);
  return {
    normalized: normalizeSiteKey(c.name),
    house: fromFields.house ?? nameTok.house,
    sector: fromFields.sector ?? nameTok.sector,
  };
}

/**
 * Pure scorer — returns the best matching site id, or null if no high-confidence hit.
 * `allowTextFallback` enables matching from longer free text (todo body) with the
 * same confidence rules (house+sector or unique sector).
 */
export function pickExistingSiteId(
  spoken: string,
  candidates: SiteMatchCandidate[],
  opts: { allowWeakContains?: boolean } = {}
): string | null {
  const spokenTok = normalizeSiteTokens(spoken);
  if (!spokenTok.normalized && !spokenTok.house && !spokenTok.sector) return null;

  const usable = candidates.filter((c) => c.is_confirmed !== "N" && c.id && c.name);
  if (usable.length === 0) return null;

  const withTok = usable.map((c) => ({ c, t: candidateTokens(c) }));

  /* 1. Exact normalized name or display name. */
  const exact = withTok.filter(
    (x) =>
      (spokenTok.normalized &&
        (x.t.normalized === spokenTok.normalized ||
          normalizeSiteKey(x.c.site_name_being_used ?? "") === spokenTok.normalized ||
          normalizeSiteKey(x.c.name) === spokenTok.normalized)) ||
      false
  );
  if (exact.length === 1) return exact[0].c.id;
  if (exact.length > 1) {
    /* Prefer confirmed / shorter name. */
    const confirmed = exact.filter((x) => x.c.is_confirmed === "Y");
    const pool = confirmed.length > 0 ? confirmed : exact;
    return pool.sort((a, b) => a.c.name.length - b.c.name.length)[0].c.id;
  }

  /* 2. House + sector both present and unique. */
  if (spokenTok.house && spokenTok.sector) {
    const both = withTok.filter(
      (x) => x.t.house === spokenTok.house && x.t.sector === spokenTok.sector
    );
    if (both.length === 1) return both[0].c.id;
    if (both.length > 1) {
      const confirmed = both.filter((x) => x.c.is_confirmed === "Y");
      return (confirmed[0] ?? both[0]).c.id;
    }
  }

  /* 3. Sector-only when exactly one candidate has that sector. */
  if (spokenTok.sector) {
    const bySector = withTok.filter((x) => x.t.sector === spokenTok.sector);
    if (bySector.length === 1) return bySector[0].c.id;
  }

  /* 4. Unique contains — only for longer needles to avoid Sector 1 → 106. */
  if (opts.allowWeakContains && spokenTok.normalized.length >= 8) {
    const needle = spokenTok.normalized;
    const hits = withTok.filter((x) => {
      const hay = normalizeSiteKey([x.c.name, x.c.site_name_being_used].filter(Boolean).join(" "));
      if (!hay) return false;
      /* Require sector digit boundary when needle looks like "sector N". */
      if (/sector\s+\d/.test(needle)) {
        const sec = spokenTok.sector;
        if (sec && x.t.sector && x.t.sector !== sec) return false;
        if (sec && hay.includes(`sector ${sec}`) === false && hay.includes(sec) === false) {
          /* still allow if full needle is contained */
        }
      }
      return hay.includes(needle) || needle.includes(x.t.normalized);
    });
    if (hits.length === 1) return hits[0].c.id;
  }

  return null;
}

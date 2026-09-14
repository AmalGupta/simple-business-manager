import { normalizeCallerPhone } from "./caller-category";
import { SITE_CLIENT_SEPARATOR } from "./queries";
import { addSiteContacts, listCallers, listConfirmedSites } from "./queries";

/** Bare 10-digit Indian mobile — matches scripts/import_contacts.py. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

export function normalizeContactName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(normalized: string): string[] {
  return normalized.split(" ").filter((w) => w.length >= 3);
}

function isPhoneLikeLabel(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return false;
  const stripped = raw.replace(/[\s\-()+]/g, "");
  return /^\+?\d+$/.test(stripped);
}

function clientFromComposed(display: string | null | undefined): string | null {
  if (!display) return null;
  const i = display.indexOf(SITE_CLIENT_SEPARATOR);
  if (i < 0) return null;
  const tail = display.slice(i + SITE_CLIENT_SEPARATOR.length).trim();
  return tail || null;
}

function siteClientDisplayName(site: NeedleSite): string | null {
  const poc = site.poc_name?.trim();
  if (poc) return poc;
  return clientFromComposed(site.site_name_being_used);
}

function siteContextFields(site: NeedleSite & { name: string }) {
  const display = site.site_name_being_used?.trim() || null;
  return {
    site_display_name: display,
    client_name: siteClientDisplayName(site),
  };
}

export type SiteContactClientSource =
  | "poc_name"
  | "site_name_being_used"
  | "poc_contact_number"
  | "discovered_from_caller_name"
  | "discovered_from_caller_phone";

export interface SiteContactBackfillProposal {
  site_id: string;
  /** Roster / match key on the site row. */
  site_name: string;
  /** Composed one-liner: `<name> | CL. <client>` when present (see composeSiteNameBeingUsed). */
  site_display_name: string | null;
  /** Client on the confirmed site — `poc_name`, else the `| CL.` tail of the display name. */
  client_name: string | null;
  /** Needle text that drove matching (may differ from `client_name` when match was by phone). */
  client_label: string;
  client_source: SiteContactClientSource;
  caller_id: string | null;
  caller_name: string | null;
  caller_phone: string | null;
  match_score: number;
  status: "proposed" | "already_linked" | "no_match";
  linked_caller_names?: string;
}

interface NeedleSite {
  poc_name: string | null;
  poc_contact_number: string | null;
  discovered_from_caller_name: string | null;
  discovered_from_caller_phone: string | null;
  site_name_being_used: string | null;
}

function buildNeedles(site: NeedleSite): { names: string[]; phones: string[]; sources: Map<string, SiteContactClientSource> } {
  const names: string[] = [];
  const phones: string[] = [];
  const sources = new Map<string, SiteContactClientSource>();

  const addName = (raw: string | null | undefined, source: SiteContactClientSource) => {
    if (!raw?.trim() || isPhoneLikeLabel(raw)) return;
    const n = normalizeContactName(raw);
    if (!n || names.includes(n)) return;
    names.push(n);
    sources.set(n, source);
  };

  const addPhone = (raw: string | null | undefined, source: SiteContactClientSource) => {
    const p = normalizeIndianMobile(raw) ?? normalizeCallerPhone(raw);
    if (!p || phones.includes(p)) return;
    phones.push(p);
    sources.set(`phone:${p}`, source);
  };

  addName(site.poc_name, "poc_name");
  addName(clientFromComposed(site.site_name_being_used), "site_name_being_used");

  const pocNum = site.poc_contact_number?.trim();
  if (pocNum) {
    const asPhone = normalizeIndianMobile(pocNum);
    if (asPhone) addPhone(pocNum, "poc_contact_number");
    else addName(pocNum, "poc_contact_number");
  }

  addName(site.discovered_from_caller_name, "discovered_from_caller_name");
  addPhone(site.discovered_from_caller_phone, "discovered_from_caller_phone");

  return { names, phones, sources };
}

function scoreCaller(
  caller: { name: string; phone: string | null; category: string },
  needles: { names: string[]; phones: string[] }
): number {
  if (caller.category === "spam") return 0;
  const name = normalizeContactName(caller.name);
  if (!name) return 0;
  const phone = normalizeIndianMobile(caller.phone) ?? normalizeCallerPhone(caller.phone) ?? "";
  let best = 0;

  for (const needlePhone of needles.phones) {
    if (phone && (phone === needlePhone || phone.endsWith(needlePhone) || needlePhone.endsWith(phone))) {
      best = Math.max(best, 100);
    }
  }

  const nameTokens = significantTokens(name);
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
    const coverage = shared.length / Math.max(needleTokens.length, nameTokens.length);
    if (coverage >= 0.5) best = Math.max(best, Math.round(40 + coverage * 40));
    else if (shared.some((t) => t.length >= 4)) best = Math.max(best, 45);
  }
  return best;
}

function pickSourceForMatch(
  needles: ReturnType<typeof buildNeedles>,
  caller: { name: string; phone: string | null },
  score: number
): { label: string; source: SiteContactClientSource } {
  const phone =
    normalizeIndianMobile(caller.phone) ?? normalizeCallerPhone(caller.phone) ?? "";
  if (score >= 100 && phone) {
    const src = needles.sources.get(`phone:${phone}`) ?? "discovered_from_caller_phone";
    return { label: phone, source: src };
  }
  const callerNorm = normalizeContactName(caller.name);
  for (const n of needles.names) {
    if (callerNorm === n || callerNorm.includes(n) || n.includes(callerNorm)) {
      return { label: n, source: needles.sources.get(n) ?? "poc_name" };
    }
  }
  return { label: needles.names[0] ?? caller.name, source: "poc_name" };
}

export async function proposeSiteContactBackfill(db: D1Database): Promise<SiteContactBackfillProposal[]> {
  const [sites, callers] = await Promise.all([listConfirmedSites(db), listCallers(db)]);

  const linkedBySite = new Map<string, string[]>();
  const { results: linkRows } = await db
    .prepare(
      `SELECT cs.site_id, c.name AS name
       FROM caller_sites cs
       JOIN callers c ON c.id = cs.caller_id
       ORDER BY c.name ASC`
    )
    .all<{ site_id: string; name: string }>();
  for (const row of linkRows ?? []) {
    const list = linkedBySite.get(row.site_id) ?? [];
    list.push(row.name);
    linkedBySite.set(row.site_id, list);
  }

  const proposals: SiteContactBackfillProposal[] = [];

  for (const site of sites) {
    const linked = linkedBySite.get(site.id);
    if (linked?.length) {
      proposals.push({
        site_id: site.id,
        site_name: site.name,
        ...siteContextFields(site),
        client_label: siteClientDisplayName(site) ?? linked.join(", "),
        client_source: "poc_name",
        caller_id: null,
        caller_name: null,
        caller_phone: null,
        match_score: 100,
        status: "already_linked",
        linked_caller_names: linked.join(", "),
      });
      continue;
    }

    const needles = buildNeedles(site);
    if (needles.names.length === 0 && needles.phones.length === 0) {
      proposals.push({
        site_id: site.id,
        site_name: site.name,
        ...siteContextFields(site),
        client_label: siteClientDisplayName(site) ?? "—",
        client_source: "poc_name",
        caller_id: null,
        caller_name: null,
        caller_phone: null,
        match_score: 0,
        status: "no_match",
      });
      continue;
    }

    let best: { caller: (typeof callers)[0]; score: number } | null = null;
    for (const caller of callers) {
      const score = scoreCaller(caller, needles);
      if (score < 40) continue;
      if (!best || score > best.score || (score === best.score && caller.name.localeCompare(best.caller.name) < 0)) {
        best = { caller, score };
      }
    }

    if (!best) {
      proposals.push({
        site_id: site.id,
        site_name: site.name,
        ...siteContextFields(site),
        client_label: siteClientDisplayName(site) ?? "—",
        client_source: site.poc_name?.trim() ? "poc_name" : "site_name_being_used",
        caller_id: null,
        caller_name: null,
        caller_phone: null,
        match_score: 0,
        status: "no_match",
      });
      continue;
    }

    const { label, source } = pickSourceForMatch(needles, best.caller, best.score);
    proposals.push({
      site_id: site.id,
      site_name: site.name,
      ...siteContextFields(site),
      client_label: label,
      client_source: source,
      caller_id: best.caller.id,
      caller_name: best.caller.name,
      caller_phone: best.caller.phone,
      match_score: best.score,
      status: "proposed",
    });
  }

  proposals.sort((a, b) => {
    const rank = (s: SiteContactBackfillProposal["status"]) =>
      s === "proposed" ? 0 : s === "no_match" ? 1 : 2;
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return b.match_score - a.match_score || a.site_name.localeCompare(b.site_name);
  });

  return proposals;
}

export async function applySiteContactMappings(
  db: D1Database,
  items: { site_id: string; caller_id: string }[]
): Promise<{ applied: number; skipped: number }> {
  let applied = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const { site_id, caller_id } of items) {
    const key = `${site_id}:${caller_id}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    if (!site_id?.trim() || !caller_id?.trim()) {
      skipped++;
      continue;
    }
    await addSiteContacts(db, site_id, [caller_id]);
    applied++;
  }
  return { applied, skipped };
}

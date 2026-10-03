/* SBM-106 — admin "My pages": a named list of read-only admin views the admin
   picks for their own nav. Stored per admin in user_settings (key `my_pages`,
   JSON), so no migration. Views are referenced by catalog id; the web app maps
   each id to the screen it opens. Actions (Add complaint, Offboard…) are not
   catalog entries on purpose — pages are for reading. */

export const MY_PAGES_KEY = "my_pages";
export const MAX_MY_PAGES = 12;
export const MAX_VIEWS_PER_PAGE = 12;
export const MAX_PAGE_NAME_LENGTH = 40;

export interface MyPageViewDef {
  id: string;
  label: string;
  section: "work" | "complaints" | "staff" | "sites" | "calls";
}

export const MY_PAGE_VIEWS: readonly MyPageViewDef[] = [
  { id: "open-tasks", label: "Open tasks", section: "work" },
  { id: "task-audit", label: "Task audit", section: "work" },
  { id: "calls-needing-action", label: "Calls needing action", section: "work" },
  { id: "resolved-calls", label: "Resolved calls", section: "work" },
  { id: "complaints-open", label: "Complaints", section: "complaints" },
  { id: "staff-roster", label: "Roster", section: "staff" },
  { id: "staff-list", label: "Staff list", section: "staff" },
  { id: "offboarding", label: "Offboarding", section: "staff" },
  { id: "staff-directory", label: "Staff directory", section: "staff" },
  { id: "sites-attention", label: "Needing attention", section: "sites" },
  { id: "sites-directory", label: "Directory", section: "sites" },
  { id: "material-shortages", label: "Material shortages", section: "sites" },
  { id: "calls-logged", label: "Calls logged", section: "calls" },
  { id: "callers", label: "Contacts (callers)", section: "calls" },
];

export interface MyPage {
  id: string;
  name: string;
  views: string[];
}

const VIEW_IDS = new Set(MY_PAGE_VIEWS.map((v) => v.id));

export function isMyPageView(id: unknown): id is string {
  return typeof id === "string" && VIEW_IDS.has(id);
}

/** Lenient read of the stored value: anything malformed is dropped, never thrown. */
export function parseMyPages(raw: string | null | undefined): MyPage[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: MyPage[] = [];
  for (const p of parsed) {
    if (!p || typeof p !== "object") continue;
    const { id, name, views } = p as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string" || !Array.isArray(views)) continue;
    const cleanViews = views.filter(isMyPageView);
    out.push({ id, name, views: cleanViews });
    if (out.length >= MAX_MY_PAGES) break;
  }
  return out;
}

/** Strict validation for PUT: the whole list is replaced, so reject rather than drop. */
export function validateMyPages(input: unknown): { ok: true; pages: MyPage[] } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || !Array.isArray((input as { pages?: unknown }).pages)) {
    return { ok: false, error: "body must be { pages: [...] }" };
  }
  const list = (input as { pages: unknown[] }).pages;
  if (list.length > MAX_MY_PAGES) return { ok: false, error: `at most ${MAX_MY_PAGES} pages` };
  const seen = new Set<string>();
  const pages: MyPage[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "each page must be an object" };
    const { id, name, views } = raw as Record<string, unknown>;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, error: "invalid page id" };
    if (seen.has(id)) return { ok: false, error: "duplicate page id" };
    seen.add(id);
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return { ok: false, error: "every page needs a name" };
    if (trimmed.length > MAX_PAGE_NAME_LENGTH) return { ok: false, error: `page names are at most ${MAX_PAGE_NAME_LENGTH} characters` };
    if (!Array.isArray(views) || views.length === 0) return { ok: false, error: `"${trimmed}" needs at least one view` };
    if (views.length > MAX_VIEWS_PER_PAGE) return { ok: false, error: `at most ${MAX_VIEWS_PER_PAGE} views per page` };
    if (!views.every(isMyPageView)) return { ok: false, error: `"${trimmed}" has an unknown view` };
    if (new Set(views).size !== views.length) return { ok: false, error: `"${trimmed}" lists a view twice` };
    pages.push({ id, name: trimmed, views: views as string[] });
  }
  return { ok: true, pages };
}

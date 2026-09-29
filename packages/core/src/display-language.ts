/**
 * SBM-72 — the language staff screens are shown in. Staff are field and
 * factory workers, so Hindi is the default for them; admins default to
 * English. An admin sets it per staff member from that person's tab on the
 * admin home. Stored in user_settings under DISPLAY_LANGUAGE_KEY.
 */
export const DISPLAY_LANGUAGES = ["hi", "en", "pa"] as const;
export type DisplayLanguage = (typeof DISPLAY_LANGUAGES)[number];

export const DISPLAY_LANGUAGE_KEY = "display_language";

export function isDisplayLanguage(v: unknown): v is DisplayLanguage {
  return v === "hi" || v === "en" || v === "pa";
}

/** Stored choice if valid; otherwise Hindi for staff, English for everyone else. */
export function resolveDisplayLanguage(stored: string | null | undefined, role: string): DisplayLanguage {
  if (isDisplayLanguage(stored)) return stored;
  return role === "staff" ? "hi" : "en";
}

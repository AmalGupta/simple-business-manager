import { normalizeCallerPhone } from "./caller-category";

/**
 * True when a directory `name` is really just a phone number — Cube ACR
 * filenames that were digits-only land this way via findOrCreateCaller.
 * Keep in sync with web/src/lib/contactMatch.js `isPhoneLikeName`.
 */
export function isPhoneLikeCallerName(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 7) return false;
  const stripped = raw.replace(/[\s\-()+]/g, "");
  return /^\+?\d+$/.test(stripped);
}

/** Saved vs unsaved split for the Contacts directory (non-spam rows only). */
export function isUnsavedPhoneContact(name: string, phone: string | null | undefined): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  const normalizedPhone = normalizeCallerPhone(phone);
  if (normalizedPhone) {
    const normalizedName = normalizeCallerPhone(trimmed);
    if (normalizedName && normalizedName === normalizedPhone) return true;
  }
  return isPhoneLikeCallerName(trimmed);
}

/**
 * SQL fragment (references `callers.name` / `callers.phone`) — must match
 * `isUnsavedPhoneContact` for the Contacts saved/unsaved tabs.
 */
export const SQL_CALLER_UNSAVED_CONTACT = `(
  trim(callers.name) = ''
  OR (
    callers.phone IS NOT NULL
    AND replace(replace(replace(trim(callers.name), ' ', ''), '-', ''), '+', '')
      = replace(replace(replace(trim(callers.phone), ' ', ''), '-', ''), '+', '')
  )
  OR (
    length(
      replace(replace(replace(replace(replace(trim(callers.name), ' ', ''), '-', ''), '(', ''), ')', ''), '+', '')
    ) >= 7
    AND trim(callers.name) NOT GLOB '*[a-zA-Z]*'
    AND trim(callers.name) GLOB '*[0-9]*'
  )
)`;

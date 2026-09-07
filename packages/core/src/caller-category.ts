import type { CallerCategory } from "./types";

/** Canonical caller types shown in the Callers Directory filters. */
export const CALLER_CATEGORIES: readonly CallerCategory[] = ["spam", "client", "family", "staff"];

/**
 * Drive ingest skips only family and known-spam. Client and staff always
 * download to R2 and submit to Sarvam — marking someone client/staff must
 * never leave them on the skip path.
 */
export function shouldSkipDriveIngest(category: CallerCategory): boolean {
  return category === "family" || category === "spam";
}

/** Match Drive filename phone keys (strip spaces/dashes). */
export function normalizeCallerPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const phone = String(raw).replace(/[\s-]/g, "").trim();
  return phone || null;
}

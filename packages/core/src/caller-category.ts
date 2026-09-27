import type { CallerCategory } from "./types";

/** Canonical caller types shown in the Callers Directory Type dropdown / Add contact (alphabetical). */
export const CALLER_CATEGORIES: readonly CallerCategory[] = [
  "client",
  "dealer",
  "family",
  "relative",
  "spam",
  "staff",
  "supplier",
  "tech",
  "transporter",
  "vendor",
];

/** Display labels for Contacts Type column / Add contact. */
export const CALLER_CATEGORY_LABELS: Record<CallerCategory, string> = {
  client: "Client",
  dealer: "Dealer",
  family: "Family",
  relative: "Relative",
  spam: "Spam",
  staff: "Staff",
  supplier: "Supplier",
  tech: "Tech",
  transporter: "Transporter",
  vendor: "Vendor",
};

/**
 * Drive ingest skips personal/known-spam numbers. Business roles
 * (client/dealer/staff/vendor/supplier/transporter/tech) always download to R2
 * and submit to Sarvam.
 */
export function shouldSkipDriveIngest(category: CallerCategory): boolean {
  return category === "family" || category === "relative" || category === "spam";
}

/** Personal skips go to Archive; spam goes to the Spam Drive folder. */
export function driveSkipArchiveKind(category: CallerCategory): "archive" | "spam" {
  return category === "spam" ? "spam" : "archive";
}

/** Match Drive filename phone keys (strip spaces/dashes). */
export function normalizeCallerPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const phone = String(raw).replace(/[\s-]/g, "").trim();
  return phone || null;
}

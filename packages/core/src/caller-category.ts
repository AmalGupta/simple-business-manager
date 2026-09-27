import type { CallerCategory } from "./types";

/**
 * Canonical caller types, in the order the Contacts Type dropdown / Add
 * contact show them. `spam` stays valid (Mark as spam, Spam bookmark) but is
 * not a pickable type — see SELECTABLE_CALLER_CATEGORIES.
 */
export const CALLER_CATEGORIES: readonly CallerCategory[] = [
  "client",
  "supplier",
  "transporter",
  "office_staff",
  "service_staff",
  "family",
  "relative",
  "franchisee",
  "sales_associate",
  "brand_associate",
  "builder_project",
  "architect",
  "spam",
];

export const SELECTABLE_CALLER_CATEGORIES: readonly CallerCategory[] = CALLER_CATEGORIES.filter(
  (c) => c !== "spam"
);

/** Display labels for Contacts Type column / Add contact. */
export const CALLER_CATEGORY_LABELS: Record<CallerCategory, string> = {
  client: "Client",
  supplier: "Supplier",
  transporter: "Transporter",
  office_staff: "Office Staff",
  service_staff: "Service Staff",
  family: "Family",
  relative: "Relative",
  franchisee: "Franchisee",
  sales_associate: "Sales Associate",
  brand_associate: "Brand Associate",
  builder_project: "Builder / Project",
  architect: "Architect",
  spam: "Spam",
};

/** Staff types — choosing one triggers the staff login workflow. */
export const STAFF_CALLER_CATEGORIES: readonly CallerCategory[] = ["office_staff", "service_staff"];

export function isStaffCategory(category: string | null | undefined): boolean {
  return category === "office_staff" || category === "service_staff";
}

/** SQL list literal for `category IN ${SQL_STAFF_CATEGORIES}`. */
export const SQL_STAFF_CATEGORIES = `('office_staff', 'service_staff')`;

/**
 * Drive ingest skips personal/known-spam numbers. Business roles always
 * download to R2 and submit to Sarvam.
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

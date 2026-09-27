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

/**
 * Canonical key for an Indian number: bare 10 digits, with +91 / 91 / 0
 * prefixes, spaces, dashes and brackets stripped. NULL when the value isn't
 * one (foreign, short code, empty). The same number used to be stored as
 * "+919056066211", "09056066211" and "9056066211" on three separate contacts.
 */
export function canonicalPhoneKey(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

/**
 * SQL twin of canonicalPhoneKey for a phone column, so lookups match rows
 * stored in any format (older rows predate canonical writes).
 */
export function sqlPhoneKey(column: string): string {
  const d = `replace(replace(replace(replace(replace(replace(ifnull(${column}, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), '.', '')`;
  return `(CASE
    WHEN ${d} = '' OR ${d} GLOB '*[^0-9]*' THEN NULL
    WHEN length(${d}) = 10 THEN ${d}
    WHEN length(${d}) = 11 AND substr(${d}, 1, 1) = '0' THEN substr(${d}, 2)
    WHEN length(${d}) = 12 AND substr(${d}, 1, 2) = '91' THEN substr(${d}, 3)
  END)`;
}

/** What gets stored: the canonical 10 digits for an Indian number, otherwise
 *  the value with spaces/dashes stripped (foreign numbers, short codes). */
export function normalizeCallerPhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const key = canonicalPhoneKey(raw);
  if (key) return key;
  const phone = String(raw).replace(/[\s-]/g, "").trim();
  return phone || null;
}

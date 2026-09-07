/** Per-user product customization — registry of known preference keys. */

import type { UserRole } from "./types";

export type CustomizationKey = "inner_scrolls" | "horizontal_scrolls";

export type UserCustomization = {
  inner_scrolls: boolean;
  horizontal_scrolls: boolean;
};

type PrefDef = {
  key: CustomizationKey;
  default: boolean;
  /** Roles allowed to PATCH this key. */
  roles: readonly UserRole[];
  label: string;
  description: string;
};

export const CUSTOMIZATION_PREFS: readonly PrefDef[] = [
  {
    key: "inner_scrolls",
    default: false,
    roles: ["admin", "superadmin"],
    label: "Scroll inside cards & table",
    description: "Fixed-height call cards and a viewport-locked Calls table with their own vertical scrollbars.",
  },
  {
    key: "horizontal_scrolls",
    default: false,
    roles: ["admin", "superadmin"],
    label: "Scroll sideways for wide content",
    description: "When off, wide table cells and card text wrap instead of scrolling horizontally.",
  },
] as const;

export function defaultCustomization(): UserCustomization {
  const out = {} as UserCustomization;
  for (const pref of CUSTOMIZATION_PREFS) {
    out[pref.key] = pref.default;
  }
  return out;
}

/** Merge stored string values ("0"/"1") onto defaults. Unknown keys ignored. */
export function resolveCustomization(rows: { key: string; value: string }[]): UserCustomization {
  const out = defaultCustomization();
  for (const row of rows) {
    const pref = CUSTOMIZATION_PREFS.find((p) => p.key === row.key);
    if (!pref) continue;
    out[pref.key] = row.value === "1";
  }
  return out;
}

export function canSetCustomizationKey(role: string, key: string): boolean {
  const pref = CUSTOMIZATION_PREFS.find((p) => p.key === key);
  if (!pref) return false;
  return (pref.roles as readonly string[]).includes(role);
}

export function encodeCustomizationBool(value: boolean): string {
  return value ? "1" : "0";
}

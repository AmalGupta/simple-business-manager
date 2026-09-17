/** Per-user product customization — registry of known preference keys. */

import type { UserRole } from "./types";

export type CustomizationKey = "inner_scrolls" | "horizontal_scrolls" | "home_tile_order";

export type UserCustomization = {
  inner_scrolls: boolean;
  horizontal_scrolls: boolean;
  /** Saved admin home tile order; null/empty means use the client default. */
  home_tile_order: string[] | null;
};

type BoolPrefDef = {
  key: "inner_scrolls" | "horizontal_scrolls";
  kind: "boolean";
  default: boolean;
  roles: readonly UserRole[];
  label: string;
  description: string;
};

type StringArrayPrefDef = {
  key: "home_tile_order";
  kind: "string_array";
  default: null;
  roles: readonly UserRole[];
  label: string;
  description: string;
};

type PrefDef = BoolPrefDef | StringArrayPrefDef;

export const HOME_TILE_ORDER_MAX = 64;
export const HOME_TILE_ID_MAX_LEN = 64;

export const CUSTOMIZATION_PREFS: readonly PrefDef[] = [
  {
    key: "inner_scrolls",
    kind: "boolean",
    default: false,
    roles: ["admin", "superadmin"],
    label: "Scroll inside cards & table",
    description: "Fixed-height call cards and a viewport-locked Calls table with their own vertical scrollbars.",
  },
  {
    key: "horizontal_scrolls",
    kind: "boolean",
    default: false,
    roles: ["admin", "superadmin"],
    label: "Scroll sideways for wide content",
    description: "When off, wide table cells and card text wrap instead of scrolling horizontally.",
  },
  {
    key: "home_tile_order",
    kind: "string_array",
    default: null,
    roles: ["admin", "superadmin"],
    label: "Home tile order",
    description: "Per-user order of admin home dashboard tiles.",
  },
] as const;

export function defaultCustomization(): UserCustomization {
  return {
    inner_scrolls: false,
    horizontal_scrolls: false,
    home_tile_order: null,
  };
}

function decodeHomeTileOrder(raw: string): string[] | null {
  if (!raw || raw === "[]") return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
    return ids.length > 0 ? ids.slice(0, HOME_TILE_ORDER_MAX) : null;
  } catch {
    return null;
  }
}

/** Merge stored string values onto defaults. Unknown keys ignored. */
export function resolveCustomization(rows: { key: string; value: string }[]): UserCustomization {
  const out = defaultCustomization();
  for (const row of rows) {
    const pref = CUSTOMIZATION_PREFS.find((p) => p.key === row.key);
    if (!pref) continue;
    if (pref.kind === "boolean") {
      out[pref.key] = row.value === "1";
    } else if (pref.kind === "string_array") {
      out.home_tile_order = decodeHomeTileOrder(row.value);
    }
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

export function encodeHomeTileOrder(value: string[] | null): string {
  if (!value || value.length === 0) return "[]";
  return JSON.stringify(value.slice(0, HOME_TILE_ORDER_MAX));
}

/** Validate a PATCH body value for home_tile_order. Returns encoded storage string or an error message. */
export function validateHomeTileOrderValue(value: unknown): { ok: true; encoded: string } | { ok: false; error: string } {
  if (value === null) {
    return { ok: true, encoded: "[]" };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: "home_tile_order must be an array of strings or null" };
  }
  if (value.length > HOME_TILE_ORDER_MAX) {
    return { ok: false, error: `home_tile_order max length is ${HOME_TILE_ORDER_MAX}` };
  }
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || item.length > HOME_TILE_ID_MAX_LEN) {
      return { ok: false, error: `home_tile_order entries must be non-empty strings ≤${HOME_TILE_ID_MAX_LEN} chars` };
    }
    ids.push(item);
  }
  return { ok: true, encoded: encodeHomeTileOrder(ids) };
}

export function getCustomizationPref(key: string): PrefDef | undefined {
  return CUSTOMIZATION_PREFS.find((p) => p.key === key);
}

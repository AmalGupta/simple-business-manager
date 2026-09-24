// Match free-text todo.owner (from extraction) to a real staff account.
// Same conservative rules as web/src/lib/assignment.js — exact name, then
// substring either way, then exact contact-alias match. "self" never
// auto-assigns here (admin / uploaded_by decides in saveExtraction).

export function normalizeOwnerName(owner: string): string {
  const o = owner.trim().toLowerCase();
  if (o === "tanzeem") return "tanseem";
  return o;
}

export type OwnerAliasMatch = { alias: string; user_id: string; user_name?: string };

export function matchStaffByOwner<T extends { id: string; name: string }>(
  owner: string | null | undefined,
  staff: T[],
  aliasRows?: OwnerAliasMatch[]
): T | null {
  if (!owner) return null;
  const needle = normalizeOwnerName(owner);
  if (!needle || needle === "self") return null;

  if (staff.length) {
    const exact = staff.find((s) => normalizeOwnerName(s.name) === needle);
    if (exact) return exact;
    const substring =
      staff.find((s) => {
        const name = normalizeOwnerName(s.name);
        return needle.includes(name) || name.includes(needle);
      }) ?? null;
    if (substring) return substring;
  }

  if (!aliasRows?.length) return null;
  const hit = aliasRows.find((r) => normalizeOwnerName(r.alias) === needle);
  if (!hit) return null;
  const onRoster = staff.find((s) => s.id === hit.user_id);
  if (onRoster) return onRoster;
  /* Contact linked to a user who is not on the staff roster (e.g. role
     change) — still assign to that user id when we have it. */
  return { id: hit.user_id, name: hit.user_name ?? hit.user_id } as T;
}

// Match free-text todo.owner (from extraction) to a real staff account.
// Same conservative rules as web/src/lib/assignment.js — exact name, then
// substring either way. "self" never auto-assigns (admin decides).

export function normalizeOwnerName(owner: string): string {
  const o = owner.trim().toLowerCase();
  if (o === "tanzeem") return "tanseem";
  return o;
}

export function matchStaffByOwner<T extends { id: string; name: string }>(
  owner: string | null | undefined,
  staff: T[]
): T | null {
  if (!owner || !staff.length) return null;
  const needle = normalizeOwnerName(owner);
  if (!needle || needle === "self") return null;
  const exact = staff.find((s) => normalizeOwnerName(s.name) === needle);
  if (exact) return exact;
  return (
    staff.find((s) => {
      const name = normalizeOwnerName(s.name);
      return needle.includes(name) || name.includes(needle);
    }) ?? null
  );
}

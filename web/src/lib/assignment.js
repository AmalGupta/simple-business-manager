/* Suggests a staff match for a todo's free-text `owner` field (a name the
   extraction LLM wrote down, not a real account) against the real staff
   roster. Deliberately conservative — exact match, then substring match
   either direction — since there's no fuzzy-matching library in this repo
   and a confident-looking wrong guess is worse than an honest "no
   suggestion" for something an admin is about to act on.
   Keep in sync with packages/core/src/assignment.ts (server auto-assign). */
function normalizeOwnerName(owner) {
  const o = owner.trim().toLowerCase();
  if (o === "tanzeem") return "tanseem";
  return o;
}

export function suggestAssignee(ownerText, staffRoster) {
  if (!ownerText || !staffRoster?.length) return null;
  const needle = normalizeOwnerName(ownerText);
  if (!needle || needle === "self") return null;
  const exact = staffRoster.find((s) => normalizeOwnerName(s.name) === needle);
  if (exact) return exact;
  return (
    staffRoster.find((s) => {
      const name = normalizeOwnerName(s.name);
      return needle.includes(name) || name.includes(needle);
    }) ?? null
  );
}

/* Suggests a staff match for a todo's free-text `owner` field (a name the
   extraction LLM wrote down, not a real account) against the real staff
   roster. Deliberately conservative — exact match, then substring match
   either direction — since there's no fuzzy-matching library in this repo
   and a confident-looking wrong guess is worse than an honest "no
   suggestion" for something an admin is about to act on. */
export function suggestAssignee(ownerText, staffRoster) {
  if (!ownerText || ownerText.trim().toLowerCase() === "self" || !staffRoster?.length) return null;
  const needle = ownerText.trim().toLowerCase();
  const exact = staffRoster.find((s) => s.name.trim().toLowerCase() === needle);
  if (exact) return exact;
  return (
    staffRoster.find((s) => {
      const name = s.name.trim().toLowerCase();
      return needle.includes(name) || name.includes(needle);
    }) ?? null
  );
}

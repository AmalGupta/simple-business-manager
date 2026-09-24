/* Suggests a staff match for a todo's free-text `owner` field (a name the
   extraction LLM wrote down, not a real account) against the real staff
   roster. Deliberately conservative — exact match, then substring match
   either direction, then exact contact-alias match — since there's no
   fuzzy-matching library in this repo and a confident-looking wrong guess
   is worse than an honest "no suggestion" for something an admin is about
   to act on.
   Keep in sync with packages/core/src/assignment.ts (server auto-assign). */
function normalizeOwnerName(owner) {
  const o = owner.trim().toLowerCase();
  if (o === "tanzeem") return "tanseem";
  return o;
}

/**
 * @param {string|null|undefined} ownerText
 * @param {Array<{ id: string, name: string, aliases?: string[] }>} staffRoster
 * @param {Array<{ alias: string, user_id: string }>|undefined} aliasRows
 *   Optional flat alias list. Prefer staffRoster[].aliases when the roster
 *   was loaded from GET /api/staff/roster (already enriched).
 */
export function suggestAssignee(ownerText, staffRoster, aliasRows) {
  if (!ownerText || !staffRoster?.length) return null;
  const needle = normalizeOwnerName(ownerText);
  if (!needle || needle === "self") return null;
  const exact = staffRoster.find((s) => normalizeOwnerName(s.name) === needle);
  if (exact) return exact;
  const substring =
    staffRoster.find((s) => {
      const name = normalizeOwnerName(s.name);
      return needle.includes(name) || name.includes(needle);
    }) ?? null;
  if (substring) return substring;

  if (aliasRows?.length) {
    const hit = aliasRows.find((r) => normalizeOwnerName(r.alias) === needle);
    if (hit) {
      const onRoster = staffRoster.find((s) => s.id === hit.user_id);
      if (onRoster) return onRoster;
    }
  }

  return (
    staffRoster.find((s) =>
      (s.aliases ?? []).some((a) => normalizeOwnerName(a) === needle)
    ) ?? null
  );
}

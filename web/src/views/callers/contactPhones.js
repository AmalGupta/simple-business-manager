/** Every number a contact carries: main number first, then numbers it
 *  picked up by being merged (migration 0048). */
export function contactPhones(contact) {
  return [contact?.phone, ...(contact?.extra_phones ?? [])].filter(Boolean);
}

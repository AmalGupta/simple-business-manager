import { Phone } from "lucide-react";
import { t } from "../../theme.js";

/* The client contact behind a task, shown with its site on Task audit and
   the task timeline: the todo's linked client (todos.client_caller_id, set
   by the STT webhook), then every directory contact linked to the site
   (caller_sites, any type). Numbers are tel: links so the admin can ring
   them straight from the audit. */

/** Linked client first, then site contacts, without repeating one person. */
export function taskContacts({ client_id, client_name, client_phone, site_contacts }) {
  const out = [];
  const seen = new Set();
  const add = (id, name, phone) => {
    const key = id || phone || name;
    if (!name || seen.has(key) || (phone && seen.has(phone))) return;
    seen.add(key);
    if (phone) seen.add(phone);
    out.push({ key, name, phone: phone || null });
  };
  add(client_id, client_name, client_phone);
  for (const c of site_contacts ?? []) add(c.caller_id, c.name, c.phone);
  return out;
}

export function TaskContacts({ contacts, style }) {
  if (!contacts.length) return null;
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", fontSize: 11, color: t.edge2, ...style }}>
      {contacts.map((c) => (
        <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: t.edge, fontWeight: 600 }}>{c.name}</span>
          {c.phone ? (
            <a
              href={`tel:${c.phone.replace(/\s/g, "")}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                color: t.accent,
                textDecoration: "none",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <Phone size={10} />
              {c.phone}
            </a>
          ) : null}
        </span>
      ))}
    </span>
  );
}

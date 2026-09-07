import { useState, useEffect, useMemo, useRef } from "react";
import { Check, Search } from "lucide-react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import { fetchStaffRoster, fetchCallers } from "../../lib/api.js";

/* ------------------------------------------------------------------
   "Add people to this site" — two tabs over the site's two genuinely
   different people axes. Replaces AssignTeamModal, which was a
   single-select staff dropdown.

   The tabs are not cosmetic, and the info line under each one is the
   point of the split:

   - Staff writes site_team_members, and that row is what
     isUserAssignedToSite checks. Adding someone here really does grant
     them access to the site's timeline, media and voice notes, so the
     dialog says so out loud.
   - Contacts writes caller_sites. A contact is a Callers Directory row
     — a client, or someone calling on their behalf — with no login,
     so linking one grants nothing.

   Staff filters client-side (the roster is small enough to hold).
   Contacts searches server-side, because the directory is a ~3.3k-row
   phone-contacts import.
   ------------------------------------------------------------------ */

const CONTACT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;

const TABS = [
  {
    id: "staff",
    label: "Add staff",
    info: "Assigning staff gives them access to this site — its timeline, media and voice notes.",
  },
  {
    id: "contacts",
    label: "Add associated contact",
    info: "Clients, and people who call on behalf of a client. Contacts have no sign-in and get no access.",
  },
];

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      style={{
        flex: 1,
        minHeight: 36,
        padding: "0 10px",
        border: "none",
        borderBottom: `2px solid ${active ? t.accent : "transparent"}`,
        background: "none",
        color: active ? t.edge : t.edge2,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* One selectable person. `already` rows stay visible but inert — seeing
   "already on this site" is more useful than a name silently missing
   from search results the admin expected to find. */
function PersonRow({ name, meta, selected, already, onToggle }) {
  return (
    <button
      onClick={already ? undefined : onToggle}
      disabled={already}
      role="option"
      aria-selected={selected}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 4px",
        border: "none",
        borderBottom: `1px solid ${t.frost}`,
        background: "none",
        textAlign: "left",
        cursor: already ? "default" : "pointer",
        opacity: already ? 0.5 : 1,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `1px solid ${selected ? t.accent : t.frost}`,
          background: selected ? t.accent : t.white,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected && <Check size={12} color={t.white} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, color: t.edge }}>{name}</span>
        <span style={{ display: "block", fontSize: 12, color: t.edge2 }}>
          {already ? "already on this site" : meta}
        </span>
      </span>
    </button>
  );
}

export function AddPeopleModal({
  onClose,
  onAddStaff,
  onAddContacts,
  existingStaffUserIds = [],
  existingContactIds = [],
}) {
  const [tab, setTab] = useState("staff");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Selection is per-tab: switching tabs to check who's already linked
  // shouldn't quietly discard a selection made on the other one.
  const [staffSelected, setStaffSelected] = useState(() => new Set());
  const [contactsSelected, setContactsSelected] = useState(() => new Set());

  const [staff, setStaff] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [contactsTotal, setContactsTotal] = useState(0);

  const alreadyStaff = useMemo(() => new Set(existingStaffUserIds), [existingStaffUserIds]);
  const alreadyContacts = useMemo(() => new Set(existingContactIds), [existingContactIds]);

  const activeTab = TABS.find((x) => x.id === tab);
  const selected = tab === "staff" ? staffSelected : contactsSelected;
  const setSelected = tab === "staff" ? setStaffSelected : setContactsSelected;

  useEffect(() => {
    let cancelled = false;
    fetchStaffRoster()
      .then((data) => {
        if (!cancelled) setStaff(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        if (!cancelled) setStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Debounced server-side search. `seq` guards against a slow early
     response landing after a faster later one and repainting stale
     results — a plain cancelled flag doesn't cover out-of-order. */
  const seqRef = useRef(0);
  useEffect(() => {
    if (tab !== "contacts") return undefined;
    const mySeq = ++seqRef.current;
    const timer = setTimeout(() => {
      fetchCallers({ q: query.trim() || undefined, limit: CONTACT_PAGE_SIZE })
        .then((data) => {
          if (seqRef.current !== mySeq) return;
          setContacts(data.items);
          setContactsTotal(data.total);
        })
        .catch((err) => {
          console.error("[sbm] failed to search callers", err);
          if (seqRef.current !== mySeq) return;
          setContacts([]);
          setContactsTotal(0);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tab, query]);

  const visibleStaff = useMemo(() => {
    if (!staff) return null;
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((s) => s.name.toLowerCase().includes(q) || (s.phone ?? "").includes(q));
  }, [staff, query]);

  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const switchTab = (next) => {
    setTab(next);
    setQuery("");
    setError("");
  };

  const submit = async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      setError(tab === "staff" ? "Choose at least one staff member." : "Choose at least one contact.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (tab === "staff") await onAddStaff(ids);
      else await onAddContacts(ids);
      onClose();
    } catch (err) {
      console.error("[sbm] failed to add people to site", err);
      setError(err.message || "Failed to add — try again.");
    } finally {
      setSaving(false);
    }
  };

  const rows = tab === "staff" ? visibleStaff : contacts;
  const truncated = tab === "contacts" && contacts && contactsTotal > contacts.length;

  return (
    <Modal label="Add people to this site" title="Add people to this site" onClose={onClose} width={420}>
      <div role="tablist" style={{ display: "flex", borderBottom: `1px solid ${t.frost}` }}>
        {TABS.map((x) => (
          <TabButton key={x.id} active={tab === x.id} onClick={() => switchTab(x.id)}>
            {x.label}
          </TabButton>
        ))}
      </div>

      <p style={{ fontSize: 12, color: t.edge2, margin: 0, lineHeight: 1.45 }}>{activeTab.info}</p>

      <div style={{ position: "relative" }}>
        <Search
          size={14}
          color={t.edge2}
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "staff" ? "Search staff…" : "Search name or phone…"}
          style={{ ...TEXT_INPUT_STYLE, paddingLeft: 30 }}
        />
      </div>

      <div style={{ maxHeight: 260, overflowY: "auto", margin: "0 -4px" }}>
        {rows === null ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: "6px 4px" }}>Loading…</p>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: 13, color: t.edge2, margin: "6px 4px" }}>
            {tab === "staff"
              ? query
                ? "No staff match that search."
                : "No staff yet — add one from the Staff page first."
              : query
                ? "No contacts match that search."
                : "No contacts in the directory yet."}
          </p>
        ) : tab === "staff" ? (
          rows.map((s) => (
            <PersonRow
              key={s.id}
              name={s.name}
              meta={s.phone || "no phone on file yet"}
              selected={staffSelected.has(s.id)}
              already={alreadyStaff.has(s.id)}
              onToggle={() => toggle(s.id)}
            />
          ))
        ) : (
          rows.map((c) => (
            <PersonRow
              key={c.id}
              name={c.name}
              meta={[c.phone || "no phone", c.category].filter(Boolean).join(" · ")}
              selected={contactsSelected.has(c.id)}
              already={alreadyContacts.has(c.id)}
              onToggle={() => toggle(c.id)}
            />
          ))
        )}
      </div>

      {truncated && (
        <span style={{ fontSize: 12, color: t.edge2 }}>
          Showing {contacts.length} of {contactsTotal} — narrow the search to see the rest.
        </span>
      )}
      {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button
          onClick={onClose}
          style={{
            minHeight: 40,
            padding: "0 16px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            background: t.white,
            color: t.edge2,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving || selected.size === 0}
          style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving || selected.size === 0 ? 0.6 : 1 }}
        >
          {saving
            ? "Adding…"
            : selected.size === 0
              ? "Add"
              : tab === "staff"
                ? `Assign ${selected.size} staff`
                : `Add ${selected.size} contact${selected.size === 1 ? "" : "s"}`}
        </button>
      </div>
    </Modal>
  );
}

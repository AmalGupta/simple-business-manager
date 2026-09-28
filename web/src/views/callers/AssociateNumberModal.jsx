import { useEffect, useState } from "react";
import { t } from "../../theme.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import { fetchCallers, postAssociateCallerPhone } from "../../lib/api.js";
import { callerCategoryLabel } from "../../lib/callerCategories.js";
import { contactPhones } from "./contactPhones.js";

const SEARCH_DEBOUNCE_MS = 250;

const LABEL = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  color: t.edge2,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "0 0 6px",
};

/* A contact with no number (migration 0048): give it one, or fold it into
   another contact.
   - A number nobody has → saved on this contact.
   - A number an unsaved (number-only) contact has → that contact is merged
     into this one and leaves Unsaved contacts.
   - A number a named contact has → offered as a merge (onMerge).
   - "Or merge into a contact" searches clients and staff → onMerge. */
export function AssociateNumberModal({ caller, onClose, onSaved, onMerge }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [holder, setHolder] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all([
        fetchCallers({ bucket: "saved", q: term, limit: 8 }),
        fetchCallers({ bucket: "staff", q: term, limit: 8 }),
      ])
        .then(([saved, staff]) => {
          if (cancelled) return;
          const rows = [...(staff.items ?? []), ...(saved.items ?? [])].filter((c) => c.id !== caller.id);
          setResults(rows);
        })
        .catch((err) => console.error("[sbm] contact search failed", err));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, caller.id]);

  const saveNumber = async () => {
    setBusy(true);
    setError("");
    setHolder(null);
    try {
      const result = await postAssociateCallerPhone(caller.id, phone);
      onSaved?.(result);
    } catch (err) {
      if (err.status === 409 && err.existing) setHolder(err.existing);
      else setError(err.message || "Couldn't save the number — try again.");
      setBusy(false);
    }
  };

  return (
    <Modal label="Add number" title={caller.name} onClose={onClose} width={440} scroll>
      <p style={LABEL}>{caller.phone ? "Add another number" : "Phone number"}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setHolder(null);
          }}
          placeholder="e.g. 98765 43210"
          inputMode="tel"
          aria-label="Phone number"
          autoFocus
          style={{ ...TEXT_INPUT_STYLE, flex: 1, minHeight: 44 }}
        />
        <button
          type="button"
          onClick={saveNumber}
          disabled={busy || !phone.trim()}
          style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 44, opacity: busy || !phone.trim() ? 0.6 : 1 }}
        >
          {busy ? "Saving…" : "Save number"}
        </button>
      </div>
      <p style={{ fontSize: 12, color: t.edge2, margin: "6px 0 0" }}>
        If an unsaved contact already has this number, it's merged into {caller.name}.
      </p>
      {error && <p style={{ fontSize: 12, color: t.signal, margin: "8px 0 0" }}>{error}</p>}
      {holder && (
        <div style={{ marginTop: 10, padding: "10px 12px", border: `1px solid ${t.frost}`, borderRadius: t.radiusCard }}>
          <div style={{ fontSize: 13, color: t.edge }}>
            This number is already <strong>{holder.name}</strong>'s.
          </div>
          <button
            type="button"
            onClick={() => onMerge?.(holder)}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 36, marginTop: 8 }}
          >
            Merge with {holder.name}…
          </button>
        </div>
      )}

      <p style={{ ...LABEL, marginTop: 18 }}>Or merge into a contact</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search clients and staff by name or number"
        aria-label="Search contacts"
        style={{ ...TEXT_INPUT_STYLE, width: "100%", minHeight: 44, boxSizing: "border-box" }}
      />
      <div style={{ marginTop: 6 }}>
        {results.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onMerge?.(c)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              width: "100%",
              boxSizing: "border-box",
              ...TILE_ROW_STYLE,
              ...(i === 0 ? { borderTop: "none" } : {}),
            }}
          >
            <span style={{ fontSize: 14, color: t.edge, minWidth: 0 }}>{c.name}</span>
            <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>
              {contactPhones(c).join(" · ") || "no number"} · {callerCategoryLabel(c.category)}
            </span>
          </button>
        ))}
        {q.trim().length >= 2 && results.length === 0 && (
          <p style={{ fontSize: 12, color: t.edge2, margin: "6px 0 0" }}>No matching clients or staff.</p>
        )}
      </div>
    </Modal>
  );
}

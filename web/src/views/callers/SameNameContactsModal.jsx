import { useCallback, useEffect, useState } from "react";
import { t } from "../../theme.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import { fetchSameNameCallers } from "../../lib/api.js";
import { callerCategoryLabel } from "../../lib/callerCategories.js";
import { contactPhones } from "./contactPhones.js";

/* "Same name, different numbers" (migration 0048): named contacts sharing a
   name on different numbers. Some are one person on two phones, some are two
   different people — so nothing merges until the admin picks two and taps
   Merge (MergeContactsModal, via onMerge). */
export function SameNameContactsModal({ onClose, onMerge, refreshKey = 0 }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState({});

  const load = useCallback(() => {
    fetchSameNameCallers()
      .then((rows) => {
        setGroups(rows);
        setError("");
      })
      .catch((err) => setError(err.message || "Couldn't load contacts."));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const selectedFor = (g) => {
    const key = g.name.toLowerCase();
    return picked[key] ?? (g.contacts.length === 2 ? g.contacts.map((c) => c.id) : []);
  };

  const toggle = (g, id) => {
    const key = g.name.toLowerCase();
    const current = selectedFor(g);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id].slice(-2);
    setPicked((p) => ({ ...p, [key]: next }));
  };

  return (
    <Modal label="Same name, different numbers" title="Same name, different numbers" onClose={onClose} width={520} scroll>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 12px" }}>
        Contacts that share a name but have different numbers. Merge the ones that are the same person; leave the rest.
      </p>
      {error && <p style={{ fontSize: 13, color: t.signal }}>{error}</p>}
      {!groups && !error && <p style={{ fontSize: 13, color: t.edge2 }}>Loading…</p>}
      {groups && groups.length === 0 && <p style={{ fontSize: 13, color: t.edge2 }}>Nothing to review.</p>}
      {groups?.map((g) => {
        const selected = selectedFor(g);
        const pair = g.contacts.filter((c) => selected.includes(c.id));
        return (
          <div
            key={g.name.toLowerCase()}
            style={{ border: `1px solid ${t.frost}`, borderRadius: t.radiusCard, padding: "8px 12px", marginBottom: 10 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: t.edge }}>{g.name}</span>
              <button
                type="button"
                disabled={pair.length !== 2}
                onClick={() => onMerge?.(pair)}
                style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 36, opacity: pair.length === 2 ? 1 : 0.5 }}
              >
                Merge…
              </button>
            </div>
            {g.contacts.map((c, i) => (
              <label
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: t.edge,
                  ...TILE_ROW_STYLE,
                  ...(i === 0 ? { borderTop: "none" } : {}),
                }}
              >
                {g.contacts.length > 2 && (
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(g, c.id)} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  {contactPhones(c).join(" · ") || "no number"}
                  <span style={{ color: t.edge2 }}>
                    {" "}
                    · {callerCategoryLabel(c.category)}
                    {c.staff_user_name ? ` · login ${c.staff_user_name}` : ""}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>{c.calls} calls</span>
              </label>
            ))}
            {g.contacts.length > 2 && (
              <p style={{ fontSize: 11, color: t.edge2, margin: "4px 0 0" }}>Tick two to merge; repeat for the rest.</p>
            )}
          </div>
        );
      })}
    </Modal>
  );
}

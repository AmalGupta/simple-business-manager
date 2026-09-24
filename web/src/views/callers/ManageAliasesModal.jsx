import { useState, useEffect, useCallback } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import { fetchCallerAliases, postCallerAlias, deleteCallerAlias } from "../../lib/api.js";

/* Manage spoken-name aliases for one contact. Aliases feed extraction /
   auto-assign when the contact is linked to a staff account. */
export function ManageAliasesModal({ caller, onClose, onChanged }) {
  const [items, setItems] = useState(null);
  const [staffUserId, setStaffUserId] = useState(caller.staff_user_id ?? null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    return fetchCallerAliases(caller.id)
      .then((data) => {
        setItems(data.items ?? []);
        setStaffUserId(data.staff_user_id ?? null);
      })
      .catch((err) => {
        console.error("[sbm] failed to load aliases", err);
        setError("Failed to load aliases — try again.");
        setItems([]);
      });
  }, [caller.id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const alias = draft.trim();
    if (!alias) {
      setError("Enter an alias.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await postCallerAlias(caller.id, alias);
      setDraft("");
      await load();
      onChanged?.();
    } catch (err) {
      console.error("[sbm] failed to add alias", err);
      setError(err.message || "Failed to add alias — try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (aliasId) => {
    setBusy(true);
    setError("");
    try {
      await deleteCallerAlias(caller.id, aliasId);
      await load();
      onChanged?.();
    } catch (err) {
      console.error("[sbm] failed to remove alias", err);
      setError(err.message || "Failed to remove alias — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label="Manage aliases" title={`Aliases — ${caller.name}`} onClose={onClose} width={400} scroll>
      <p style={{ margin: 0, fontSize: 13, color: t.edge2, lineHeight: 1.45 }}>
        Spoken names that should resolve to this contact during todo auto-assign.
        {staffUserId
          ? " Auto-assign uses the linked staff account."
          : " Link a staff account on this contact for auto-assign; aliases can still be stored without one."}
      </p>

      {!staffUserId && (
        <p style={{ margin: 0, fontSize: 12, color: t.edge2, lineHeight: 1.4 }}>
          This contact has no linked staff account — matching an alias will leave the todo unassigned.
        </p>
      )}

      {error && <p style={{ margin: 0, fontSize: 12, color: t.signal }}>{error}</p>}

      {items === null ? (
        <p style={{ margin: 0, fontSize: 13, color: t.edge2 }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: t.edge2 }}>No aliases yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((row) => (
            <li
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "8px 0",
                borderBottom: `1px solid ${t.frost}`,
              }}
            >
              <span style={{ fontSize: 14, color: t.edge }}>{row.alias}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(row.id)}
                style={{ ...SMALL_SECONDARY_BUTTON_STYLE, opacity: busy ? 0.6 : 1 }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add alias…"
          disabled={busy}
          style={{ ...TEXT_INPUT_STYLE, flex: 1 }}
          aria-label="New alias"
        />
        <button
          type="button"
          disabled={busy}
          onClick={add}
          style={{ ...PRIMARY_BUTTON_STYLE, opacity: busy ? 0.6 : 1, flexShrink: 0 }}
        >
          Add
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{ ...SMALL_SECONDARY_BUTTON_STYLE, alignSelf: "flex-end" }}
      >
        Done
      </button>
    </Modal>
  );
}

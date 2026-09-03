import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_ROW_STYLE } from "../../styles.js";
import { fetchCallers, postCreateCaller, patchCaller } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { AddCallerModal } from "./AddCallerModal.jsx";

const CATEGORY_OPTIONS = [
  { value: "client", label: "Client" },
  { value: "staff", label: "Staff" },
  { value: "family", label: "Family" },
  { value: "spam", label: "Spam" },
];

const CATEGORY_SELECT_STYLE = {
  minHeight: 32,
  padding: "0 8px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

/* Callers Directory — admin/superadmin only (migration 0021). Every caller
   the pipeline has seen (or an admin has seeded directly), classified
   family/staff/client/spam so ingestion can gate on it and reporting can
   later segregate calls by who they're from. Same list-view template as
   StaffDirectoryView: null -> loading, [] -> empty Card, else -> list;
   load() re-fetched after every mutation rather than patched optimistically. */
export function CallersDirectoryView({ onBack }) {
  const [callers, setCallers] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    return fetchCallers()
      .then((data) => setCallers(data))
      .catch((err) => {
        console.error("[sbm] failed to load callers", err);
        setCallers([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeCategory = async (id, category) => {
    setBusyId(id);
    setError("");
    try {
      await patchCaller(id, { category });
      await load();
    } catch (err) {
      console.error("[sbm] failed to update caller category", err);
      setError("Failed to update category — try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Callers</h1>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            border: `1px solid ${t.frost}`,
            borderRadius: t.radiusButton,
            background: t.white,
            color: t.edge,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <Plus size={14} /> Add caller
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: t.signal, marginTop: 0 }}>{error}</p>}

      {callers === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : callers.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No callers yet.</p>
        </Card>
      ) : (
        <Card>
          {callers.map((c) => {
            const busy = busyId === c.id;
            return (
              <div key={c.id} style={{ ...TILE_ROW_STYLE, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, color: t.edge, fontWeight: 600 }}>{c.name}</span>
                  <select
                    value={c.category}
                    disabled={busy}
                    onChange={(e) => changeCategory(c.id, e.target.value)}
                    style={{ ...CATEGORY_SELECT_STYLE, opacity: busy ? 0.6 : 1 }}
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <span style={{ fontSize: 13, color: t.edge2 }}>{c.phone || "No phone"}</span>
                {c.category === "staff" && c.staff_user_name && (
                  <span style={{ fontSize: 12, color: t.edge2 }}>Linked to {c.staff_user_name}</span>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {showAddModal && (
        <AddCallerModal
          onClose={() => setShowAddModal(false)}
          onCreate={async (input) => {
            const created = await postCreateCaller(input);
            await load();
            return created;
          }}
        />
      )}
    </div>
  );
}

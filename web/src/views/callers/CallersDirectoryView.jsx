import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { t } from "../../theme.js";
import { fetchCallers, postCreateCaller, patchCaller } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { AddCallerModal } from "./AddCallerModal.jsx";
import "./CallersDirectoryView.css";

const CATEGORY_OPTIONS = [
  { value: "spam", label: "Spam" },
  { value: "client", label: "Client" },
  { value: "family", label: "Family" },
  { value: "staff", label: "Staff" },
];

const CATEGORY_SELECT_STYLE = {
  minHeight: 32,
  width: "100%",
  maxWidth: 120,
  padding: "0 8px",
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const EMPTY_COUNTS = { spam: 0, client: 0, family: 0, staff: 0 };

/* Callers Directory — admin/superadmin. Table (desktop + mobile) with top
   category filters. Scroll follows global Site customization prefs.
   Client/staff categories are processed by Drive ingest (not skipped). */
export function CallersDirectoryView({ onBack, innerScrolls = false }) {
  const [category, setCategory] = useState("client");
  const [callers, setCallers] = useState(null);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback((cat) => {
    return fetchCallers({ category: cat })
      .then((data) => {
        setCallers(data.items ?? []);
        setCounts({ ...EMPTY_COUNTS, ...(data.counts ?? {}) });
      })
      .catch((err) => {
        console.error("[sbm] failed to load callers", err);
        setCallers([]);
      });
  }, []);

  useEffect(() => {
    setCallers(null);
    load(category);
  }, [category, load]);

  const changeCategory = async (id, nextCategory) => {
    setBusyId(id);
    setError("");
    try {
      await patchCaller(id, { category: nextCategory });
      await load(category);
    } catch (err) {
      console.error("[sbm] failed to update caller category", err);
      setError("Failed to update category — try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="sbm-callers-page" style={innerScrolls ? { height: "100%" } : undefined}>
      <div style={{ flexShrink: 0 }}>
        <BackLink onClick={onBack}>Back</BackLink>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem", gap: 12 }}>
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

        <div
          role="tablist"
          aria-label="Caller type"
          style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "0.75rem" }}
        >
          {CATEGORY_OPTIONS.map((opt) => {
            const selected = category === opt.value;
            const count = counts[opt.value] ?? 0;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setCategory(opt.value)}
                style={{
                  padding: "7px 12px",
                  border: `1px solid ${selected ? t.accent : t.frost}`,
                  borderRadius: t.radiusButton,
                  background: selected ? t.accent : t.white,
                  color: selected ? t.white : t.edge,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: t.body,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label}
                <span style={{ marginLeft: 6, opacity: selected ? 0.9 : 0.65 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {error && <p style={{ fontSize: 12, color: t.signal, marginTop: 0 }}>{error}</p>}
      </div>

      {callers === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : callers.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center", flexShrink: 0 }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No {category} callers yet.</p>
        </Card>
      ) : (
        <div className="sbm-callers-table-wrap" role="region" aria-label="Callers table">
          <table className="sbm-callers-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Phone</th>
                <th scope="col">Type</th>
                <th scope="col">Staff link</th>
              </tr>
            </thead>
            <tbody>
              {callers.map((c) => {
                const busy = busyId === c.id;
                return (
                  <tr key={c.id}>
                    <td className="sbm-callers-col-name">{c.name}</td>
                    <td className="sbm-callers-col-phone">{c.phone || "—"}</td>
                    <td className="sbm-callers-col-category">
                      <select
                        value={c.category}
                        disabled={busy}
                        aria-label={`Type for ${c.name}`}
                        onChange={(e) => changeCategory(c.id, e.target.value)}
                        style={{ ...CATEGORY_SELECT_STYLE, opacity: busy ? 0.6 : 1 }}
                      >
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="sbm-callers-col-link">
                      {c.category === "staff" && c.staff_user_name ? c.staff_user_name : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddCallerModal
          onClose={() => setShowAddModal(false)}
          onCreate={async (input) => {
            const created = await postCreateCaller(input);
            if (input.category && input.category !== category) {
              setCategory(input.category);
            } else {
              await load(category);
            }
            return created;
          }}
        />
      )}
    </div>
  );
}

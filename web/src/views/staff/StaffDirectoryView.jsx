import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { t } from "../../theme.js";
import { TILE_ROW_STYLE, TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { fetchStaff, patchStaffPhone, postResetStaffPin, postCreateStaff, postReactivateStaff } from "../../lib/api.js";
import { fmtShort, todayIso } from "../../lib/dates.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { AddStaffModal } from "./AddStaffModal.jsx";
import { DeleteStaffModal } from "./DeleteStaffModal.jsx";

/* ------------------------------------------------------------------
   Staff — admin/superadmin only (migration 0011). Lists every `staff`
   account plus the viewer's own row ("or himself" — see docs). PINs come
   back decrypted from GET /api/staff and are masked client-side behind a
   per-row reveal toggle; a null pin means the account predates reversible
   storage and needs a reset before it's viewable.

   SBM-64: each row shows when the person joined (or joins), a "Leaving"
   badge while they serve notice, and people who have left move to a
   Former staff section with a Reactivate action.
   ------------------------------------------------------------------ */

function StaffStatusLine({ s }) {
  const today = todayIso();
  const parts = [];
  if (s.joined_on) parts.push(s.joined_on > today ? `Joins ${fmtShort(s.joined_on)}` : `Joined ${fmtShort(s.joined_on)}`);
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: t.edge2 }}>
      {parts.join(" · ")}
      {s.last_working_day && (
        <span style={{ fontWeight: 700, color: t.putty, background: t.puttyBg, borderRadius: t.radius, padding: "2px 6px" }}>
          Leaving {fmtShort(s.last_working_day)}
        </span>
      )}
    </span>
  );
}
export function StaffDirectoryView({ onBack }) {
  const [staff, setStaff] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [revealed, setRevealed] = useState(new Set());
  const [phoneDrafts, setPhoneDrafts] = useState({});
  const [confirmingResetId, setConfirmingResetId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reactivate = async (s) => {
    setBusyId(s.id);
    setError("");
    try {
      await postReactivateStaff(s.id);
      setNotice(`${s.name} is back — their login works again.`);
      await load();
    } catch (err) {
      console.error("[sbm] failed to reactivate", err);
      setError(err.message || "Failed to reactivate — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const load = useCallback(() => {
    return fetchStaff()
      .then((data) => setStaff(data))
      .catch((err) => {
        console.error("[sbm] failed to load staff", err);
        setStaff([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleReveal = (id) =>
    setRevealed((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const savePhone = async (id) => {
    const phone = phoneDrafts[id] ?? "";
    setBusyId(id);
    setError("");
    try {
      await patchStaffPhone(id, phone.trim());
      setPhoneDrafts((d) => {
        const { [id]: _drop, ...rest } = d;
        return rest;
      });
      await load();
    } catch (err) {
      console.error("[sbm] failed to save phone", err);
      setError("Failed to save phone — try again.");
    } finally {
      setBusyId(null);
    }
  };

  const resetPin = async (id) => {
    if (confirmingResetId !== id) {
      setConfirmingResetId(id);
      return;
    }
    setConfirmingResetId(null);
    setBusyId(id);
    setError("");
    try {
      await postResetStaffPin(id);
      setRevealed((s) => new Set(s).add(id));
      await load();
    } catch (err) {
      console.error("[sbm] failed to reset pin", err);
      setError("Failed to reset PIN — try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.25rem", gap: 12 }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>Staff</h1>
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
          <Plus size={14} /> Add staff
        </button>
      </div>

      {error && <p style={{ fontSize: 12, color: t.signal, marginTop: 0 }}>{error}</p>}
      {notice && <p style={{ fontSize: 12, color: t.edge2, marginTop: 0 }}>{notice}</p>}

      {staff === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : staff.length === 0 ? (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No staff yet.</p>
        </Card>
      ) : (
        <Card>
          {staff.filter((s) => !s.disabled_at).map((s) => {
            const draft = phoneDrafts[s.id] ?? s.phone ?? "";
            const dirty = draft !== (s.phone ?? "");
            const isRevealed = revealed.has(s.id);
            const busy = busyId === s.id;
            const canDelete = s.role === "staff" && !s.is_self;
            return (
              <div key={s.id} style={{ ...TILE_ROW_STYLE, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, color: t.edge, fontWeight: 600 }}>
                    {s.name}
                    {s.is_self && <span style={{ fontWeight: 400, color: t.edge2 }}> (you)</span>}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: t.edge2, textTransform: "capitalize" }}>{s.role}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setNotice("");
                          setDeleting(s);
                        }}
                        disabled={busy}
                        style={{
                          border: "none",
                          background: "none",
                          color: t.signal,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </span>
                </div>
                {s.role === "staff" && <StaffStatusLine s={s} />}

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    placeholder="Phone"
                    value={draft}
                    onChange={(e) => setPhoneDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                    style={{ ...TEXT_INPUT_STYLE, minHeight: 34, fontSize: 13, flex: 1 }}
                  />
                  {dirty && (
                    <button
                      onClick={() => savePhone(s.id)}
                      disabled={busy}
                      style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 34, padding: "0 12px", fontSize: 12, opacity: busy ? 0.6 : 1 }}
                    >
                      Save
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: t.edge2, fontVariantNumeric: "tabular-nums" }}>
                    PIN: {s.pin ? (isRevealed ? s.pin : "••••") : "not recoverable"}
                  </span>
                  {s.pin && (
                    <button
                      onClick={() => toggleReveal(s.id)}
                      style={{ border: "none", background: "none", color: t.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
                    >
                      {isRevealed ? "Hide" : "Show"}
                    </button>
                  )}
                  <button
                    onClick={() => resetPin(s.id)}
                    disabled={busy}
                    style={{ border: "none", background: "none", color: t.edge2, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, opacity: busy ? 0.6 : 1 }}
                  >
                    {confirmingResetId === s.id ? "Click again to confirm" : "Reset PIN"}
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {staff?.some((s) => s.disabled_at) && (
        <>
          <p
            style={{
              fontFamily: t.label,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: t.edge2,
              margin: "1.5rem 0 6px",
            }}
          >
            Former staff
          </p>
          <Card>
            {staff
              .filter((s) => s.disabled_at)
              .map((s, i) => (
                <div
                  key={s.id}
                  style={{ ...TILE_ROW_STYLE, ...(i === 0 ? { borderTop: "none" } : {}), display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 14, color: t.edge2, fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: t.edge2 }}>
                      {s.joined_on ? `${fmtShort(s.joined_on)} – ` : "Left "}
                      {fmtShort(s.last_working_day ?? s.disabled_at.slice(0, 10))}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => reactivate(s)}
                    disabled={busyId === s.id}
                    style={{ border: "none", background: "none", color: t.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, minHeight: 44 }}
                  >
                    Reactivate
                  </button>
                </div>
              ))}
          </Card>
        </>
      )}

      {showAddModal && (
        <AddStaffModal
          onClose={() => setShowAddModal(false)}
          onCreate={async (name, phone, joinedOn) => {
            const created = await postCreateStaff(name, phone, joinedOn);
            await load();
            setRevealed((s) => new Set(s).add(created.id));
            return created;
          }}
        />
      )}

      {deleting && (
        <DeleteStaffModal
          staffUser={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async (result) => {
            await load();
            if (result?.created?.pin) {
              setNotice(
                `Created ${result.created.name} with PIN ${result.created.pin}. Deleted the old login.`
              );
              setRevealed((s) => new Set(s).add(result.created.id));
            } else {
              setNotice(`Deleted ${deleting.name}.`);
            }
          }}
        />
      )}
    </div>
  );
}

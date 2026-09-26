import { useState, useEffect, useMemo } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import {
  patchCaller,
  postSiteContacts,
  deleteSiteContact,
  fetchCallerAliases,
  postCallerAlias,
  deleteCallerAlias,
  loadConfirmedSites,
} from "../../lib/api.js";
import { siteDisplayName, siteSearchText } from "../sites/sitesGridChrome.jsx";

const TYPE_OPTIONS = [
  { value: "client", label: "Client" },
  { value: "vendor", label: "Vendor" },
  { value: "supplier", label: "Supplier" },
  { value: "transporter", label: "Transporter" },
  { value: "tech", label: "Tech" },
  { value: "staff", label: "Staff" },
  { value: "family", label: "Family" },
  { value: "relative", label: "Relative" },
  { value: "spam", label: "Spam" },
];

const LABEL = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  color: t.edge2,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

/**
 * Edit one Contacts directory row: name, phone, type, linked confirmed sites,
 * and aliases (multiple).
 */
export function EditContactModal({ caller, onClose, onSaved, onRequestPromote }) {
  const [name, setName] = useState(caller.name ?? "");
  const [phone, setPhone] = useState(caller.phone ?? "");
  const [category, setCategory] = useState(
    TYPE_OPTIONS.some((o) => o.value === caller.category) ? caller.category : "client"
  );
  const [linkedSites, setLinkedSites] = useState(() => [...(caller.linked_sites ?? [])]);
  const [confirmedSites, setConfirmedSites] = useState(null);
  const [sitePickId, setSitePickId] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [aliases, setAliases] = useState([]);
  const [aliasDraft, setAliasDraft] = useState("");
  const [initialAliasIds, setInitialAliasIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadConfirmedSites()
      .then((rows) => {
        if (!cancelled) setConfirmedSites(Array.isArray(rows) ? rows : rows?.items ?? []);
      })
      .catch((err) => {
        console.error("[sbm] failed to load confirmed sites", err);
        if (!cancelled) setConfirmedSites([]);
      });
    fetchCallerAliases(caller.id)
      .then((data) => {
        if (cancelled) return;
        const items = data.items ?? [];
        setAliases(items.map((a) => ({ id: a.id, alias: a.alias })));
        setInitialAliasIds(items.map((a) => a.id));
      })
      .catch((err) => {
        console.error("[sbm] failed to load aliases", err);
        if (!cancelled) {
          setAliases((caller.aliases ?? []).map((a, i) => ({ id: `tmp-${i}`, alias: a, local: true })));
          setInitialAliasIds([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caller.id, caller.aliases]);

  const linkedIds = useMemo(() => new Set(linkedSites.map((s) => s.id)), [linkedSites]);

  const siteChoices = useMemo(() => {
    const q = siteFilter.trim().toLowerCase();
    const rows = (confirmedSites ?? []).filter((s) => !linkedIds.has(s.id));
    if (!q) return rows.slice(0, 80);
    return rows.filter((s) => siteSearchText(s).includes(q)).slice(0, 80);
  }, [confirmedSites, linkedIds, siteFilter]);

  const addSite = () => {
    if (!sitePickId) return;
    const site = (confirmedSites ?? []).find((s) => s.id === sitePickId);
    if (!site || linkedIds.has(site.id)) return;
    setLinkedSites((prev) => [
      ...prev,
      {
        id: site.id,
        name: site.name,
        site_name_being_used: site.site_name_being_used ?? null,
      },
    ]);
    setSitePickId("");
    setSiteFilter("");
  };

  const removeSite = (siteId) => {
    setLinkedSites((prev) => prev.filter((s) => s.id !== siteId));
  };

  const addAlias = () => {
    const alias = aliasDraft.trim();
    if (!alias) {
      setError("Enter an alias.");
      return;
    }
    if (aliases.some((a) => a.alias.toLowerCase() === alias.toLowerCase())) {
      setError("That alias is already listed.");
      return;
    }
    setError("");
    setAliases((prev) => [...prev, { id: `new-${Date.now()}`, alias, local: true }]);
    setAliasDraft("");
  };

  const removeAlias = (id) => {
    setAliases((prev) => prev.filter((a) => a.id !== id));
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const originalSiteIds = new Set((caller.linked_sites ?? []).map((s) => s.id));
      const nextSiteIds = new Set(linkedSites.map((s) => s.id));

      await patchCaller(caller.id, {
        name: trimmed,
        phone: phone.trim() || null,
        category,
      });

      for (const siteId of nextSiteIds) {
        if (!originalSiteIds.has(siteId)) {
          await postSiteContacts(siteId, [caller.id]);
        }
      }
      for (const siteId of originalSiteIds) {
        if (!nextSiteIds.has(siteId)) {
          await deleteSiteContact(siteId, caller.id);
        }
      }

      const keptRemoteIds = new Set(aliases.filter((a) => !a.local && a.id).map((a) => a.id));
      for (const id of initialAliasIds) {
        if (!keptRemoteIds.has(id)) {
          await deleteCallerAlias(caller.id, id);
        }
      }
      for (const row of aliases) {
        if (row.local && row.alias?.trim()) {
          await postCallerAlias(caller.id, row.alias.trim());
        }
      }

      const becameStaff = category === "staff" && caller.category !== "staff";
      const needsLogin = category === "staff" && !caller.staff_user_name && !caller.staff_user_id;
      await onSaved?.();
      onClose();
      if ((becameStaff || needsLogin) && onRequestPromote) {
        await onRequestPromote(caller.id);
      }
    } catch (err) {
      console.error("[sbm] failed to save contact", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label={`Edit ${caller.name}`} onClose={onClose} width={480} scroll>
      <div
        style={{
          margin: "-1.25rem -1.25rem 0",
          padding: "14px 1.25rem",
          background: "#d6e8f8",
          borderRadius: `${t.radiusCard} ${t.radiusCard} 0 0`,
          borderBottom: "1px solid #b8d0e6",
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: "#2f4a63" }}>
          Edit contact
        </span>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
        <span style={LABEL}>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} style={TEXT_INPUT_STYLE} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>Phone number</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          style={TEXT_INPUT_STYLE}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LABEL}>Type</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={TEXT_INPUT_STYLE}>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={LABEL}>Sites</span>
        {linkedSites.length === 0 ? (
          <span style={{ fontSize: 13, color: t.edge2 }}>No sites linked.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {linkedSites.map((site) => (
              <div
                key={site.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 8px",
                  border: `1px solid ${t.frost}`,
                  borderRadius: t.radiusButton,
                  background: "var(--color-canvas, #f6f7f9)",
                }}
              >
                <span style={{ fontSize: 13, color: t.edge, fontWeight: 600, minWidth: 0 }}>
                  {siteDisplayName(site) || site.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeSite(site.id)}
                  style={{
                    border: "none",
                    background: "none",
                    color: t.signal,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <span style={{ ...LABEL, marginTop: 4 }}>Associate to site</span>
        <input
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          placeholder="Search confirmed sites…"
          style={TEXT_INPUT_STYLE}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={sitePickId}
            onChange={(e) => setSitePickId(e.target.value)}
            style={{ ...TEXT_INPUT_STYLE, flex: 1 }}
            disabled={confirmedSites === null}
          >
            <option value="">{confirmedSites === null ? "Loading sites…" : "Choose a confirmed site…"}</option>
            {siteChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {siteDisplayName(s) || s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addSite}
            disabled={!sitePickId}
            style={{
              ...PRIMARY_BUTTON_STYLE,
              opacity: sitePickId ? 1 : 0.5,
              whiteSpace: "nowrap",
              padding: "0 12px",
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={LABEL}>Aliases</span>
        {aliases.length === 0 ? (
          <span style={{ fontSize: 13, color: t.edge2 }}>No aliases yet.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {aliases.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "6px 8px",
                  border: `1px solid ${t.frost}`,
                  borderRadius: t.radiusButton,
                }}
              >
                <span style={{ fontSize: 13, color: t.edge }}>{row.alias}</span>
                <button
                  type="button"
                  onClick={() => removeAlias(row.id)}
                  style={{
                    border: "none",
                    background: "none",
                    color: t.signal,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={aliasDraft}
            onChange={(e) => setAliasDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAlias();
              }
            }}
            placeholder={aliases.length ? "Add another alias…" : "Add alias…"}
            style={{ ...TEXT_INPUT_STYLE, flex: 1 }}
          />
          <button
            type="button"
            onClick={addAlias}
            style={{
              minHeight: 40,
              padding: "0 12px",
              border: `1px solid ${t.frost}`,
              borderRadius: t.radiusButton,
              background: t.white,
              color: t.accent,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Add alias
          </button>
        </div>
      </div>

      {error && <span style={{ fontSize: 12, color: t.signal }}>{error}</span>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button
          type="button"
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
          type="button"
          disabled={busy}
          onClick={save}
          style={{ ...PRIMARY_BUTTON_STYLE, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

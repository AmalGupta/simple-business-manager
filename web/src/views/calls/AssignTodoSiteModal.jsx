import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Modal } from "../../components/Modal.jsx";
import {
  assignTodoSite,
  fetchTodoAssignSiteOptions,
  loadConfirmedSites,
} from "../../lib/api.js";

/**
 * Assign a site to one CNA todo. Suggested sites come from the call's
 * contact → caller_sites. Picking a non-suggested site asks whether to
 * also link that site to the contact; No confirms call-only assignment.
 * The parent call always gets call_sites when the todo is assigned.
 */
export function AssignTodoSiteModal({ todo, onClose, onAssigned }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [options, setOptions] = useState(null);
  const [sites, setSites] = useState([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingSite, setPendingSite] = useState(null);
  const [step, setStep] = useState("pick"); // pick | associate | call-only-ack

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([fetchTodoAssignSiteOptions(todo.id), loadConfirmedSites()])
      .then(([opts, confirmed]) => {
        if (cancelled) return;
        setOptions(opts);
        const list = Array.isArray(confirmed) ? confirmed : [];
        setSites(list);
      })
      .catch((err) => {
        console.error("[sbm] assign-site options failed", err);
        if (!cancelled) setError("Could not load sites.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [todo.id]);

  const suggestedIds = useMemo(
    () => new Set((options?.suggested_sites ?? []).map((s) => s.id)),
    [options]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = sites.filter((s) => s?.id && s?.name);
    if (!needle) return list;
    return list.filter((s) => String(s.name).toLowerCase().includes(needle));
  }, [sites, q]);

  const commit = useCallback(
    async (site, associateContact) => {
      setSaving(true);
      setError("");
      try {
        const result = await assignTodoSite(todo.id, site.id, { associateContact });
        onAssigned?.(result);
        onClose?.();
      } catch (err) {
        console.error("[sbm] assign todo site failed", err);
        setError(err?.message || "Could not assign site.");
        setStep("pick");
        setPendingSite(null);
      } finally {
        setSaving(false);
      }
    },
    [todo.id, onAssigned, onClose]
  );

  const onPickSite = (site) => {
    if (saving) return;
    const contact = options?.contact;
    const isSuggested = suggestedIds.has(site.id);
    if (!contact || isSuggested) {
      void commit(site, false);
      return;
    }
    setPendingSite(site);
    setStep("associate");
  };

  const contactName = options?.contact?.name || "this contact";
  const suggestedSites = options?.suggested_sites ?? [];
  const associatePrompt =
    suggestedSites.length > 0
      ? `Do you want to associate this site (${pendingSite?.name}) in addition to ${suggestedSites
          .map((s) => s.name)
          .join(", ")} to the contact ${contactName}? If you do, you will be able to view this site linked in the contacts directory.`
      : `Do you want to associate this site (${pendingSite?.name}) to the contact ${contactName}? If you do, you will be able to view this site linked in the contacts directory.`;

  if (step === "associate" && pendingSite) {
    return (
      <Modal title="Associate site to contact?" label="Associate site to contact" onClose={onClose} width={440}>
        <p style={{ margin: 0, fontSize: 14, color: t.edge, lineHeight: 1.45 }}>{associatePrompt}</p>
        {error ? <p style={{ margin: 0, fontSize: 13, color: t.signal }}>{error}</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => setStep("call-only-ack")}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}
          >
            No
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void commit(pendingSite, true)}
            style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Yes"}
          </button>
        </div>
      </Modal>
    );
  }

  if (step === "call-only-ack" && pendingSite) {
    return (
      <Modal title="Call only" label="Site assigned to call only" onClose={onClose} width={400}>
        <p style={{ margin: 0, fontSize: 14, color: t.edge, lineHeight: 1.45 }}>
          The site will be assigned to the call only, not to <strong>{contactName}</strong>.
        </p>
        {error ? <p style={{ margin: 0, fontSize: 13, color: t.signal }}>{error}</p> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setStep("associate");
            }}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}
          >
            Back
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void commit(pendingSite, false)}
            style={{ ...PRIMARY_BUTTON_STYLE, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "OK"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Assign to Site" label="Assign todo to site" onClose={onClose} width={480} scroll>
      <p style={{ margin: 0, fontSize: 13, color: t.edge2, lineHeight: 1.4 }}>
        Assign a site to this todo. The parent call is linked to the same site.
      </p>

      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: t.edge2 }}>Loading…</p>
      ) : error && !options ? (
        <p style={{ margin: 0, fontSize: 13, color: t.signal }}>{error}</p>
      ) : (
        <>
          {(options?.suggested_sites ?? []).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span
                style={{
                  fontFamily: t.label,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: t.edge2,
                }}
              >
                Suggested
                {options?.contact ? ` · ${options.contact.name}` : ""}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {options.suggested_sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    disabled={saving}
                    onClick={() => onPickSite(site)}
                    style={siteRowStyle(true)}
                  >
                    {site.name}
                    {options.current_site_id === site.id ? (
                      <span style={{ fontSize: 12, color: t.edge2, fontWeight: 600 }}>Current</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span
              style={{
                fontFamily: t.label,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: t.edge2,
              }}
            >
              All sites
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Search size={14} color={t.edge2} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search sites"
                style={{ ...TEXT_INPUT_STYLE, flex: 1, width: "100%" }}
              />
            </label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                maxHeight: 280,
                overflowY: "auto",
                border: `1px solid ${t.frost}`,
                borderRadius: t.radiusButton,
                padding: 6,
              }}
            >
              {filtered.length === 0 ? (
                <p style={{ margin: 8, fontSize: 13, color: t.edge2 }}>No sites match.</p>
              ) : (
                filtered.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    disabled={saving}
                    onClick={() => onPickSite(site)}
                    style={siteRowStyle(suggestedIds.has(site.id))}
                  >
                    <span>{site.name}</span>
                    {suggestedIds.has(site.id) ? (
                      <span style={{ fontSize: 11, color: t.accent, fontWeight: 700 }}>Suggested</span>
                    ) : null}
                    {options?.current_site_id === site.id ? (
                      <span style={{ fontSize: 12, color: t.edge2, fontWeight: 600 }}>Current</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
          {error ? <p style={{ margin: 0, fontSize: 13, color: t.signal }}>{error}</p> : null}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={SMALL_SECONDARY_BUTTON_STYLE}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function siteRowStyle(emphasized) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    border: `1px solid ${emphasized ? "color-mix(in srgb, var(--color-accent) 35%, var(--color-line))" : "var(--color-line)"}`,
    borderRadius: t.radiusButton,
    background: emphasized ? "color-mix(in srgb, var(--color-accent) 6%, white)" : t.white,
    color: t.edge,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}

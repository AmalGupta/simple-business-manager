import { useState, useEffect, useMemo } from "react";
import { t } from "../../theme.js";
import { TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { WAREHOUSE_MOVEMENT_KIND_LABEL } from "../../lib/constants.js";
import { fetchProductionJobs, fetchSites, fetchWarehouseItemSuggestions, postWarehouseMovement } from "../../lib/api.js";
import { Modal } from "../../components/Modal.jsx";

const labelStyle = { fontSize: 12, fontWeight: 600, color: t.edge2, marginBottom: 4, display: "block" };
const fieldWrap = { marginBottom: 10 };

/* One form for all 4 movement kinds — fields shown vary by kind, per the
   approved diagram (Material in / Material out / Dispatch / Maintenance).
   `item` suggests from past entries for the selected store (no separate
   item master to set up first — see migrations/0042_production_warehouse.sql). */
export function NewMovementModal({ kind, stores, onClose, onCreated }) {
  const [storeId, setStoreId] = useState(stores?.[0]?.id ?? "");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [siteId, setSiteId] = useState("");
  const [jobId, setJobId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [machineOrArea, setMachineOrArea] = useState("");
  const [note, setNote] = useState("");
  const [sites, setSites] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [itemSuggestions, setItemSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsSite = kind === "dispatch";
  const needsJob = kind === "out" || kind === "dispatch";
  const needsSupplier = kind === "in";
  const needsMachine = kind === "maintenance";

  useEffect(() => {
    if (needsSite) fetchSites().then(setSites).catch((err) => console.error("[sbm] failed to load sites", err));
  }, [needsSite]);

  useEffect(() => {
    if (!needsJob) return;
    fetchProductionJobs(kind === "dispatch" ? "ready_for_dispatch" : "active")
      .then(setJobs)
      .catch((err) => console.error("[sbm] failed to load production jobs", err));
  }, [needsJob, kind]);

  useEffect(() => {
    if (!storeId) return;
    fetchWarehouseItemSuggestions(storeId)
      .then(setItemSuggestions)
      .catch(() => setItemSuggestions([]));
  }, [storeId]);

  // Dispatch: site drives the job, not the other way round. Pick the site
  // and the job resolves itself — exactly one ready job at that site links
  // automatically (no dropdown to touch); more than one still asks; none
  // leaves the dispatch unlinked (e.g. dispatching hardware on its own).
  const jobsForSite = useMemo(() => {
    if (kind !== "dispatch" || !siteId) return [];
    return jobs.filter((j) => j.site_id === siteId);
  }, [kind, jobs, siteId]);

  useEffect(() => {
    if (kind !== "dispatch") return;
    if (jobsForSite.length === 1) {
      setJobId(jobsForSite[0].id);
    } else if (!jobsForSite.some((j) => j.id === jobId)) {
      setJobId("");
    }
    // jobId is read, not a trigger — resolving it is this effect's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, jobsForSite]);

  const valid =
    storeId &&
    item.trim() &&
    Number(quantity) > 0 &&
    (!needsSite || siteId);

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      const created = await postWarehouseMovement({
        store_id: storeId,
        kind,
        item: item.trim(),
        quantity: Number(quantity),
        unit: unit.trim() || null,
        batch_no: batchNo.trim() || null,
        site_id: siteId || null,
        production_job_id: jobId || null,
        supplier: supplier.trim() || null,
        machine_or_area: machineOrArea.trim() || null,
        note: note.trim() || null,
      });
      onCreated(created);
    } catch (err) {
      console.error("[sbm] failed to log warehouse movement", err);
      setError(err.message || "Failed to save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal label={WAREHOUSE_MOVEMENT_KIND_LABEL[kind] ?? kind} title={WAREHOUSE_MOVEMENT_KIND_LABEL[kind] ?? kind} onClose={onClose} width={420} scroll>
      <div style={fieldWrap}>
        <label style={labelStyle}>Store</label>
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
          {(stores ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>Item</label>
        <input value={item} onChange={(e) => setItem(e.target.value)} list="warehouse-item-suggestions" placeholder="e.g. 4-inch tower bolt" style={{ ...TEXT_INPUT_STYLE, width: "100%" }} />
        <datalist id="warehouse-item-suggestions">
          {itemSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      <div style={{ display: "flex", gap: 8, ...fieldWrap }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Quantity</label>
          <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Unit</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs, kg, m…" style={{ ...TEXT_INPUT_STYLE, width: "100%" }} />
        </div>
      </div>

      <div style={fieldWrap}>
        <label style={labelStyle}>Batch no. (optional)</label>
        <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }} />
      </div>

      {needsSupplier && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Supplier (optional)</label>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }} />
        </div>
      )}

      {needsMachine && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Machine / area</label>
          <input value={machineOrArea} onChange={(e) => setMachineOrArea(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }} />
        </div>
      )}

      {needsSite && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Site</label>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
            <option value="">Select a site…</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Dispatch: the job link resolves from the site above — see
          jobsForSite. "Out" keeps the original free-pick dropdown across
          every active job (unchanged; only dispatch was asked to automate). */}
      {kind === "dispatch" && siteId && jobsForSite.length === 1 && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Production job</label>
          <p style={{ fontSize: 13, color: t.edge, margin: 0, padding: "8px 10px", border: `1px solid ${t.frost}`, borderRadius: t.radiusButton, background: t.pane }}>
            {jobsForSite[0].title}
          </p>
        </div>
      )}

      {kind === "dispatch" && siteId && jobsForSite.length > 1 && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Production job</label>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
            <option value="">Select which job…</option>
            {jobsForSite.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {kind === "dispatch" && siteId && jobsForSite.length === 0 && (
        <p style={{ fontSize: 12, color: t.edge2, margin: "0 0 10px" }}>No job ready for dispatch at this site — this dispatch won't be linked to one.</p>
      )}

      {needsJob && kind === "out" && (
        <div style={fieldWrap}>
          <label style={labelStyle}>Production job (optional)</label>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} style={{ ...TEXT_INPUT_STYLE, width: "100%" }}>
            <option value="">No job link</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} — {j.site_name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={fieldWrap}>
        <label style={labelStyle}>Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vehicle, person, anything else" style={{ ...TEXT_INPUT_STYLE, width: "100%" }} />
      </div>

      {error ? <span style={{ fontSize: 12, color: t.signal }}>{error}</span> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} style={SMALL_SECONDARY_BUTTON_STYLE}>
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={!valid || saving} style={{ ...PRIMARY_BUTTON_STYLE, opacity: !valid || saving ? 0.6 : 1 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

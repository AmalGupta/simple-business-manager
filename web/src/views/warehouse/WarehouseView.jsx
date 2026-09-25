import { useState, useEffect, useCallback } from "react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { WAREHOUSE_MOVEMENT_KINDS, WAREHOUSE_MOVEMENT_KIND_LABEL } from "../../lib/constants.js";
import {
  fetchOpenToolMovements,
  fetchWarehouseMovements,
  fetchWarehouseStock,
  fetchWarehouseStores,
  returnToolMovement,
  voidWarehouseMovement,
} from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { NewMovementModal } from "./NewMovementModal.jsx";
import { NewToolOutModal } from "./NewToolOutModal.jsx";

const TABS = [
  { key: "log", label: "Log" },
  { key: "stock", label: "Stock" },
  { key: "tools", label: "Tools" },
];

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: t.radiusButton,
        border: `1px solid ${active ? t.accent : t.frost}`,
        background: active ? t.accent : t.white,
        color: active ? t.white : t.edge,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function movementLine(m) {
  const parts = [`${m.quantity}${m.unit ? ` ${m.unit}` : ""} ${m.item}`];
  if (m.batch_no) parts.push(`batch ${m.batch_no}`);
  if (m.kind === "dispatch" && m.site_name) parts.push(`→ ${m.site_name}`);
  if (m.kind === "out" && m.job_title) parts.push(`for ${m.job_title}`);
  if (m.kind === "in" && m.supplier) parts.push(`from ${m.supplier}`);
  if (m.kind === "maintenance" && m.machine_or_area) parts.push(m.machine_or_area);
  return parts.join(" · ");
}

/* Log / Stock / Tools — the warehouse register (migration 0042). Any
   staff or admin session; only void/return actions differ in visibility
   in this pass (kept open to both, per the low-friction "mistakes
   happen" posture the approved diagram calls for). */
export function WarehouseView({ onBack }) {
  const [tab, setTab] = useState("log");
  const [stores, setStores] = useState([]);
  const [movements, setMovements] = useState(null);
  const [stock, setStock] = useState(null);
  const [tools, setTools] = useState(null);
  const [addingKind, setAddingKind] = useState(null);
  const [addingTool, setAddingTool] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    fetchWarehouseStores()
      .then(setStores)
      .catch((err) => console.error("[sbm] failed to load warehouse stores", err));
  }, []);

  const loadLog = useCallback(() => {
    fetchWarehouseMovements({ limit: 150 })
      .then(setMovements)
      .catch((err) => {
        console.error("[sbm] failed to load warehouse movements", err);
        setMovements([]);
      });
  }, []);
  const loadStock = useCallback(() => {
    fetchWarehouseStock()
      .then(setStock)
      .catch((err) => {
        console.error("[sbm] failed to load warehouse stock", err);
        setStock([]);
      });
  }, []);
  const loadTools = useCallback(() => {
    fetchOpenToolMovements()
      .then(setTools)
      .catch((err) => {
        console.error("[sbm] failed to load tools out", err);
        setTools([]);
      });
  }, []);

  useEffect(() => {
    if (tab === "log") loadLog();
    if (tab === "stock") loadStock();
    if (tab === "tools") loadTools();
  }, [tab, loadLog, loadStock, loadTools]);

  const voidMovement = async (id) => {
    setBusyId(id);
    try {
      await voidWarehouseMovement(id);
      loadLog();
    } catch (err) {
      console.error("[sbm] failed to void movement", err);
    } finally {
      setBusyId(null);
    }
  };

  const returnTool = async (id) => {
    setBusyId(id);
    try {
      await returnToolMovement(id);
      loadTools();
    } catch (err) {
      console.error("[sbm] failed to return tool", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1rem" }}>Warehouse</h1>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {WAREHOUSE_MOVEMENT_KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setAddingKind(k.key)}
            disabled={stores.length === 0}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, opacity: stores.length === 0 ? 0.6 : 1 }}
          >
            + {k.label}
          </button>
        ))}
        <button type="button" onClick={() => setAddingTool(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
          + Tool out
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: "1rem" }}>
        {TABS.map((tb) => (
          <TabButton key={tb.key} active={tab === tb.key} onClick={() => setTab(tb.key)}>
            {tb.label}
          </TabButton>
        ))}
      </div>

      {tab === "log" &&
        (movements === null ? (
          <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
        ) : movements.length === 0 ? (
          <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No entries yet.</p>
          </Card>
        ) : (
          <Card>
            {movements.map((m) => (
              <div key={m.id} style={{ padding: "10px 0", borderTop: `1px solid ${t.frost}`, opacity: m.status === "voided" ? 0.5 : 1 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, justifyContent: "space-between" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.edge, textTransform: "capitalize" }}>
                      {WAREHOUSE_MOVEMENT_KIND_LABEL[m.kind] ?? m.kind}
                    </span>
                    <span style={{ fontSize: 12, color: t.edge2, marginLeft: 6 }}>{m.store_label}</span>
                    <p style={{ fontSize: 13, color: t.edge, margin: "2px 0 0" }}>
                      {movementLine(m)}
                      {m.status === "voided" ? " · voided" : ""}
                    </p>
                    <p style={{ fontSize: 11, color: t.edge2, margin: "2px 0 0" }}>
                      {m.created_by_name ? `${m.created_by_name} · ` : ""}
                      {fmtShort(m.created_at)}
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  {m.status === "active" && (
                    <button type="button" disabled={busyId === m.id} onClick={() => voidMovement(m.id)} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, flexShrink: 0 }}>
                      Void
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        ))}

      {tab === "stock" &&
        (stock === null ? (
          <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
        ) : stock.length === 0 ? (
          <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No stock movements yet.</p>
          </Card>
        ) : (
          <Card>
            {stock.map((row) => (
              <div key={`${row.store_id}-${row.item}-${row.batch_no ?? ""}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${t.frost}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.edge }}>{row.item}</div>
                  <div style={{ fontSize: 11, color: t.edge2 }}>
                    {row.store_label}
                    {row.batch_no ? ` · batch ${row.batch_no}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: row.balance < 0 ? t.signal : t.accent }}>
                  {row.balance}
                  {row.unit ? ` ${row.unit}` : ""}
                </span>
              </div>
            ))}
          </Card>
        ))}

      {tab === "tools" &&
        (tools === null ? (
          <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
        ) : tools.length === 0 ? (
          <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>No tools out.</p>
          </Card>
        ) : (
          <Card>
            {tools.map((tl) => (
              <div key={tl.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: `1px solid ${t.frost}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.edge }}>{tl.tool_name}</div>
                  <div style={{ fontSize: 11, color: t.edge2 }}>
                    {tl.taken_by_name ?? "Unknown"} · {tl.location === "site" ? tl.site_name ?? "Site" : "Workshop"} · since {fmtShort(tl.taken_at)}
                  </div>
                </div>
                <button type="button" disabled={busyId === tl.id} onClick={() => returnTool(tl.id)} style={SMALL_SECONDARY_BUTTON_STYLE}>
                  Back
                </button>
              </div>
            ))}
          </Card>
        ))}

      {addingKind && (
        <NewMovementModal
          kind={addingKind}
          stores={stores}
          onClose={() => setAddingKind(null)}
          onCreated={() => {
            setAddingKind(null);
            setTab("log");
            loadLog();
          }}
        />
      )}
      {addingTool && (
        <NewToolOutModal
          onClose={() => setAddingTool(false)}
          onCreated={() => {
            setAddingTool(false);
            setTab("tools");
            loadTools();
          }}
        />
      )}
    </div>
  );
}

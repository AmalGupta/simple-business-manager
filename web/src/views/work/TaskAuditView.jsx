import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { t } from "../../theme.js";
import { fmtLong } from "../../lib/dates.js";
import { fetchTaskAudit } from "../../lib/api.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { fmtDateTime, parseSqliteUtc } from "./workDates.js";
import { assignedToName, auditDayKey, callKindLabel, describeTransition } from "./taskAuditFormat.js";

const PAGE = 300;
const SEARCH_DEBOUNCE_MS = 300;
const TABS = [
  { id: "date", label: "By date" },
  { id: "site", label: "By site" },
  { id: "assignee", label: "By assignee" },
];

const th = {
  textAlign: "left",
  padding: "8px 10px",
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge,
  borderBottom: `1px solid ${t.frost}`,
  whiteSpace: "nowrap",
};
const td = { padding: "10px", borderBottom: `1px solid ${t.frost}`, verticalAlign: "top", fontSize: 13, color: t.edge };

const fmtTime = (e) => {
  const d = parseSqliteUtc(e.created_at);
  return d ? d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";
};

/* The task name, clickable: opens the task's timeline together with the
   call / desk conversation it came from (site tasks: timeline + site). */
function TaskLink({ e, onOpenTask }) {
  return (
    <button
      type="button"
      onClick={() => onOpenTask(e)}
      style={{ all: "unset", cursor: "pointer", display: "block", marginTop: 2 }}
    >
      <span style={{ fontSize: 12, color: t.accent, fontWeight: 600 }}>{e.item_title ?? "(deleted task)"}</span>
      <span style={{ fontSize: 11, color: t.edge2 }}>
        {" "}
        · {callKindLabel(e)}
        {e.site_name ? ` · ${e.site_name}` : ""}
      </span>
    </button>
  );
}

function AuditTable({ rows, onOpenTask, timeOnly = false }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
        <thead>
          <tr>
            <th style={th}>Employee</th>
            <th style={th}>Transition</th>
            <th style={th}>Assigned to</th>
            <th style={th}>{timeOnly ? "Time" : "Date & time"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{e.actor_name ?? "System"}</td>
              <td style={td}>
                <div style={{ fontWeight: 600, color: e.event === "marked_urgent" ? t.signal : t.edge }}>
                  {describeTransition(e)}
                </div>
                <TaskLink e={e} onOpenTask={onOpenTask} />
              </td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{assignedToName(e)}</td>
              <td style={{ ...td, whiteSpace: "nowrap", color: t.edge2 }}>{timeOnly ? fmtTime(e) : fmtDateTime(e.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupCard({ title, count, children }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden", marginBottom: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          padding: "12px 14px 8px",
        }}
      >
        <span style={{ fontFamily: t.display, fontSize: 16, fontWeight: 500, color: t.edge }}>{title}</span>
        <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>{count} {count === 1 ? "change" : "changes"}</span>
      </div>
      {children}
    </Card>
  );
}

/* Preserves the newest-first order the rows arrive in. */
function groupBy(rows, keyOf) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()];
}

/* Metro-style tile per assignee: big name, change count, the latest few
   changes. "All" opens that person's full list under the grid. */
function AssigneeTile({ name, rows, selected, onSelect, onOpenTask }) {
  return (
    <div
      style={{
        background: t.white,
        border: `1px solid ${selected ? t.accent : t.frost}`,
        borderTop: `4px solid ${t.accent}`,
        borderRadius: t.radiusCard,
        padding: "14px 16px",
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontFamily: t.display, fontSize: 20, fontWeight: 600, color: t.edge, lineHeight: 1.2 }}>
          {name === "NA" ? "Unassigned" : name}
        </span>
        <span style={{ fontFamily: t.display, fontSize: 28, fontWeight: 700, color: t.accent, lineHeight: 1 }}>{rows.length}</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.slice(0, 3).map((e) => (
          <div key={e.id} style={{ borderTop: `1px solid ${t.frost}`, paddingTop: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: e.event === "marked_urgent" ? t.signal : t.edge }}>
              {describeTransition(e)}
              <span style={{ fontWeight: 400, color: t.edge2 }}> · {fmtDateTime(e.created_at)}</span>
            </div>
            <TaskLink e={e} onOpenTask={onOpenTask} />
          </div>
        ))}
      </div>
      {rows.length > 3 && (
        <button type="button" onClick={onSelect} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 36, alignSelf: "flex-start" }}>
          {selected ? "Hide" : `All ${rows.length} →`}
        </button>
      )}
    </div>
  );
}

/* Admin Task audit — every change on any call todo or site task, as three
   dashboards (by date, by site, by assignee). The search box filters all
   three (server-side keyword over task, site, caller and people). */
export function TaskAuditView({ onBack, onOpenTask, initialTab = "date", initialQ = "", onStateChange }) {
  const [tab, setTab] = useState(initialTab);
  const [q, setQ] = useState(initialQ);
  const [appliedQ, setAppliedQ] = useState(initialQ.trim());
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedQ(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  // Remembered on the view, so Back from an opened task lands on the same
  // dashboard and search.
  useEffect(() => {
    onStateChange?.({ tab, q: appliedQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, appliedQ]);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    fetchTaskAudit({ limit: PAGE, q: appliedQ })
      .then((r) => {
        if (cancelled) return;
        setItems(r.items ?? []);
        setHasMore((r.items ?? []).length === PAGE);
      })
      .catch((err) => {
        console.error("[sbm] failed to load task audit", err);
        if (!cancelled) setError("Couldn’t load the task audit.");
      });
    return () => {
      cancelled = true;
    };
  }, [appliedQ]);

  const loadMore = useCallback(async () => {
    if (!items?.length) return;
    setLoadingMore(true);
    try {
      const r = await fetchTaskAudit({ limit: PAGE, beforeSeq: items[items.length - 1].seq, q: appliedQ });
      setItems((prev) => [...prev, ...(r.items ?? [])]);
      setHasMore((r.items ?? []).length === PAGE);
    } catch (err) {
      console.error("[sbm] failed to load older task audit", err);
    } finally {
      setLoadingMore(false);
    }
  }, [items, appliedQ]);

  const byDate = useMemo(() => (items ? groupBy(items, auditDayKey) : []), [items]);
  const bySite = useMemo(() => (items ? groupBy(items, (e) => e.site_name ?? "No site") : []), [items]);
  const byAssignee = useMemo(() => (items ? groupBy(items, assignedToName) : []), [items]);
  const selectedRows = byAssignee.find(([name]) => name === selectedAssignee)?.[1] ?? null;

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1rem" }}>Task audit</h1>

      <label style={{ position: "relative", display: "block", marginBottom: "0.75rem" }}>
        <Search size={15} color={t.edge2} style={{ position: "absolute", left: 12, top: 14 }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks, sites, callers or people"
          aria-label="Search task audit"
          style={{ ...TEXT_INPUT_STYLE, width: "100%", minHeight: 44, paddingLeft: 34, boxSizing: "border-box" }}
        />
      </label>

      <div role="tablist" aria-label="Group task audit" style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            style={{
              ...SMALL_SECONDARY_BUTTON_STYLE,
              minHeight: 36,
              ...(tab === x.id ? { background: t.accent, color: t.white, borderColor: t.accent } : {}),
            }}
          >
            {x.label}
          </button>
        ))}
      </div>

      {error && <p style={{ fontSize: 14, color: t.edge2 }}>{error}</p>}
      {!items && !error && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}
      {items && items.length === 0 && (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>
            {appliedQ ? `No task changes match “${appliedQ}”.` : "No task activity yet."}
          </p>
        </Card>
      )}

      {items && items.length > 0 && tab === "date" &&
        byDate.map(([day, rows]) => (
          <GroupCard key={day} title={fmtLong(day)} count={rows.length}>
            <AuditTable rows={rows} onOpenTask={onOpenTask} timeOnly />
          </GroupCard>
        ))}

      {items && items.length > 0 && tab === "site" &&
        bySite.map(([site, rows]) => (
          <GroupCard key={site} title={site} count={rows.length}>
            <AuditTable rows={rows} onOpenTask={onOpenTask} />
          </GroupCard>
        ))}

      {items && items.length > 0 && tab === "assignee" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: "1rem" }}>
            {byAssignee.map(([name, rows]) => (
              <AssigneeTile
                key={name}
                name={name}
                rows={rows}
                selected={selectedAssignee === name}
                onSelect={() => setSelectedAssignee((cur) => (cur === name ? null : name))}
                onOpenTask={onOpenTask}
              />
            ))}
          </div>
          {selectedRows && (
            <GroupCard title={selectedAssignee === "NA" ? "Unassigned" : selectedAssignee} count={selectedRows.length}>
              <AuditTable rows={selectedRows} onOpenTask={onOpenTask} />
            </GroupCard>
          )}
        </>
      )}

      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={loadMore}
          style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, width: "100%", marginTop: 4 }}
        >
          {loadingMore ? "Loading…" : "Load older"}
        </button>
      )}
    </div>
  );
}

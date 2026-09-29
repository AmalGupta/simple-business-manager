import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, MapPin, Phone } from "lucide-react";
import { t } from "../../theme.js";
import { fmtShort, todayIso } from "../../lib/dates.js";
import { WORKFLOW_CATEGORY_LABEL } from "../../lib/constants.js";
import { PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import {
  deleteOffboarding,
  fetchOffboarding,
  fetchStaffRoster,
  patchLastWorkingDay,
  postOffboardingFinishNow,
  postOffboardingHandoverSite,
  postOffboardingTransfer,
} from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { TodoContext } from "../../components/TodoContext.jsx";

const GENERAL = "general";
const itemKey = (i) => `${i.kind}-${i.id}`;

const sectionLabel = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge,
  margin: "0 0 6px",
};

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/* Recipient picker shared by site hand-over, per-task and bulk moves:
   active staff other than the leaver, plus "Me" (the acting admin). */
function RecipientSelect({ roster, value, onChange, label }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ ...TEXT_INPUT_STYLE, minHeight: 44, minWidth: 0 }}>
      <option value="">Give to…</option>
      <option value="self">Me (take it myself)</option>
      {roster.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.last_working_day ? ` (leaving ${fmtShort(s.last_working_day)})` : ""}
        </option>
      ))}
    </select>
  );
}

function ItemRow({ item, first, checked, busy, roster, onToggle, onGive, onOpenCall }) {
  const [to, setTo] = useState("");
  const urgent = Boolean(item.urgent_at);
  let meta;
  if (item.kind === "todo") {
    meta = (
      <button
        type="button"
        onClick={() => onOpenCall(item.call_id)}
        style={{ all: "unset", cursor: "pointer", color: t.accent, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
      >
        <Phone size={12} /> from call with {item.client_name}
        {item.recorded_at ? ` · ${fmtShort(item.recorded_at)}` : ""}
      </button>
    );
  } else if (item.kind === "site_task") {
    meta = <span>Site stage · {WORKFLOW_CATEGORY_LABEL[item.category] ?? item.category}</span>;
  } else {
    meta = <span>Complaint</span>;
  }

  return (
    <div style={{ ...TILE_ROW_STYLE, ...(first ? { borderTop: "none" } : {}), display: "flex", gap: 10, alignItems: "flex-start" }}>
      <input
        type="checkbox"
        aria-label={`Select ${item.title}`}
        checked={checked}
        onChange={onToggle}
        style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: t.edge, lineHeight: 1.4 }}>
            {item.title}
            {item.kind === "todo" && <TodoContext text={item.context} />}
          </span>
          {urgent ? (
            <span style={{ fontSize: 12, fontWeight: 700, color: t.signal, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
              <AlertTriangle size={13} /> Urgent
            </span>
          ) : (
            item.due_date && <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>due {fmtShort(item.due_date)}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4, fontSize: 12, color: t.edge2 }}>
          {meta}
          {item.status === "snoozed" && <span style={{ color: t.putty, fontWeight: 700 }}>Parked</span>}
        </div>
        {/* Picker on its own row, the two actions under it — keeps each a full 44px target at 360px. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10, alignItems: "center" }}>
          <div style={{ gridColumn: "1 / -1", display: "grid" }}>
            <RecipientSelect roster={roster} value={to} onChange={setTo} label={`Give ${item.title} to`} />
          </div>
          <button
            type="button"
            disabled={!to || busy}
            onClick={() => onGive([item], to)}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, opacity: !to || busy ? 0.5 : 1 }}
          >
            Give
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onGive([item], "self")}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, opacity: busy ? 0.5 : 1 }}
          >
            Take myself
          </button>
        </div>
      </div>
    </div>
  );
}

function SiteHandoverRow({ site, first, busy, roster, onHandOver }) {
  const [to, setTo] = useState("");
  return (
    <div style={{ ...TILE_ROW_STYLE, ...(first ? { borderTop: "none" } : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: t.edgeStrong, display: "flex", alignItems: "center", gap: 6 }}>
          <MapPin size={13} color={t.edge2} /> {site.name}
        </span>
        <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>
          {site.count} open{site.onTeam ? " · on team" : ""}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, marginTop: 8 }}>
        <RecipientSelect roster={roster} value={to} onChange={setTo} label={`Hand ${site.name} over to`} />
        <button
          type="button"
          disabled={!to || busy}
          onClick={() => onHandOver(site, to)}
          style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 44, opacity: !to || busy ? 0.5 : 1 }}
        >
          Hand over
        </button>
      </div>
    </div>
  );
}

/* SBM-64 — one leaver's notice period. Everything they still hold is listed
   by site, each call todo linked back to its call. The admin hands whole
   sites over (team slot + that site's open work), or moves tasks one at a
   time or in bulk to another staff member or to themselves. The counter
   drains to zero as work moves; the day after the last working day the
   cron sends whatever is left to the router and closes the login. */
export function OffboardingView({ staffId, onBack, onOpenCall, onFinished }) {
  const [detail, setDetail] = useState(null);
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkTo, setBulkTo] = useState("");
  const [confirming, setConfirming] = useState(null); // "finish" | "cancel"
  const today = todayIso();

  const load = useCallback(
    () =>
      fetchOffboarding(staffId)
        .then((d) => {
          setDetail(d);
          setSelected((prev) => new Set([...prev].filter((k) => d.items.some((i) => itemKey(i) === k))));
        })
        .catch((err) => {
          console.error("[sbm] failed to load offboarding", err);
          setError(err.message || "Couldn’t load — go back and try again.");
        }),
    [staffId]
  );

  useEffect(() => {
    load();
    fetchStaffRoster()
      .then((r) => setRoster(r.filter((s) => s.id !== staffId)))
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  }, [load, staffId]);

  const act = async (fn, done) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      if (done) setNotice(done(result));
      await load();
      return true;
    } catch (err) {
      console.error("[sbm] offboarding action failed", err);
      setError(err.message || "That didn’t work — try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (to) => (to === "self" ? "you" : roster.find((s) => s.id === to)?.name ?? "them");

  const give = (items, to) =>
    act(
      () => postOffboardingTransfer(staffId, items.map((i) => ({ kind: i.kind, id: i.id })), to),
      (r) => `Moved ${r.moved} task${r.moved === 1 ? "" : "s"} to ${nameOf(to)}.`
    );

  const handOver = (site, to) =>
    act(
      () => postOffboardingHandoverSite(staffId, site.id, to),
      (r) => `${site.name} handed over to ${nameOf(to)} (${r.moved} task${r.moved === 1 ? "" : "s"}).`
    );

  /* Items grouped by site, General last; sites = anything they're on the team of or hold work at. */
  const { groups, sites } = useMemo(() => {
    if (!detail) return { groups: [], sites: [] };
    const bySite = new Map();
    for (const item of detail.items) {
      const key = item.site_id ?? GENERAL;
      if (!bySite.has(key)) bySite.set(key, { id: key, name: item.site_name ?? "General (no site)", items: [] });
      bySite.get(key).items.push(item);
    }
    const groups = [...bySite.values()].sort((a, b) =>
      a.id === GENERAL ? 1 : b.id === GENERAL ? -1 : a.name.localeCompare(b.name)
    );
    const siteMap = new Map();
    for (const g of groups) if (g.id !== GENERAL) siteMap.set(g.id, { id: g.id, name: g.name, count: g.items.length, onTeam: false });
    for (const tm of detail.site_teams) {
      const s = siteMap.get(tm.site_id) ?? { id: tm.site_id, name: tm.site_name, count: 0, onTeam: false };
      s.onTeam = true;
      siteMap.set(tm.site_id, s);
    }
    return { groups, sites: [...siteMap.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }, [detail]);

  if (error && !detail) {
    return (
      <div>
        <BackLink onClick={onBack}>Offboarding</BackLink>
        <p style={{ fontSize: 14, color: t.edge2 }}>{error}</p>
      </div>
    );
  }
  if (!detail) return <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>;

  const { user, items } = detail;
  const remaining = items.length;
  const lwd = user.last_working_day;
  const daysLeft = lwd ? daysBetween(today, lwd) : null;
  /* Danger only when the handover is genuinely at risk: work left, and the last day is today or tomorrow. */
  const atRisk = remaining > 0 && daysLeft !== null && daysLeft <= 1;
  const selectedItems = items.filter((i) => selected.has(itemKey(i)));

  const toggleGroup = (group) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = group.items.every((i) => next.has(itemKey(i)));
      for (const i of group.items) all ? next.delete(itemKey(i)) : next.add(itemKey(i));
      return next;
    });

  return (
    <div>
      <BackLink onClick={onBack}>Offboarding</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 0.25rem" }}>{user.name}</h1>
      <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1.25rem" }}>
        {user.disabled_at ? "Has left." : lwd ? "Serving notice." : "Not offboarding."}
        {user.joined_on ? ` Joined ${fmtShort(user.joined_on)}.` : ""}
      </p>

      <Card style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <span style={{ fontFamily: t.display, fontSize: 32, fontWeight: 700, lineHeight: 1, color: atRisk ? t.signal : t.accent }}>
            {remaining}
          </span>
          <span style={{ fontSize: 13, color: t.edge2, marginLeft: 8 }}>task{remaining === 1 ? "" : "s"} still with {user.name}</span>
          <p style={{ fontSize: 12, color: atRisk ? t.signal : t.edge2, fontWeight: atRisk ? 700 : 400, margin: "6px 0 0" }}>
            {daysLeft === null
              ? ""
              : daysLeft > 1
                ? `${daysLeft} days to go`
                : daysLeft === 1
                  ? "Last day is tomorrow"
                  : daysLeft === 0
                    ? "Today is the last day"
                    : "Last day has passed — closing on the next sweep"}
            {remaining === 0 && lwd ? " · all handed over" : ""}
          </p>
        </div>
        {lwd && !user.disabled_at && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 }}>
            Last working day
            <input
              type="date"
              value={lwd}
              min={today}
              disabled={busy}
              onChange={(e) => e.target.value && act(() => patchLastWorkingDay(staffId, e.target.value), () => "Last working day updated.")}
              style={{ ...TEXT_INPUT_STYLE, minHeight: 44 }}
            />
          </label>
        )}
      </Card>

      {error && <p style={{ fontSize: 13, color: t.signal, margin: "0 0 1rem" }}>{error}</p>}
      {notice && <p style={{ fontSize: 13, color: t.edge2, margin: "0 0 1rem" }}>{notice}</p>}

      {sites.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={sectionLabel}>Hand over sites</p>
          <Card style={{ paddingTop: 0, paddingBottom: 0 }}>
            {sites.map((site, i) => (
              <SiteHandoverRow key={site.id} site={site} first={i === 0} busy={busy} roster={roster} onHandOver={handOver} />
            ))}
          </Card>
          <p style={{ fontSize: 12, color: t.edge2, margin: "6px 0 0" }}>
            The new person takes {user.name}’s place on the site team, along with every open task at that site.
          </p>
        </div>
      )}

      <p style={sectionLabel}>Tasks ({remaining})</p>
      {remaining === 0 ? (
        <Card style={{ padding: "1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing left to hand over.</p>
        </Card>
      ) : (
        groups.map((group) => (
          <div key={group.id} style={{ marginBottom: "1.25rem" }}>
            <label style={{ ...sectionLabel, color: t.edge2, display: "flex", alignItems: "center", gap: 8, minHeight: 32, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={group.items.every((i) => selected.has(itemKey(i)))}
                onChange={() => toggleGroup(group)}
                style={{ width: 18, height: 18 }}
              />
              {group.name} · {group.items.length}
            </label>
            <Card style={{ paddingTop: 0, paddingBottom: 0 }}>
              {group.items.map((item, i) => (
                <ItemRow
                  key={itemKey(item)}
                  item={item}
                  first={i === 0}
                  checked={selected.has(itemKey(item))}
                  busy={busy}
                  roster={roster}
                  onToggle={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.has(itemKey(item)) ? next.delete(itemKey(item)) : next.add(itemKey(item));
                      return next;
                    })
                  }
                  onGive={give}
                  onOpenCall={onOpenCall}
                />
              ))}
            </Card>
          </div>
        ))
      )}

      {selectedItems.length > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 12,
            zIndex: 5,
            background: t.white,
            border: `1px solid ${t.accent}`,
            borderRadius: t.radiusCard,
            padding: "0.75rem 1rem",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 8,
            alignItems: "center",
            marginBottom: "1.25rem",
          }}
        >
          <span style={{ gridColumn: "1 / -1", fontSize: 13, fontWeight: 600, color: t.edge }}>
            {selectedItems.length} selected
          </span>
          <RecipientSelect roster={roster} value={bulkTo} onChange={setBulkTo} label="Give selected to" />
          <button
            type="button"
            disabled={!bulkTo || busy}
            onClick={() => give(selectedItems, bulkTo)}
            style={{ ...PRIMARY_BUTTON_STYLE, minHeight: 44, opacity: !bulkTo || busy ? 0.5 : 1 }}
          >
            Give {selectedItems.length}
          </button>
        </div>
      )}

      {lwd && !user.disabled_at && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "1.5rem" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirming !== "finish") return setConfirming("finish");
              setConfirming(null);
              act(() => postOffboardingFinishNow(staffId)).then((ok) => ok && onFinished?.());
            }}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}
          >
            {confirming === "finish"
              ? remaining > 0
                ? `Confirm — ${remaining} left go to the owner’s routing queue`
                : "Confirm — close their login now"
              : "Finish now"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirming !== "cancel") return setConfirming("cancel");
              setConfirming(null);
              act(() => deleteOffboarding(staffId)).then((ok) => ok && onFinished?.());
            }}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, color: t.edge2 }}
          >
            {confirming === "cancel" ? "Confirm — they’re staying" : "Cancel offboarding"}
          </button>
        </div>
      )}
    </div>
  );
}

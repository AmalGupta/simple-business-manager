import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { t } from "../../theme.js";
import { todayIso } from "../../lib/dates.js";
import { fetchAssignedWork, fetchStaffRoster, patchWork, postWorkHandoff } from "../../lib/api.js";
import { SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { PhoneLink } from "../../components/PhoneLink.jsx";
import { WorkCard } from "../../components/work/WorkCard.jsx";
import { categoryLabel, useLang, useT } from "../../lib/i18n.jsx";

/* Kept for callers that imported it from here before it moved (SBM-72). */
export { PassOnPicker } from "../../components/work/PassOnPicker.jsx";

const itemKey = (item) => `${item.kind}-${item.id}`;
const GENERAL_KEY = "general";
const siteKeyOf = (item) => item.site_id ?? GENERAL_KEY;
const FILTERS = ["all", "office", "factory"];

/* Within a site: urgent first, then plans that slipped into the past, then
   by planned day, then unplanned by due date. */
function cardOrder(today) {
  const rank = (i) => (i.urgent_at ? 0 : i.scheduled_for && i.scheduled_for < today ? 1 : i.scheduled_for ? 2 : 3);
  return (a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (a.urgent_at && b.urgent_at) return String(a.urgent_at).localeCompare(String(b.urgent_at));
    const ad = a.scheduled_for ?? a.due_date ?? "9999";
    const bd = b.scheduled_for ?? b.due_date ?? "9999";
    return ad.localeCompare(bd);
  };
}

/* Sites with urgent work first, then alphabetical; work with no site last. */
function groupBySite(items, today) {
  const bySite = new Map();
  for (const item of items) {
    const key = siteKeyOf(item);
    if (!bySite.has(key)) {
      bySite.set(key, { key, name: item.site_name ?? null, phone: item.site_contact_number ?? null, items: [] });
    }
    bySite.get(key).items.push(item);
  }
  const groups = [...bySite.values()];
  for (const g of groups) g.items.sort(cardOrder(today));
  return groups.sort((a, b) => {
    if ((a.key === GENERAL_KEY) !== (b.key === GENERAL_KEY)) return a.key === GENERAL_KEY ? 1 : -1;
    const ua = a.items.some((i) => i.urgent_at);
    const ub = b.items.some((i) => i.urgent_at);
    if (ua !== ub) return ua ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

/* SBM-72 — staff "Assigned work" as metro cards, grouped by site like the
   Complaints page. Each site header opens the site; each card is one task
   (call todo, site stage, or complaint) with plan / done / pass on right on
   it. Replaces SBM-67's site tiles → Office/Factory tabs drill-down; the
   Office / Factory split survives as a filter and a tag on each card.
   Screen text follows the staff member's display language. */
export function AssignedWorkView({
  forUserId = null,
  selfId,
  canAdmin = false,
  location = null,
  onSelectLocation,
  onAddSite,
  onBack,
  onOpenSite,
  onOpenCall,
  onOpenComplaint,
  onChanged,
}) {
  const tr = useT();
  const lang = useLang();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [roster, setRoster] = useState([]);
  const [busyKeys, setBusyKeys] = useState(() => new Set());
  const today = todayIso();
  const subjectId = forUserId ?? selfId;
  const filter = FILTERS.includes(location) ? location : "all";

  const load = useCallback(() => {
    return fetchAssignedWork({ forUserId })
      .then((rows) => {
        setItems(rows);
        setError(null);
      })
      .catch((err) => {
        console.error("[sbm] failed to load assigned work", err);
        setError(tr("couldntLoadWork"));
      });
  }, [forUserId, tr]);

  useEffect(() => {
    load();
    fetchStaffRoster()
      .then(setRoster)
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  }, [load]);

  const withBusy = useCallback(
    async (item, fn) => {
      const key = itemKey(item);
      setBusyKeys((s) => new Set(s).add(key));
      try {
        await fn();
        onChanged?.();
      } catch (err) {
        console.error("[sbm] assigned work update failed", err);
        window.alert(err.message || tr("failedTryAgain"));
        await load();
      } finally {
        setBusyKeys((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    },
    [load, onChanged, tr]
  );

  const removeItem = (item) => setItems((list) => list.filter((i) => itemKey(i) !== itemKey(item)));

  const cardProps = {
    today,
    canAdmin,
    roster,
    selfId: subjectId,
    onOpenSite,
    onOpenCall,
    onOpenComplaint,
    onSchedule: (item, date) =>
      withBusy(item, async () => {
        await patchWork(item.kind, item.id, { scheduled_for: date }, { forUserId });
        setItems((list) => list.map((i) => (itemKey(i) === itemKey(item) ? { ...i, scheduled_for: date } : i)));
      }),
    onDone: (item) =>
      withBusy(item, async () => {
        await patchWork(item.kind, item.id, { status: "done" }, { forUserId });
        removeItem(item);
      }),
    onHandOff: (item, toUserId) =>
      withBusy(item, async () => {
        await postWorkHandoff(item.kind, item.id, toUserId, { forUserId });
        removeItem(item);
      }),
  };

  const counts = useMemo(() => {
    const c = { all: 0, office: 0, factory: 0 };
    for (const i of items ?? []) {
      c.all += 1;
      if (i.kind !== "complaint") c[i.work_location === "factory" ? "factory" : "office"] += 1;
    }
    return c;
  }, [items]);
  const visible = useMemo(
    () => (items ?? []).filter((i) => filter === "all" || (i.kind !== "complaint" && (i.work_location ?? "office") === filter)),
    [items, filter]
  );
  const groups = useMemo(() => groupBySite(visible, today), [visible, today]);

  return (
    <div>
      <BackLink onClick={onBack}>{tr("back")}</BackLink>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: "1rem" }}>
        <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>{tr("assignedWork")}</h1>
        {onAddSite && (
          <button
            type="button"
            onClick={onAddSite}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={14} /> {tr("newSite")}
          </button>
        )}
      </div>

      {error && <p style={{ fontSize: 14, color: t.edge2 }}>{error}</p>}
      {!items && !error && <p style={{ fontSize: 14, color: t.edge2 }}>{tr("loading")}</p>}

      {items && items.length > 0 && (
        <div role="tablist" aria-label={tr("assignedWork")} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.25rem" }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => onSelectLocation?.(f === "all" ? null : f)}
              style={{
                ...SMALL_SECONDARY_BUTTON_STYLE,
                minHeight: 40,
                ...(filter === f ? { background: t.accent, color: t.white, borderColor: t.accent } : {}),
              }}
            >
              {f === "all" ? tr("filterAll") : categoryLabel(lang, f)} ({counts[f]})
            </button>
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>{tr("nothingAssigned")}</p>
        </Card>
      )}

      {groups.map((g) => (
        <section key={g.key} style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {g.key !== GENERAL_KEY && onOpenSite ? (
              <button
                type="button"
                onClick={() => onOpenSite(g.name)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 36,
                  fontFamily: t.label,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: t.accent,
                }}
              >
                <MapPin size={13} /> {g.name} · {g.items.length}
              </button>
            ) : (
              <span style={{ fontFamily: t.label, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: t.edge }}>
                {g.key === GENERAL_KEY ? tr("general") : g.name} · {g.items.length}
              </span>
            )}
            {g.phone && <PhoneLink phone={g.phone} />}
          </div>
          {g.key === GENERAL_KEY && <p style={{ fontSize: 12, color: t.edge2, margin: "-4px 0 8px" }}>{tr("notLinkedToSite")}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {g.items.map((item) => (
              <WorkCard key={itemKey(item)} item={item} busy={busyKeys.has(itemKey(item))} showSite={false} {...cardProps} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

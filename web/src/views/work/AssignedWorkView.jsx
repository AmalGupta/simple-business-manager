import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, ChevronRight, MapPin, MessageSquareWarning, Phone, Plus, Star } from "lucide-react";
import { t } from "../../theme.js";
import { fmtDate, fmtShort, todayIso } from "../../lib/dates.js";
import { STAFF_HIDDEN_WORKFLOW_CATEGORIES, WORKFLOW_CATEGORY_LABEL, WORK_LOCATIONS } from "../../lib/constants.js";
import { fetchAssignedWork, fetchStaffRoster, patchWork, postWorkHandoff } from "../../lib/api.js";
import { SMALL_SECONDARY_BUTTON_STYLE, TEXT_INPUT_STYLE, TILE_ROW_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { PhoneLink } from "../../components/PhoneLink.jsx";
import { urgentDeadline, fmtTimeLeft } from "./workDates.js";
import { CarriedForwardLabel } from "./CarriedForwardLabel.jsx";
import { TodoContext } from "../../components/TodoContext.jsx";

const UNPLANNED_PAGE = 30;

const sectionLabelStyle = {
  fontFamily: t.label,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge,
  margin: "0 0 6px",
};

const itemKey = (item) => `${item.kind}-${item.id}`;

/* SBM-67: work is grouped into one tile per site. Work with no site goes
   under a single "General" tile. */
const GENERAL_KEY = "general";
const siteKeyOf = (item) => item.site_id ?? GENERAL_KEY;

/* One tile per site: name, contact number, open/urgent counts and the
   Office/Factory split. Urgent sites first, then alphabetical; General last. */
function groupBySite(items) {
  const bySite = new Map();
  for (const item of items) {
    const key = siteKeyOf(item);
    if (!bySite.has(key)) {
      bySite.set(key, {
        key,
        name: key === GENERAL_KEY ? "General" : item.site_name ?? "Unnamed site",
        phone: item.site_contact_number ?? null,
        count: 0,
        urgent: 0,
        office: 0,
        factory: 0,
      });
    }
    const g = bySite.get(key);
    g.count += 1;
    if (item.urgent_at) g.urgent += 1;
    if (item.work_location === "factory") g.factory += 1;
    else g.office += 1;
  }
  return [...bySite.values()].sort((a, b) => {
    if ((a.key === GENERAL_KEY) !== (b.key === GENERAL_KEY)) return a.key === GENERAL_KEY ? 1 : -1;
    if (a.urgent !== b.urgent) return b.urgent - a.urgent;
    return a.name.localeCompare(b.name);
  });
}

/* Urgent first, then plans that slipped into the past, then by planned
   day, then everything not yet planned. */
function groupItems(items, today) {
  const urgent = [];
  const overdue = [];
  const byDay = new Map();
  const unplanned = [];
  for (const item of items) {
    if (item.urgent_at) urgent.push(item);
    else if (!item.scheduled_for) unplanned.push(item);
    else if (item.scheduled_for < today) overdue.push(item);
    else {
      if (!byDay.has(item.scheduled_for)) byDay.set(item.scheduled_for, []);
      byDay.get(item.scheduled_for).push(item);
    }
  }
  urgent.sort((a, b) => String(a.urgent_at).localeCompare(String(b.urgent_at)));
  overdue.sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  unplanned.sort((a, b) => {
    const ad = a.due_date ?? "9999";
    const bd = b.due_date ?? "9999";
    return ad.localeCompare(bd);
  });
  return { urgent, overdue, days, unplanned };
}

export function PassOnPicker({ roster, selfId, busy, onPick, onCancel }) {
  const [to, setTo] = useState("");
  const options = roster.filter((s) => s.id !== selfId);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
      <select
        aria-label="Pass on to"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{ ...TEXT_INPUT_STYLE, gridColumn: "1 / -1", minHeight: 44 }}
      >
        <option value="">Pass on to…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!to || busy}
        onClick={() => onPick(to)}
        style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, background: t.accent, color: t.white, border: "none", opacity: !to || busy ? 0.5 : 1 }}
      >
        Pass on
      </button>
      <button type="button" onClick={onCancel} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44 }}>
        Cancel
      </button>
    </div>
  );
}

function WorkRow({ item, first, today, canAdmin, roster, selfId, busy, hideSite, onSchedule, onDone, onHandOff, onOpenSite, onOpenCall, onOpenComplaint }) {
  const [passing, setPassing] = useState(false);
  const urgent = Boolean(item.urgent_at);
  const deadline = urgent ? urgentDeadline(item.urgent_at) : null;
  const overdue = !urgent && item.scheduled_for && item.scheduled_for < today;
  /* SBM-68: staff do see an Admin & Intake stage assigned to them, but not
     its category heading — that category stays admin-only. */
  const hideCategory = !canAdmin && STAFF_HIDDEN_WORKFLOW_CATEGORIES.includes(item.category);
  const context =
    item.kind === "site_task"
      ? hideCategory
        ? null
        : WORKFLOW_CATEGORY_LABEL[item.category] ?? item.category
      : item.client_name;

  return (
    <div
      style={{
        ...TILE_ROW_STYLE,
        padding: "12px 0",
        ...(first ? { borderTop: "none" } : {}),
        ...(urgent ? { background: t.signalBg, margin: "0 -1.25rem", padding: "12px 1.25rem" } : {}),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        {item.kind === "complaint" && onOpenComplaint ? (
          <button
            type="button"
            onClick={() => onOpenComplaint(item.id)}
            style={{ all: "unset", cursor: "pointer", fontSize: 15, fontWeight: 500, color: t.edge, lineHeight: 1.4 }}
          >
            {item.title}
          </button>
        ) : (
          <span style={{ fontSize: 15, fontWeight: 500, color: t.edge, lineHeight: 1.4 }}>
            {item.title}
            <TodoContext text={item.context} />
          </span>
        )}
        {urgent ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: t.signal, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
            <AlertTriangle size={13} /> {fmtTimeLeft(deadline)}
          </span>
        ) : (
          item.due_date && (
            <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>due {fmtShort(item.due_date)}</span>
          )
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4, fontSize: 12, color: t.edge2 }}>
        {item.site_name && !hideSite && (
          <button
            type="button"
            onClick={() => onOpenSite(item.site_name)}
            style={{ all: "unset", cursor: "pointer", color: t.accent, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}
          >
            <MapPin size={12} /> {item.site_name}
          </button>
        )}
        {item.call_id && (
          <button
            type="button"
            onClick={() => onOpenCall(item.call_id)}
            style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <Phone size={12} /> {context}
          </button>
        )}
        {item.kind === "site_task" && context && <span>{context}</span>}
        {item.kind === "complaint" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <MessageSquareWarning size={12} /> Complaint
          </span>
        )}
        {item.important_at && (
          <span style={{ color: t.accent, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
            <Star size={12} /> Important
          </span>
        )}
        {overdue && <span style={{ color: t.putty, fontWeight: 700 }}>planned {fmtShort(item.scheduled_for)}</span>}
      </div>
      <CarriedForwardLabel item={item} style={{ fontSize: 12, marginTop: 4 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "center", marginTop: 10 }}>
        {urgent && !canAdmin ? (
          <span style={{ gridColumn: "1 / -1", fontSize: 12, fontWeight: 700, color: t.signal }}>
            Urgent — finish today, can’t be moved
          </span>
        ) : (
          <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.edge2 }}>
            Plan for
            <input
              type="date"
              aria-label="Plan for date"
              value={item.scheduled_for ?? ""}
              min={canAdmin ? undefined : today}
              disabled={busy}
              onChange={(e) => onSchedule(item, e.target.value || null)}
              style={{ ...TEXT_INPUT_STYLE, minHeight: 44, flex: 1, minWidth: 0 }}
            />
          </label>
        )}
        {/* SBM-71: only an admin resolves a complaint; staff plan it and pass it on. */}
        {(item.kind !== "complaint" || canAdmin) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDone(item)}
            style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
          >
            <Check size={14} /> {item.kind === "complaint" ? "Resolve" : "Done"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setPassing((p) => !p)}
          style={{
            ...SMALL_SECONDARY_BUTTON_STYLE,
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            ...(item.kind === "complaint" && !canAdmin ? { gridColumn: "1 / -1" } : {}),
          }}
        >
          <ArrowRightLeft size={14} /> Pass on
        </button>
      </div>

      {passing && (
        <PassOnPicker
          roster={roster}
          selfId={selfId}
          busy={busy}
          onCancel={() => setPassing(false)}
          onPick={async (to) => {
            await onHandOff(item, to);
            setPassing(false);
          }}
        />
      )}
    </div>
  );
}

function Section({ label, items, ...rowProps }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p style={{ ...sectionLabelStyle, ...(label.danger ? { color: t.signal } : {}) }}>{label.text}</p>
      <Card style={{ paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}>
        {items.map((item, i) => (
          <WorkRow key={itemKey(item)} item={item} first={i === 0} busy={rowProps.busyKeys.has(itemKey(item))} {...rowProps} />
        ))}
      </Card>
    </div>
  );
}

const tabsCss = `
.sbm-work-tabs{display:flex;border-bottom:1px solid var(--color-line);margin:0 0 1rem}
.sbm-work-tab{appearance:none;border:1px solid transparent;border-bottom:none;background:transparent;margin:0 0 -1px;
  min-height:44px;padding:0 18px;font-family:var(--font-label),system-ui,sans-serif;font-size:11px;font-weight:700;
  letter-spacing:.04em;text-transform:uppercase;color:var(--color-slate);cursor:pointer}
.sbm-work-tab[aria-selected="true"]{background:var(--color-surface);border-color:var(--color-line);color:var(--color-ink);
  border-top-left-radius:6px;border-top-right-radius:6px}
`;

const tileButtonStyle = { all: "unset", cursor: "pointer", display: "block", minWidth: 0 };
const tileCardStyle = { height: "100%", minHeight: 112, display: "flex", flexDirection: "column", gap: 6 };

function NewSiteTile({ onOpen }) {
  return (
    <button type="button" onClick={onOpen} style={tileButtonStyle} aria-label="Create a new site">
      <Card style={{ ...tileCardStyle, alignItems: "center", justifyContent: "center", borderStyle: "dashed" }}>
        <Plus size={22} color={t.accent} />
        <span style={{ fontSize: 14, fontWeight: 700, color: t.accent }}>New site</span>
      </Card>
    </button>
  );
}

function SiteTile({ site, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={tileButtonStyle}
      aria-label={`${site.name} — ${site.count} open${site.urgent ? `, ${site.urgent} urgent` : ""}`}
    >
      <Card style={tileCardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: t.edgeStrong, lineHeight: 1.3, overflowWrap: "anywhere" }}>
            {site.name}
          </span>
          <ChevronRight size={16} color={t.edge2} style={{ flexShrink: 0, marginTop: 2 }} />
        </div>
        {site.phone ? (
          <span style={{ fontSize: 12, color: t.edge2, display: "flex", alignItems: "center", gap: 4 }}>
            <Phone size={12} /> {site.phone}
          </span>
        ) : site.key !== GENERAL_KEY ? (
          <span style={{ fontSize: 12, color: t.edge2 }}>No contact number</span>
        ) : (
          <span style={{ fontSize: 12, color: t.edge2 }}>Not linked to a site</span>
        )}
        {site.urgent > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: t.signal }}>{site.urgent} urgent</span>
        )}
        <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: t.display, fontSize: 22, fontWeight: 700, color: t.accent, lineHeight: 1 }}>{site.count}</span>
          <span style={{ fontSize: 12, color: t.edge2 }}>
            {site.office} office · {site.factory} factory
          </span>
        </div>
      </Card>
    </button>
  );
}

function WorkSections({ groups, unplannedShown, onShowMore, rowProps, today }) {
  return (
    <>
      <Section label={{ text: "Urgent — due within 24 hours", danger: true }} items={groups.urgent} {...rowProps} />
      <Section label={{ text: "Planned earlier, not done" }} items={groups.overdue} {...rowProps} />
      {groups.days.map(([day, dayItems]) => (
        <Section
          key={day}
          label={{ text: day === today ? `Today · ${fmtDate(day)}` : fmtDate(day) }}
          items={dayItems}
          {...rowProps}
        />
      ))}
      <Section
        label={{ text: `Not planned yet (${groups.unplanned.length})` }}
        items={groups.unplanned.slice(0, unplannedShown)}
        {...rowProps}
      />
      {groups.unplanned.length > unplannedShown && (
        <button type="button" onClick={onShowMore} style={{ ...SMALL_SECONDARY_BUTTON_STYLE, minHeight: 44, width: "100%" }}>
          Show more ({groups.unplanned.length - unplannedShown} left)
        </button>
      )}
    </>
  );
}

/* Staff "Assigned work" — every open call todo and site task assigned to
   one staff member. SBM-67: opens on a grid of site tiles (name, contact
   number, counts) plus a "New site" tile and a "General" tile for work not
   linked to a site. Opening a site shows its work split into Office and
   Factory tabs; inside a tab, the day-planned list is unchanged — plan each
   item onto a day, mark done, or pass it on. Urgent items (flagged by an
   admin while routing the call) can't be moved by staff.

   The open site and tab live on the view (siteKey / location) so going to
   a call or site page and coming back lands in the same place. */
export function AssignedWorkView({
  forUserId = null,
  selfId,
  canAdmin = false,
  siteKey = null,
  location = null,
  onSelectSite,
  onSelectLocation,
  onAddSite,
  onBack,
  onOpenSite,
  onOpenCall,
  onOpenComplaint,
  onChanged,
}) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [roster, setRoster] = useState([]);
  const [busyKeys, setBusyKeys] = useState(() => new Set());
  const [unplannedShown, setUnplannedShown] = useState(UNPLANNED_PAGE);
  const today = todayIso();
  const subjectId = forUserId ?? selfId;

  const load = useCallback(() => {
    return fetchAssignedWork({ forUserId })
      .then((rows) => {
        setItems(rows);
        setError(null);
      })
      .catch((err) => {
        console.error("[sbm] failed to load assigned work", err);
        setError("Couldn’t load assigned work. Go back and try again.");
      });
  }, [forUserId]);

  useEffect(() => {
    load();
    fetchStaffRoster()
      .then(setRoster)
      .catch((err) => console.error("[sbm] failed to load staff roster", err));
  }, [load]);

  useEffect(() => {
    setUnplannedShown(UNPLANNED_PAGE);
  }, [siteKey, location]);

  const withBusy = useCallback(
    async (item, fn) => {
      const key = itemKey(item);
      setBusyKeys((s) => new Set(s).add(key));
      try {
        await fn();
        onChanged?.();
      } catch (err) {
        console.error("[sbm] assigned work update failed", err);
        window.alert(err.message || "Update failed");
        await load();
      } finally {
        setBusyKeys((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    },
    [load, onChanged]
  );

  const removeItem = (item) => setItems((list) => list.filter((i) => itemKey(i) !== itemKey(item)));

  const rowProps = {
    today,
    canAdmin,
    roster,
    selfId: subjectId,
    busyKeys,
    hideSite: siteKey !== null,
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

  const sites = useMemo(() => (items ? groupBySite(items) : null), [items]);
  const siteItems = useMemo(
    () => (items && siteKey ? items.filter((i) => siteKeyOf(i) === siteKey) : []),
    [items, siteKey]
  );
  const counts = useMemo(() => {
    const c = { office: 0, factory: 0 };
    for (const i of siteItems) c[i.work_location === "factory" ? "factory" : "office"] += 1;
    return c;
  }, [siteItems]);
  /* No tab chosen yet: open on whichever side has work, Office first. */
  const activeLocation = location ?? (counts.office === 0 && counts.factory > 0 ? "factory" : "office");
  const groups = useMemo(
    () =>
      groupItems(
        siteItems.filter((i) => (i.work_location === "factory" ? "factory" : "office") === activeLocation),
        today
      ),
    [siteItems, activeLocation, today]
  );

  const heading = (text) => (
    <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>{text}</h1>
  );
  const status = (
    <>
      {error && <p style={{ fontSize: 14, color: t.edge2 }}>{error}</p>}
      {!items && !error && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}
    </>
  );

  /* ---- One site: Office / Factory tabs -------------------------------- */
  if (siteKey) {
    const site = sites?.find((s) => s.key === siteKey) ?? null;
    const siteName = site?.name ?? (siteKey === GENERAL_KEY ? "General" : "Site");
    const tabItemCount = counts[activeLocation];
    return (
      <div>
        <style>{tabsCss}</style>
        <BackLink onClick={() => onSelectSite(null)}>All sites</BackLink>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: "1rem" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0, overflowWrap: "anywhere" }}>
              {siteName}
            </h1>
            {siteKey !== GENERAL_KEY && site && (
              <button
                type="button"
                onClick={() => onOpenSite(site.name)}
                style={{ all: "unset", cursor: "pointer", color: t.accent, fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, minHeight: 32 }}
              >
                <MapPin size={13} /> Open site page
              </button>
            )}
          </div>
          <PhoneLink phone={site?.phone} />
        </div>

        {status}

        {items && (
          <>
            <div className="sbm-work-tabs" role="tablist" aria-label="Where the work happens">
              {WORK_LOCATIONS.map((loc) => (
                <button
                  key={loc.key}
                  type="button"
                  role="tab"
                  className="sbm-work-tab"
                  aria-selected={activeLocation === loc.key}
                  onClick={() => onSelectLocation(loc.key)}
                >
                  {loc.label} ({counts[loc.key]})
                </button>
              ))}
            </div>

            {tabItemCount === 0 ? (
              <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>
                  {siteItems.length === 0
                    ? "Nothing left here."
                    : `No ${activeLocation} work at ${siteKey === GENERAL_KEY ? "this list" : "this site"}.`}
                </p>
              </Card>
            ) : (
              <WorkSections
                groups={groups}
                today={today}
                rowProps={rowProps}
                unplannedShown={unplannedShown}
                onShowMore={() => setUnplannedShown((n) => n + UNPLANNED_PAGE)}
              />
            )}
          </>
        )}
      </div>
    );
  }

  /* ---- Site tiles ------------------------------------------------------ */
  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      {heading("Assigned work")}
      {status}

      {sites && (
        <>
          {items.length === 0 && (
            <p style={{ fontSize: 14, color: t.edge2, margin: "0 0 1rem" }}>Nothing assigned right now.</p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
            {onAddSite && <NewSiteTile onOpen={onAddSite} />}
            {sites.map((site) => (
              <SiteTile key={site.key} site={site} onOpen={() => onSelectSite(site.key)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

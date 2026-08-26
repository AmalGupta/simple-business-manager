import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { t } from "./theme.js";
import { today, dayKey, isoDate, fmtDate } from "./lib/dates.js";
import { Card } from "./components/Card.jsx";
import { BackLink } from "./components/BackLink.jsx";
import { TileLabel } from "./components/TileLabel.jsx";
import { StatCard } from "./components/StatCard.jsx";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "./styles.js";
import { AppHeader } from "./components/AppHeader.jsx";
import { LoginScreen } from "./views/auth/LoginScreen.jsx";
import { StaffTile } from "./views/staff/StaffTile.jsx";
import { WorkflowTilesRow } from "./views/home/WorkflowTilesRow.jsx";
import { WorkflowCategorySiteList } from "./views/home/WorkflowCategorySiteList.jsx";
import { SitesAttentionTile } from "./views/home/SitesAttentionTile.jsx";
import { EscalationsTile } from "./views/home/EscalationsTile.jsx";
import { StreakWall } from "./views/calls/StreakWall.jsx";
import { DayView } from "./views/calls/DayView.jsx";
import { CallsPageView } from "./views/calls/CallsPageView.jsx";
import { RecordingsPageView } from "./views/calls/RecordingsPageView.jsx";
import { CallDetail } from "./views/calls/CallDetail.jsx";
import { StaffDirectoryView } from "./views/staff/StaffDirectoryView.jsx";
import { SitesDirectoryView } from "./views/sites/SitesDirectoryView.jsx";
import { SitesReviewView } from "./views/sites/SitesReviewView.jsx";
import { SiteView } from "./views/sites/SiteView.jsx";
import {
  fetchCalls,
  fetchCall,
  fetchEscalations,
  fetchSitesAttention,
  fetchSites,
  postCreateSite,
  postEscalation,
  closeEscalationApi,
  patchTodo,
  fetchMe,
  postLogout,
  postResetPin,
  postUpdateMyPhone,
  fetchStaffRoster,
  fetchCallsCount,
  fetchOpenSiteTasks,
} from "./lib/api.js";

export default function SimpleBusinessManager() {
  const [calls, setCalls] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [sitesAttention, setSitesAttention] = useState([]);
  const [allSites, setAllSites] = useState([]);
  const [staffCount, setStaffCount] = useState(0);
  const [callsCount, setCallsCount] = useState(0);
  /* Open (assigned, not done) site tasks — scoped server-side to "mine" for
     a staff session, or every open assignment business-wide for admin/
     superadmin. See fetchOpenSiteTasks and migration 0013. */
  const [openSiteTasks, setOpenSiteTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [view, setView] = useState({ name: "home" });
  const [busyIds, setBusyIds] = useState(new Set());

  /* Fetched on demand when a `staff` session opens a call from their site's
     timeline — their bulk `calls` list is never loaded (see the `me` effect
     below), so this is the only path to a call's transcript for them. */
  const [fetchedCall, setFetchedCall] = useState(null);

  /* undefined = checking, null = logged out, object = logged in. See
     src/lib/auth.ts / LoginScreen above — additive session-cookie auth,
     the whole dashboard is now gated behind it. */
  const [me, setMe] = useState(undefined);

  /* `staff` lands on their personal workflow tiles instead of the office
     dashboard — migration 0011 (role split) plus migration 0013 (the
     workflow tiles themselves). admin/superadmin get the dashboard unchanged. */
  const homeView = me?.role === "staff" ? { name: "staff-home" } : { name: "home" };

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch((err) => {
        console.error("[sbm] session check failed", err);
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    if (me.role === "staff") {
      // No calls/escalations/attention tile for staff — they only ever see
      // their own assigned sites and their own open workflow tasks, both
      // already filtered server-side.
      setView({ name: "staff-home" });
      Promise.all([fetchSites(), fetchOpenSiteTasks()])
        .then(([sitesData, tasksData]) => {
          if (cancelled) return;
          setAllSites(sitesData);
          setOpenSiteTasks(tasksData);
        })
        .catch((err) => {
          console.error("[sbm] failed to load sites", err);
          if (!cancelled) setLoadError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    setView({ name: "home" });
    Promise.all([
      fetchCalls(),
      fetchEscalations(),
      fetchSitesAttention(),
      fetchSites(),
      fetchStaffRoster(),
      fetchCallsCount(),
      fetchOpenSiteTasks(),
    ])
      .then(([callsData, escalationsData, attentionData, sitesData, staffData, callsCountData, tasksData]) => {
        if (cancelled) return;
        setCalls(callsData);
        setEscalations(escalationsData);
        setSitesAttention(attentionData);
        setAllSites(sitesData);
        setStaffCount(staffData.length);
        setCallsCount(callsCountData.count);
        setOpenSiteTasks(tasksData);
      })
      .catch((err) => {
        console.error("[sbm] failed to load calls", err);
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [me]);

  const refreshOpenSiteTasks = useCallback(async () => {
    const tasksData = await fetchOpenSiteTasks();
    setOpenSiteTasks(tasksData);
  }, []);

  const onLogout = useCallback(async () => {
    await postLogout();
    setMe(null);
    setView({ name: "home" });
  }, []);

  const onResetPin = useCallback(async (currentPin, newPin) => {
    await postResetPin(currentPin, newPin);
  }, []);

  const onUpdatePhone = useCallback(async (phone) => {
    const result = await postUpdateMyPhone(phone);
    setMe((m) => (m ? { ...m, phone: result.phone } : m));
  }, []);

  const refreshSites = useCallback(async () => {
    const [sitesData, attentionData] = await Promise.all([fetchSites(), fetchSitesAttention()]);
    setAllSites(sitesData);
    setSitesAttention(attentionData);
  }, []);

  /* "Add new site": create, refresh the site list so SiteView can find the
     new record, then hand off straight into SiteView — team assignment and
     photo/video/voice-note upload already exist there, no need to
     duplicate that flow in the creation modal itself. */
  const onSiteCreated = useCallback(
    async (name, address, pocName) => {
      const site = await postCreateSite(name, address, pocName);
      await refreshSites();
      setView({ name: "site", site: site.name, from: { name: "sites-directory" }, autoEdit: true });
      return site;
    },
    [refreshSites]
  );

  const onAddEscalation = useCallback(async (text) => {
    const created = await postEscalation(text, null);
    setEscalations((es) => [...es, created]);
  }, []);

  const onCloseEscalation = useCallback(async (id) => {
    setEscalations((es) => es.filter((e) => e.id !== id));
    try {
      await closeEscalationApi(id);
    } catch (err) {
      console.error("[sbm] failed to close escalation", err);
      fetchEscalations().then(setEscalations).catch(() => {});
    }
  }, []);

  /* Tiles 1 & 2 — docs/ADDITIONAL_FEATURES_M0.md "Phase 1 home page".
     "Open" is a live snapshot (open items don't have a single day); "closed"
     is scoped to today specifically, via completed_at. */
  const todayCounts = useMemo(() => {
    const all = calls.flatMap((c) => c.todos);
    const now = today();
    const todayKey = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      open: all.filter((td) => td.status === "open").length,
      closed: all.filter((td) => td.status === "done" && dayKey(td.completed_at) === todayKey).length,
    };
  }, [calls]);

  /* Calendar month currently browsed — defaults to this month. Full month,
     not a rolling window: a fixed 28-day window didn't show a complete
     month and gave no way to look at an earlier one. */
  const [calMonth, setCalMonth] = useState(() => {
    const d = today();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const monthDays = useMemo(() => {
    const byDay = {};
    for (const c of calls) {
      const k = dayKey(c.recorded_at);
      byDay[k] = (byDay[k] ?? 0) + 1;
    }
    const now = today();
    const todayIso = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    const { year, month } = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoDate(year, month, day);
      const future = iso > todayIso;
      days.push({ date: iso, held: future ? null : true, calls: byDay[iso] ?? 0, future });
    }
    return days;
  }, [calls, calMonth]);

  const yearOptions = useMemo(() => {
    const current = today().getFullYear();
    const earliest = calls.reduce((min, c) => {
      const y = c.recorded_at ? new Date(c.recorded_at).getFullYear() : current;
      return Math.min(min, y);
    }, current);
    const out = [];
    for (let y = Math.min(earliest, current - 1); y <= current + 1; y++) out.push(y);
    return out;
  }, [calls]);

  const goToMonth = useCallback((year, month) => {
    if (month < 0) {
      year -= 1;
      month = 11;
    } else if (month > 11) {
      year += 1;
      month = 0;
    }
    setCalMonth({ year, month });
  }, []);

  /* Optimistic write, rolled back if D1 rejects it. */
  const mutate = useCallback(async (todo, patch) => {
    const prev = { status: todo.status, completed_at: todo.completed_at };
    setBusyIds((s) => new Set(s).add(todo.id));
    setCalls((cs) =>
      cs.map((c) => ({ ...c, todos: c.todos.map((td) => (td.id === todo.id ? { ...td, ...patch } : td)) }))
    );
    try {
      await patchTodo(todo.id, patch);
    } catch {
      setCalls((cs) =>
        cs.map((c) => ({ ...c, todos: c.todos.map((td) => (td.id === todo.id ? { ...td, ...prev } : td)) }))
      );
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(todo.id);
        return n;
      });
    }
  }, []);

  const onToggle = useCallback(
    (todo) =>
      mutate(
        todo,
        todo.status === "done"
          ? { status: "open", completed_at: null }
          : { status: "done", completed_at: new Date().toISOString() }
      ),
    [mutate]
  );

  const onPark = useCallback(
    (todo) => mutate(todo, { status: todo.status === "snoozed" ? "open" : "snoozed" }),
    [mutate]
  );

  const bulkCall = view.name === "call" ? calls.find((c) => c.id === view.id) : null;

  useEffect(() => {
    if (view.name !== "call" || bulkCall) {
      setFetchedCall(null);
      return;
    }
    // undefined = fetch in flight, distinct from null ("fetched, not found /
    // not permitted") so the render below can tell the two apart.
    setFetchedCall(undefined);
    let cancelled = false;
    fetchCall(view.id)
      .then((data) => {
        if (!cancelled) setFetchedCall(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load call", err);
        if (!cancelled) setFetchedCall(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.name, view.id, bulkCall]);

  const openCall = bulkCall ?? (view.name === "call" ? fetchedCall : null);

  const shell = (children) => (
    <div style={{ background: t.pane, minHeight: "100vh", fontFamily: t.body, color: t.edge }}>
      <style>{`
        *{box-sizing:border-box}
        button:focus-visible,a:focus-visible{outline:2px solid ${t.edge};outline-offset:2px}

        /* Cards read top-to-bottom in urgency order; the stagger says so. */
        @keyframes sbm-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .sbm-rise{animation:sbm-rise 260ms cubic-bezier(.22,.61,.36,1) both}

        /* Calendar days drawing in, staggered left to right. */
        @keyframes sbm-pane{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}
        .sbm-pane{animation:sbm-pane 300ms cubic-bezier(.22,.61,.36,1) both}

        .sbm-day{transition:border-color 140ms ease,background 140ms ease}
        @media (hover:hover){.sbm-day:hover{border-color:rgba(255,255,255,0.4)}}

        .sbm-tooltip{
          position:absolute;bottom:100%;left:50%;
          transform:translateX(-50%) translateY(-4px);
          margin-bottom:2px;padding:4px 8px;border-radius:4px;
          background:${t.white};color:${t.edge};
          font-size:11px;font-weight:500;white-space:nowrap;
          opacity:0;pointer-events:none;transition:opacity 120ms ease;z-index:10;
          box-shadow:0 2px 8px rgba(0,0,0,0.25);
        }
        @media (hover:hover){
          .sbm-tip:hover .sbm-tooltip{opacity:1}
        }
        .sbm-tip:focus-visible .sbm-tooltip{opacity:1}

        /* Unread-activity badge — the one deliberate pulse the design
           allows (CLAUDE.md): flags the other side having posted since you
           last did, stops the moment it's resolved (the badge just doesn't
           render once the count is back to zero). */
        @keyframes sbm-unread-pulse{
          0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.55)}
          50%{box-shadow:0 0 0 6px rgba(34,197,94,0)}
        }
        .sbm-unread-glow{animation:sbm-unread-pulse 2s ease-in-out infinite}

        /* Not a blanket kill: the frost must still change instantly, or
           completion becomes ambiguous. Only entrances are dropped. */
        @media (prefers-reduced-motion: reduce){
          .sbm-rise,.sbm-pane{animation:none}
          .sbm-day{transition:none}
          .sbm-unread-glow{animation:none;box-shadow:0 0 0 3px rgba(34,197,94,0.35)}
        }
      `}</style>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>{children}</main>
    </div>
  );

  if (me === undefined) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  if (me === null) return <LoginScreen onLogin={setMe} />;

  if (loading) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  if (loadError) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Couldn't load calls: {loadError}</p>);

  if (view.name === "call" && !bulkCall && fetchedCall === undefined) {
    return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  }

  if (openCall)
    return shell(
      <CallDetail
        call={openCall}
        onBack={() => setView(view.from ?? homeView)}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
        canManage={me.role !== "staff"}
      />
    );

  if (view.name === "call") {
    return shell(
      <div>
        <BackLink onClick={() => setView(view.from ?? homeView)}>Back</BackLink>
        <p style={{ fontSize: 14, color: t.edge2 }}>Couldn't load that call.</p>
      </div>
    );
  }

  if (view.name === "day")
    return shell(
      <DayView
        date={view.date}
        calls={calls}
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "day", date: view.date } })}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
      />
    );

  if (view.name === "site")
    return shell(
      <SiteView
        site={view.site}
        siteRecord={allSites.find((s) => s.name === view.site)}
        calls={calls}
        onBack={() => setView(view.from ?? homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "site", site: view.site, from: view.from } })}
        onSiteUpdated={refreshSites}
        autoEditDetails={Boolean(view.autoEdit)}
        canManage={me.role !== "staff"}
        myOpenTasks={openSiteTasks.filter((tk) => tk.site_name === view.site)}
        onTasksChanged={refreshOpenSiteTasks}
      />
    );

  if (view.name === "workflow-site-list")
    return shell(
      <WorkflowCategorySiteList
        tasks={openSiteTasks}
        category={view.category}
        onBack={() => setView(view.from ?? homeView)}
        onOpenSite={(site) => setView({ name: "site", site, from: view })}
      />
    );

  if (view.name === "calls")
    return shell(
      <CallsPageView
        calls={calls}
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "calls" } })}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
      />
    );

  if (view.name === "recordings")
    return shell(
      <RecordingsPageView
        calls={calls}
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "recordings" } })}
      />
    );

  if (view.name === "sites-review")
    return shell(<SitesReviewView sites={allSites} onBack={() => setView(homeView)} onSaved={refreshSites} />);

  if (view.name === "sites-directory")
    return shell(
      <>
        {me.role === "staff" && (
          <AppHeader me={me} onLogout={onLogout} onResetPin={onResetPin} onUpdatePhone={onUpdatePhone} />
        )}
        <SitesDirectoryView
          onBack={() => setView(homeView)}
          onOpenSite={(site) => setView({ name: "site", site, from: { name: "sites-directory" } })}
          onSiteCreated={onSiteCreated}
          canManage={me.role !== "staff"}
          isHome={me.role === "staff"}
        />
      </>
    );

  if (view.name === "staff-directory") return shell(<StaffDirectoryView onBack={() => setView(homeView)} />);

  if (view.name === "staff-home")
    return shell(
      <>
        <AppHeader me={me} onLogout={onLogout} onResetPin={onResetPin} onUpdatePhone={onUpdatePhone} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            marginBottom: "1.5rem",
          }}
        >
          <WorkflowTilesRow
            tasks={openSiteTasks}
            onOpenCategory={(category) => setView({ name: "workflow-site-list", category, from: { name: "staff-home" } })}
          />
        </div>

        {openSiteTasks.length === 0 && (
          <p style={{ fontSize: 14, color: t.edge2, marginBottom: "1.5rem" }}>Nothing assigned right now.</p>
        )}

        <button
          onClick={() => setView({ name: "sites-directory" })}
          style={{ all: "unset", cursor: "pointer", fontSize: 13, fontWeight: 600, color: t.accent }}
        >
          All my sites →
        </button>
      </>
    );

  return shell(
    <>
      <AppHeader
        me={me}
        onLogout={onLogout}
        onResetPin={onResetPin}
        onUpdatePhone={onUpdatePhone}
        right={<span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{fmtDate(new Date().toISOString())}</span>}
      >
        <StreakWall
          days={monthDays}
          onSelectDay={(date) => setView({ name: "day", date })}
          selected={null}
          year={calMonth.year}
          month={calMonth.month}
          yearOptions={yearOptions}
          onChangeYear={(y) => goToMonth(y, calMonth.month)}
          onChangeMonth={(m) => goToMonth(calMonth.year, m)}
          onPrevMonth={() => goToMonth(calMonth.year, calMonth.month - 1)}
          onNextMonth={() => goToMonth(calMonth.year, calMonth.month + 1)}
          todayIso={isoDate(today().getFullYear(), today().getMonth(), today().getDate())}
        />
      </AppHeader>

      {/* Home tile panel. Order (top to bottom): sites needing attention,
          escalations, staff, the dynamic workflow-category tiles (business-
          wide counts — see WorkflowTilesRow), then "open today" and "calls
          logged" at the very bottom. "Open today" moved off the top and the
          call-card feed moved to its own page (see "calls" view) — both per
          the admin-overview revision to this plan; "closed today" kept its
          original position. 2 columns on a phone; auto-widens toward one
          row as space allows. Every tile is fixed to --tile-height (see the
          Card `tile` variant) so the grid stays symmetrical regardless of
          content — list tiles (SitesAttentionTile, EscalationsTile) scroll
          internally instead of growing taller than their neighbours. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <StatCard value={todayCounts.closed} label="closed today" />
        <SitesAttentionTile
          sites={sitesAttention}
          onOpenSite={(site) => setView({ name: "site", site, from: { name: "home" } })}
          onReviewSites={() => setView({ name: "sites-review" })}
          onViewDirectory={() => setView({ name: "sites-directory" })}
          hasAnySites={allSites.length > 0}
          unconfirmedCount={allSites.filter((s) => s.is_confirmed === null).length}
          confirmedCount={allSites.filter((s) => s.is_confirmed === "Y").length}
        />
        <EscalationsTile
          escalations={escalations}
          onAdd={onAddEscalation}
          onClose={onCloseEscalation}
          busyIds={busyIds}
        />
        {(me.role === "admin" || me.role === "superadmin") && (
          <StaffTile count={staffCount} onOpen={() => setView({ name: "staff-directory" })} />
        )}
        <WorkflowTilesRow
          tasks={openSiteTasks}
          onOpenCategory={(category) => setView({ name: "workflow-site-list", category, from: { name: "home" } })}
        />
        <StatCard value={todayCounts.open} label="open today" />
        <button
          onClick={() => setView({ name: "calls" })}
          style={{ all: "unset", cursor: "pointer", display: "block" }}
          aria-label={`Calls logged — ${callsCount}`}
        >
          <Card tile>
            <TileLabel>calls logged</TileLabel>
            <div style={TILE_VALUE_ROW_STYLE}>
              <span style={TILE_NUMBER_STYLE}>{callsCount}</span>
            </div>
          </Card>
        </button>
        {/* Admin/superadmin only, same as "calls logged" — staff never load
            this home view at all (see homeView above). Separate control from
            Calls: recordings + sentence-format todos, not a todo checklist. */}
        <button
          onClick={() => setView({ name: "recordings" })}
          style={{ all: "unset", cursor: "pointer", display: "block" }}
          aria-label={`Recordings — ${callsCount}`}
        >
          <Card tile>
            <TileLabel>recordings</TileLabel>
            <div style={TILE_VALUE_ROW_STYLE}>
              <span style={TILE_NUMBER_STYLE}>{callsCount}</span>
            </div>
          </Card>
        </button>
      </div>
    </>
  );
}


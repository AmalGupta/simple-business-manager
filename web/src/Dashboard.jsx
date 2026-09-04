import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { t } from "./theme.js";
import { today, dayKey, isoDate, fmtDate } from "./lib/dates.js";
import { STAFF_HIDDEN_WORKFLOW_CATEGORIES } from "./lib/constants.js";
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
import { CallDetail } from "./views/calls/CallDetail.jsx";
import { OpenTodosView } from "./views/calls/OpenTodosView.jsx";
import { MyOpenTodosView } from "./views/calls/MyOpenTodosView.jsx";
import { StaffDirectoryView } from "./views/staff/StaffDirectoryView.jsx";
import { CallerTile } from "./views/callers/CallerTile.jsx";
import { CallersDirectoryView } from "./views/callers/CallersDirectoryView.jsx";
import { SitesDirectoryView } from "./views/sites/SitesDirectoryView.jsx";
import { AddSiteScreen } from "./views/sites/AddSiteScreen.jsx";
import { SitesReviewView } from "./views/sites/SitesReviewView.jsx";
import { SiteView } from "./views/sites/SiteView.jsx";
import { PendingWorkView } from "./views/home/PendingWorkView.jsx";
import { PendingWorkTile } from "./views/home/PendingWorkTile.jsx";
import { MyScheduleView } from "./views/home/MyScheduleView.jsx";
import { StaffScheduleTile } from "./views/home/StaffScheduleTile.jsx";
import { SiteVisitSiteList } from "./views/site-visit/SiteVisitSiteList.jsx";
import { SiteVisitCategoryGrid } from "./views/site-visit/SiteVisitCategoryGrid.jsx";
import { InstallationListView } from "./views/site-visit/InstallationListView.jsx";
import { InstallationScreen } from "./views/site-visit/InstallationScreen.jsx";
import { SiteComplaintForm } from "./views/site-visit/SiteComplaintForm.jsx";
import { ComplaintsHomeView } from "./views/site-visit/ComplaintsHomeView.jsx";
import { ComplaintsTile } from "./views/site-visit/ComplaintsTile.jsx";
import { MaterialShortagesTile } from "./views/material/MaterialShortagesTile.jsx";
import { MaterialShortagesView } from "./views/material/MaterialShortagesView.jsx";
import { CallsNeedingActionTile } from "./views/home/CallsNeedingActionTile.jsx";
import { CallsNeedingActionView } from "./views/calls/CallsNeedingActionView.jsx";
import {
  fetchCall,
  fetchCallsCalendar,
  fetchDashboardSummary,
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
  patchComplaint,
  fetchOpenSiteTasks,
  refreshCallsNeedingAction,
} from "./lib/api.js";

export default function SimpleBusinessManager() {
  const [calendarDays, setCalendarDays] = useState({});
  const [calendarMinYear, setCalendarMinYear] = useState(() => today().getFullYear());
  const [todoRefreshKey, setTodoRefreshKey] = useState(0);
  const [escalations, setEscalations] = useState([]);
  const [sitesAttention, setSitesAttention] = useState([]);
  const [allSites, setAllSites] = useState([]);
  const [staffRoster, setStaffRoster] = useState([]);
  const [callsCount, setCallsCount] = useState(0);
  const [callersCount, setCallersCount] = useState(0);
  const [callsNeedingActionCount, setCallsNeedingActionCount] = useState(0);
  /* Home open/closed tiles — from GET /api/dashboard/summary, not derived from
     the (possibly still-loading) calls list. Kept in sync on todo toggles. */
  const [openToday, setOpenToday] = useState(0);
  const [closedToday, setClosedToday] = useState(0);
  const [parkedCount, setParkedCount] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);
  /* Open (assigned, not done) site tasks — scoped server-side to "mine" for
     a staff session, or every open assignment business-wide for admin/
     superadmin. See fetchOpenSiteTasks and migration 0013. */
  const [openSiteTasks, setOpenSiteTasks] = useState([]);
  const [myOpenTodos, setMyOpenTodos] = useState([]);
  const [complaintsRefreshKey, setComplaintsRefreshKey] = useState(0);
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
  const [loginError, setLoginError] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("login_error") ? "Invalid name or PIN." : "";
  });
  const [loginInitialName, setLoginInitialName] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("login_error") ? (params.get("name") ?? "") : "";
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

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

  /* Home paints as soon as `me` is known. Tile data comes from one summary
     request; lean calls (+ transcript hydrate) load in the background for
     admin drilldowns and never block first paint. */
  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    // Clear prior session slices so a re-login does not flash stale tiles
    // while the new requests are in flight.
    setCalendarDays({});
    setCalendarMinYear(today().getFullYear());
    setTodoRefreshKey(0);
    setEscalations([]);
    setSitesAttention([]);
    setAllSites([]);
    setStaffRoster([]);
    setCallsCount(0);
    setCallersCount(0);
    setCallsNeedingActionCount(0);
    setOpenToday(0);
    setClosedToday(0);
    setParkedCount(0);
    setConfirmedCount(0);
    setUnconfirmedCount(0);
    setOpenSiteTasks([]);
    setMyOpenTodos([]);

    const applySummary = (summary) => {
      setAllSites(summary.sites ?? []);
      setOpenSiteTasks(summary.open_site_tasks ?? []);
      setMyOpenTodos(summary.my_open_todos ?? []);
      setConfirmedCount(summary.confirmed_count ?? 0);
      setUnconfirmedCount(summary.unconfirmed_count ?? 0);
      setOpenToday(summary.open_today ?? 0);
      setClosedToday(summary.closed_today ?? 0);
      setParkedCount(summary.parked_count ?? 0);
      setCallsCount(summary.calls_count ?? 0);
      setCallersCount(summary.callers_count ?? 0);
      setCallsNeedingActionCount(summary.calls_needing_action_count ?? 0);
      setSitesAttention(summary.sites_attention ?? []);
      setEscalations(summary.escalations ?? []);
      setStaffRoster(summary.staff_roster ?? []);
    };

    if (me.role === "staff") {
      setView({ name: "staff-home" });
      fetchDashboardSummary()
        .then((summary) => {
          if (!cancelled) applySummary(summary);
        })
        .catch((err) => console.error("[sbm] failed to load dashboard summary", err));
      return () => {
        cancelled = true;
      };
    }

    setView({ name: "home" });
    fetchDashboardSummary()
      .then((summary) => {
        if (cancelled) return;
        applySummary(summary);
      })
      .catch((err) => console.error("[sbm] failed to load dashboard summary", err));

    // Warm the Calls Needing Action cache in the background as soon as the
    // admin home loads, so opening the tile renders instantly from cache
    // instead of a loading spinner — see CallsNeedingActionView.jsx and
    // getCachedCallsNeedingAction/refreshCallsNeedingAction in lib/api.js.
    refreshCallsNeedingAction().catch((err) => console.error("[sbm] failed to prefetch calls needing action", err));

    return () => {
      cancelled = true;
    };
  }, [me]);

  const refreshOpenSiteTasks = useCallback(async () => {
    const tasksData = await fetchOpenSiteTasks();
    setOpenSiteTasks(tasksData);
  }, []);

  const onLogout = useCallback(() => {
    postLogout();
  }, []);

  const onAssignComplaint = useCallback(async (id, staffId) => {
    return patchComplaint(id, staffId);
  }, []);

  const onResetPin = useCallback(async (currentPin, newPin) => {
    await postResetPin(currentPin, newPin);
  }, []);

  const onUpdatePhone = useCallback(async (phone) => {
    const result = await postUpdateMyPhone(phone);
    setMe((m) => (m ? { ...m, phone: result.phone } : m));
  }, []);

  const refreshSites = useCallback(async () => {
    if (me?.role === "staff") {
      const sitesData = await fetchSites();
      setAllSites(sitesData);
      setConfirmedCount(sitesData.filter((s) => s.is_confirmed === "Y").length);
      setUnconfirmedCount(sitesData.filter((s) => s.is_confirmed === null).length);
      return;
    }
    const [sitesData, attentionData] = await Promise.all([fetchSites(), fetchSitesAttention()]);
    setAllSites(sitesData);
    setSitesAttention(attentionData);
    setConfirmedCount(sitesData.filter((s) => s.is_confirmed === "Y").length);
    setUnconfirmedCount(sitesData.filter((s) => s.is_confirmed === null).length);
  }, [me?.role]);

  /* "Add new site": create + refresh so scoped lists / SiteView can resolve
     the new record. Callers decide where to navigate afterward. */
  const createSiteAndRefresh = useCallback(
    async (details) => {
      const site = await postCreateSite(details);
      await refreshSites();
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

  /* Tiles 1 & 2 — open/closed counts come from dashboard summary (and are
     adjusted locally on todo toggles). Calendar still uses the calls list. */

  /* Calendar month currently browsed — defaults to this month. Full month,
     not a rolling window: a fixed 28-day window didn't show a complete
     month and gave no way to look at an earlier one. */
  const [calMonth, setCalMonth] = useState(() => {
    const d = today();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const monthDays = useMemo(() => {
    const now = today();
    const todayIso = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
    const { year, month } = calMonth;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = isoDate(year, month, day);
      const future = iso > todayIso;
      days.push({ date: iso, held: future ? null : true, calls: calendarDays[iso] ?? 0, future });
    }
    return days;
  }, [calendarDays, calMonth]);

  const yearOptions = useMemo(() => {
    const current = today().getFullYear();
    const earliest = Math.min(calendarMinYear, current - 1);
    const out = [];
    for (let y = earliest; y <= current + 1; y++) out.push(y);
    return out;
  }, [calendarMinYear]);

  const refreshCalendar = useCallback(async (year, month) => {
    try {
      const data = await fetchCallsCalendar(year, month + 1);
      setCalendarDays(data.days ?? {});
      if (data.min_year) setCalendarMinYear(data.min_year);
    } catch (err) {
      console.error("[sbm] failed to load calls calendar", err);
    }
  }, []);

  useEffect(() => {
    if (me?.role === "staff") return;
    refreshCalendar(calMonth.year, calMonth.month);
  }, [me?.role, calMonth.year, calMonth.month, refreshCalendar, todoRefreshKey]);

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

  /* Optimistic write, rolled back if D1 rejects it. Also keeps home
     open_today / closed_today in sync with the summary read model. */
  const mutate = useCallback(async (todo, patch) => {
    const prev = { status: todo.status, completed_at: todo.completed_at };
    const todayKey = isoDate(today().getFullYear(), today().getMonth(), today().getDate());
    const prevClosedToday = prev.status === "done" && dayKey(prev.completed_at) === todayKey;
    const nextClosedToday = patch.status === "done" && dayKey(patch.completed_at) === todayKey;
    const prevOpen = prev.status === "open";
    const nextOpen = patch.status === "open";
    const prevParked = prev.status === "snoozed";
    const nextParked = patch.status === "snoozed";

    const applyCountDelta = (fromPrev) => {
      const wasOpen = fromPrev ? prevOpen : nextOpen;
      const isOpen = fromPrev ? nextOpen : prevOpen;
      const wasClosedToday = fromPrev ? prevClosedToday : nextClosedToday;
      const isClosedToday = fromPrev ? nextClosedToday : prevClosedToday;
      const wasParked = fromPrev ? prevParked : nextParked;
      const isParked = fromPrev ? nextParked : prevParked;
      if (wasOpen && !isOpen) setOpenToday((n) => Math.max(0, n - 1));
      if (!wasOpen && isOpen) setOpenToday((n) => n + 1);
      if (wasClosedToday && !isClosedToday) setClosedToday((n) => Math.max(0, n - 1));
      if (!wasClosedToday && isClosedToday) setClosedToday((n) => n + 1);
      if (wasParked && !isParked) setParkedCount((n) => Math.max(0, n - 1));
      if (!wasParked && isParked) setParkedCount((n) => n + 1);
    };

    setBusyIds((s) => new Set(s).add(todo.id));
    applyCountDelta(true);
    try {
      await patchTodo(todo.id, patch);
      setTodoRefreshKey((k) => k + 1);
    } catch {
      applyCountDelta(false);
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

  /* Not optimistic — assignment (migration 0025: a todo can go to more than
     one staff member now) refreshes via key bump rather than a client-side
     merge, since the server response carries the full assignees[] list. */
  const onAssignTodo = useCallback(async (todoId, userIds) => {
    try {
      await patchTodo(todoId, { assigned_to_user_ids: userIds });
      setTodoRefreshKey((k) => k + 1);
    } catch (err) {
      throw err;
    }
  }, []);

  useEffect(() => {
    if (view.name !== "call") {
      setFetchedCall(null);
      return;
    }
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
  }, [view.name, view.id]);

  const openCall = view.name === "call" ? fetchedCall : null;

  const shell = (children, { wide = false, fillViewport = false } = {}) => (
    <div
      className={fillViewport ? "sbm-fill-viewport" : undefined}
      style={{
        background: t.pane,
        minHeight: "100vh",
        height: fillViewport ? "100vh" : undefined,
        overflow: fillViewport ? "hidden" : undefined,
        fontFamily: t.body,
        color: t.edge,
      }}
    >
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

        /* Call detail — transcript/details column, todos column. Single
           column stacked on mobile per this repo's mobile-first rule;
           side-by-side from 768px up (docs/BUILD_BRIEF.md). */
        .sbm-call-grid{display:flex;flex-direction:column;gap:1.5rem}
        @media (min-width:768px){
          .sbm-call-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:1.5rem;align-items:start}
        }

        /* Installation checklist — section table left, category timeline right. */
        .sbm-install-grid{display:flex;flex-direction:column;gap:1.25rem}
        @media (min-width:768px){
          .sbm-install-grid{display:grid;grid-template-columns:minmax(280px,340px) 1fr;gap:1.25rem;align-items:start}
        }

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

        /* Mobile-only: pin the Calls fill-viewport shell to the visual
           viewport so 100vh address-bar chrome cannot shrink the grid.
           Desktop keeps the original 100vh / in-flow height chain. */
        .sbm-fill-viewport{overscroll-behavior:none}
        @media (max-width:640px){
          .sbm-fill-viewport{
            position:fixed;inset:0;width:100%;
            height:auto;min-height:0;
            display:flex;flex-direction:column;
          }
          .sbm-fill-viewport>main{
            flex:1 1 auto;width:100%;overscroll-behavior:none;
          }
        }
      `}</style>
      <main
        style={{
          maxWidth: wide ? 1100 : 720,
          margin: "0 auto",
          padding: fillViewport ? "1rem 1.25rem 1rem" : "2rem 1.25rem 4rem",
          height: fillViewport ? "100%" : undefined,
          minHeight: fillViewport ? 0 : undefined,
          overflow: fillViewport ? "hidden" : undefined,
          display: fillViewport ? "flex" : undefined,
          flexDirection: fillViewport ? "column" : undefined,
        }}
      >
        {children}
      </main>
    </div>
  );

  if (me === undefined) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  if (me === null) {
    return <LoginScreen error={loginError} initialName={loginInitialName} />;
  }

  if (view.name === "call" && fetchedCall === undefined) {
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
        staffRoster={staffRoster}
        onAssign={onAssignTodo}
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
        onBack={() => setView(homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "day", date: view.date } })}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
        refreshKey={todoRefreshKey}
      />
    );

  if (view.name === "site")
    return shell(
      <SiteView
        site={view.site}
        siteRecord={allSites.find((s) => s.name === view.site)}
        onBack={() => setView(view.from ?? homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "site", site: view.site, from: view.from } })}
        onSiteUpdated={refreshSites}
        autoEditDetails={Boolean(view.autoEdit)}
        canManage={me.role !== "staff"}
        myOpenTasks={openSiteTasks.filter((tk) => tk.site_name === view.site)}
        onTasksChanged={refreshOpenSiteTasks}
        staffRoster={staffRoster}
        onAssignTodo={onAssignTodo}
      />
    );

  if (view.name === "workflow-site-list") {
    if (me.role === "staff" && STAFF_HIDDEN_WORKFLOW_CATEGORIES.includes(view.category)) {
      return shell(
        <div>
          <BackLink onClick={() => setView(view.from ?? homeView)}>Back</BackLink>
          <p style={{ fontSize: 14, color: t.edge2 }}>That category is not available for staff.</p>
        </div>
      );
    }
    return shell(
      <WorkflowCategorySiteList
        tasks={openSiteTasks}
        category={view.category}
        onBack={() => setView(view.from ?? homeView)}
        onOpenSite={(site) => setView({ name: "site", site, from: view })}
      />
    );
  }

  if (view.name === "calls")
    return shell(
      <CallsPageView
        onBack={() => setView(homeView)}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
        onCallsChanged={() => refreshCalendar(calMonth.year, calMonth.month)}
      />,
      { wide: true, fillViewport: true }
    );

  if (view.name === "open-todos")
    return shell(
      <OpenTodosView
        staffRoster={staffRoster}
        onBack={() => setView(view.from ?? homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "open-todos" } })}
        onAssign={onAssignTodo}
        status="open"
        refreshKey={todoRefreshKey}
      />
    );

  if (view.name === "parked-todos")
    return shell(
      <OpenTodosView
        staffRoster={staffRoster}
        onBack={() => setView(view.from ?? homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "parked-todos" } })}
        onAssign={onAssignTodo}
        onToggle={onToggle}
        onPark={onPark}
        busyIds={busyIds}
        status="snoozed"
        refreshKey={todoRefreshKey}
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
          onBack={() => setView(view.from ?? homeView)}
          onOpenSite={(site) => setView({ name: "site", site, from: view })}
          onAddSite={() => setView({ name: "add-site", from: view, afterCreate: { name: "site" } })}
          isHome={me.role === "staff" && (!view.from || view.from.name === "staff-home")}
        />
      </>
    );

  if (view.name === "add-site")
    return shell(
      <AddSiteScreen
        defaultAssignedBy={me?.name ?? ""}
        onBack={() => setView(view.from ?? homeView)}
        onCreate={createSiteAndRefresh}
        onDone={(site) => {
          const next = view.afterCreate?.name;
          if (next === "site-visit-category") {
            setView({ name: "site-visit-category", site, from: view.from ?? homeView });
          } else if (next === "site-complaint") {
            setView({ name: "site-complaint", site, from: view.from ?? homeView });
          } else {
            setView({ name: "site", site: site.name, from: view.from ?? homeView });
          }
        }}
      />
    );

  if (view.name === "staff-directory") return shell(<StaffDirectoryView onBack={() => setView(homeView)} />);

  if (view.name === "callers-directory") return shell(<CallersDirectoryView onBack={() => setView(homeView)} />);

  if (view.name === "calls-needing-action")
    return shell(
      <CallsNeedingActionView
        staffRoster={staffRoster}
        onAssignTodo={onAssignTodo}
        onResolved={() => setCallsNeedingActionCount((n) => Math.max(0, n - 1))}
        onBack={() => setView(view.from ?? homeView)}
      />,
      { wide: true }
    );

  if (view.name === "staff-home")
    return shell(
      <>
        <AppHeader me={me} onLogout={onLogout} onResetPin={onResetPin} onUpdatePhone={onUpdatePhone} />

        {/* Staff home tiles: Pending Work, To-Do / Calendar, Site Visit,
            Complaints, and optional call todos when assigned. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            marginBottom: "1.5rem",
          }}
        >
          <PendingWorkTile
            count={openSiteTasks.length}
            onOpen={() => setView({ name: "pending-work", from: { name: "staff-home" } })}
          />

          <StaffScheduleTile
            count={myOpenTodos.length + openSiteTasks.length}
            onOpen={() => setView({ name: "my-schedule", from: { name: "staff-home" } })}
          />

          <button
            onClick={() => setView({ name: "site-visit-sites", from: { name: "staff-home" } })}
            style={{ all: "unset", cursor: "pointer", display: "block" }}
            aria-label="Site Visit"
          >
            <Card tile style={{ display: "flex", alignItems: "center" }}>
              <TileLabel action={<MapPin size={14} color={t.edge2} />}>Site Visit</TileLabel>
            </Card>
          </button>

          <ComplaintsTile
            refreshKey={complaintsRefreshKey}
            onOpen={() => setView({ name: "complaints-home", from: { name: "staff-home" } })}
          />

          {myOpenTodos.length > 0 && (
            <button
              onClick={() => setView({ name: "my-open-todos", from: { name: "staff-home" } })}
              style={{ all: "unset", cursor: "pointer", display: "block" }}
              aria-label={`My call tasks — ${myOpenTodos.length} open`}
            >
              <Card tile>
                <TileLabel>My call tasks</TileLabel>
                <div style={TILE_VALUE_ROW_STYLE}>
                  <span style={TILE_NUMBER_STYLE}>{myOpenTodos.length}</span>
                </div>
              </Card>
            </button>
          )}
        </div>

        {openSiteTasks.length === 0 && myOpenTodos.length === 0 && (
          <p style={{ fontSize: 14, color: t.edge2, marginBottom: "1.5rem" }}>Nothing assigned right now.</p>
        )}

        <button
          onClick={() => setView({ name: "sites-directory", from: { name: "staff-home" } })}
          style={{ all: "unset", cursor: "pointer", fontSize: 13, fontWeight: 600, color: t.accent }}
        >
          All my sites →
        </button>
      </>
    );

  if (view.name === "pending-work")
    return shell(
      <PendingWorkView
        tasks={openSiteTasks}
        onBack={() => setView(view.from ?? homeView)}
        onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: view })}
      />
    );

  if (view.name === "my-schedule")
    return shell(
      <MyScheduleView
        todos={myOpenTodos}
        siteTasks={openSiteTasks}
        onBack={() => setView(view.from ?? homeView)}
        onOpenCall={(id) => setView({ name: "call", id, from: { name: "my-schedule" } })}
        onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: view })}
      />
    );

  if (view.name === "my-open-todos")
    return shell(
      <MyOpenTodosView
        todos={myOpenTodos}
        onBack={() => setView(view.from ?? homeView)}
        onOpenCall={(id) => setView({ name: "call", id, from: { name: "my-open-todos" } })}
        onToggle={onToggle}
        busyIds={busyIds}
      />
    );

  // --- Staff field workflow (migration 0016): site visit -> category ->
  // installation checklist, and the site-level complaint form. ---

  if (view.name === "site-visit-sites")
    return shell(
      <SiteVisitSiteList
        onBack={() => setView(view.from ?? homeView)}
        onSelectSite={(site) => setView({ name: "site-visit-category", site, from: view })}
        onAddSite={() =>
          setView({ name: "add-site", from: view, afterCreate: { name: "site-visit-category" } })
        }
      />
    );

  if (view.name === "complaints-home")
    return shell(
      <ComplaintsHomeView
        refreshKey={complaintsRefreshKey}
        onBack={() => setView(view.from ?? homeView)}
        onAddComplaint={() => setView({ name: "complaint-sites", from: view })}
        canAdd={me.role === "staff"}
        canAssign={me.role !== "staff"}
        staffRoster={staffRoster}
        onAssignComplaint={onAssignComplaint}
      />
    );

  if (view.name === "complaint-sites")
    return shell(
      <SiteVisitSiteList
        title="New complaint"
        prompt="Which site is this about?"
        addLabel="Add new site"
        onBack={() => setView(view.from ?? { name: "complaints-home", from: homeView })}
        onSelectSite={(site) => setView({ name: "site-complaint", site, from: view })}
        onAddSite={() => setView({ name: "add-site", from: view, afterCreate: { name: "site-complaint" } })}
      />
    );

  if (view.name === "site-visit-category")
    return shell(
      <SiteVisitCategoryGrid
        site={view.site}
        onBack={() => setView(view.from ?? homeView)}
        onOpenCategory={(category) =>
          category === "complaints"
            ? setView({ name: "site-complaint", site: view.site, from: view })
            : setView({ name: "site-visit-installations", site: view.site, category, from: view })
        }
      />
    );

  if (view.name === "site-visit-installations")
    return shell(
      <InstallationListView
        site={view.site}
        category={view.category}
        onBack={() => setView(view.from ?? homeView)}
        onOpenInstallation={(installation) => setView({ name: "installation", installation, from: view })}
      />
    );

  if (view.name === "installation")
    return shell(
      <InstallationScreen
        installation={view.installation}
        onBack={() => setView(view.from ?? homeView)}
        onHome={() => setView(homeView)}
      />
    );

  if (view.name === "site-complaint")
    return shell(
      <SiteComplaintForm
        site={view.site}
        onBack={() => setView(view.from ?? { name: "complaints-home", from: homeView })}
        onSubmitted={() => {
          setComplaintsRefreshKey((k) => k + 1);
          setView({ name: "complaints-home", from: homeView });
        }}
      />
    );

  if (view.name === "material-shortages") return shell(<MaterialShortagesView onBack={() => setView(homeView)} />);

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
        <StatCard value={closedToday} label="closed today" />
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
        <SitesAttentionTile
          sites={sitesAttention}
          onOpenSite={(site) => setView({ name: "site", site, from: { name: "home" } })}
          onReviewSites={() => setView({ name: "sites-review" })}
          onViewDirectory={() => setView({ name: "sites-directory" })}
          hasAnySites={allSites.length > 0}
          unconfirmedCount={unconfirmedCount}
          confirmedCount={confirmedCount}
        />
        <EscalationsTile
          escalations={escalations}
          onAdd={onAddEscalation}
          onClose={onCloseEscalation}
          busyIds={busyIds}
        />
        {(me.role === "admin" || me.role === "superadmin") && (
          <StaffTile count={staffRoster.length} onOpen={() => setView({ name: "staff-directory" })} />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <CallerTile count={callersCount} onOpen={() => setView({ name: "callers-directory" })} />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <MaterialShortagesTile onOpen={() => setView({ name: "material-shortages" })} />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <CallsNeedingActionTile
            count={callsNeedingActionCount}
            onOpen={() => setView({ name: "calls-needing-action", from: { name: "home" } })}
          />
        )}
        <ComplaintsTile
          refreshKey={complaintsRefreshKey}
          onOpen={() => setView({ name: "complaints-home", from: { name: "home" } })}
        />
        <WorkflowTilesRow
          tasks={openSiteTasks}
          onOpenCategory={(category) => setView({ name: "workflow-site-list", category, from: { name: "home" } })}
        />
        <button
          onClick={() => setView({ name: "open-todos", from: { name: "home" } })}
          style={{ all: "unset", cursor: "pointer", display: "block" }}
          aria-label={`Open today — ${openToday}`}
        >
          <StatCard value={openToday} label="open today" />
        </button>
        {parkedCount > 0 && (
          <button
            onClick={() => setView({ name: "parked-todos", from: { name: "home" } })}
            style={{ all: "unset", cursor: "pointer", display: "block" }}
            aria-label={`Parked — ${parkedCount}`}
          >
            <StatCard value={parkedCount} label="parked" />
          </button>
        )}
      </div>
    </>
  );
}


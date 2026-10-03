import { cloneElement, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { t } from "./theme.js";
import { today, isoDate, fmtDate } from "./lib/dates.js";
import { STAFF_HIDDEN_WORKFLOW_CATEGORIES } from "./lib/constants.js";
import { Card } from "./components/Card.jsx";
import { BackLink } from "./components/BackLink.jsx";
import { TileLabel } from "./components/TileLabel.jsx";
import { TILE_VALUE_ROW_STYLE, TILE_NUMBER_STYLE } from "./styles.js";
import { AppHeader } from "./components/AppHeader.jsx";
import { DeskConversationMic } from "./components/DeskConversationMic.jsx";
import { LoginScreen } from "./views/auth/LoginScreen.jsx";
import { StaffTile } from "./views/staff/StaffTile.jsx";
import { WorkflowTilesRow } from "./views/home/WorkflowTilesRow.jsx";
import { WorkflowCategorySiteList } from "./views/home/WorkflowCategorySiteList.jsx";
import { SitesAttentionTile } from "./views/home/SitesAttentionTile.jsx";
import { StaffHomePanel } from "./views/home/StaffHomePanel.jsx";
import { AssignedWorkView } from "./views/work/AssignedWorkView.jsx";
import { StaffRosterView } from "./views/work/StaffRosterView.jsx";
import { StaffRosterTile } from "./views/work/StaffRosterTile.jsx";
import { StaffAuditView } from "./views/work/StaffAuditView.jsx";
import { TaskAuditTile } from "./views/work/TaskAuditTile.jsx";
import { TaskAuditView } from "./views/work/TaskAuditView.jsx";
import { TaskTimelineCard } from "./views/work/TaskTimelineCard.jsx";
import { HomeDashboardTabs } from "./views/home/HomeDashboardTabs.jsx";
import { StreakWall } from "./views/calls/StreakWall.jsx";
import { CallsPageView } from "./views/calls/CallsPageView.jsx";
import { CallDetail } from "./views/calls/CallDetail.jsx";
import { OpenTodosView } from "./views/calls/OpenTodosView.jsx";
import { StaffDirectoryView } from "./views/staff/StaffDirectoryView.jsx";
import { CallerTile } from "./views/callers/CallerTile.jsx";
import { CallersDirectoryView } from "./views/callers/CallersDirectoryView.jsx";
import { MaintenanceSiteContactView } from "./views/maintenance/MaintenanceSiteContactView.jsx";
import { MaintenanceScopesView } from "./views/maintenance/MaintenanceScopesView.jsx";
import { ScopesProvider } from "./lib/scopes.jsx";
import { SitesDirectoryView } from "./views/sites/SitesDirectoryView.jsx";
import { AddSiteScreen } from "./views/sites/AddSiteScreen.jsx";
import { StaffLanguagePicker } from "./views/staff/StaffLanguagePicker.jsx";
import { AdminNav } from "./components/nav/AdminNav.jsx";
import { MyPageView } from "./views/mypages/MyPageView.jsx";
import { MyPageBuilderView } from "./views/mypages/MyPageBuilderView.jsx";
import { LanguageProvider } from "./lib/i18n.jsx";
import { TodoPermissionsProvider } from "./lib/todoPermissions.jsx";
import { StaffHubView } from "./views/staff/StaffHubView.jsx";
import { OffboardingListView } from "./views/staff/OffboardingListView.jsx";
import { OffboardingView } from "./views/staff/OffboardingView.jsx";
import { SitesReviewView } from "./views/sites/SitesReviewView.jsx";
import { SiteView } from "./views/sites/SiteView.jsx";
import { SiteVisitSiteList } from "./views/site-visit/SiteVisitSiteList.jsx";
import { SiteVisitCategoryGrid } from "./views/site-visit/SiteVisitCategoryGrid.jsx";
import { InstallationScreen } from "./views/site-visit/InstallationScreen.jsx";
import { SiteComplaintForm } from "./views/site-visit/SiteComplaintForm.jsx";
import { ComplaintsHomeView } from "./views/site-visit/ComplaintsHomeView.jsx";
import { ComplaintDetailView } from "./views/site-visit/ComplaintDetailView.jsx";
import { ComplaintSetupView } from "./views/site-visit/ComplaintSetupView.jsx";
import { ComplaintsTile } from "./views/site-visit/ComplaintsTile.jsx";
import { MaterialShortagesTile } from "./views/material/MaterialShortagesTile.jsx";
import { MaterialShortagesView } from "./views/material/MaterialShortagesView.jsx";
import { ProductionJobsTile } from "./views/production/ProductionJobsTile.jsx";
import { ProductionJobsListView } from "./views/production/ProductionJobsListView.jsx";
import { ProductionJobDetailView } from "./views/production/ProductionJobDetailView.jsx";
import { MyProductionStepsView } from "./views/production/MyProductionStepsView.jsx";
import { WarehouseTile } from "./views/warehouse/WarehouseTile.jsx";
import { WarehouseView } from "./views/warehouse/WarehouseView.jsx";
import { CallsNeedingActionTile } from "./views/home/CallsNeedingActionTile.jsx";
import { ResolvedCallsTile } from "./views/home/ResolvedCallsTile.jsx";
import { CallsNeedingActionView } from "./views/calls/CallsNeedingActionView.jsx";
import { ResolvedCallsView } from "./views/calls/ResolvedCallsView.jsx";
import { RequestForm } from "./views/requests/RequestForm.jsx";
import {
  fetchCall,
  fetchDashboardSummary,
  fetchMyOpenTodos,
  fetchSites,
  postCreateSite,
  postPickSite,
  patchTodo,
  fetchMe,
  setViewAsUserId,
  postLogout,
  postResetPin,
  postUpdateMyPhone,
  patchComplaint,
  fetchOpenSiteTasks,
  refreshCallsNeedingAction,
  defaultCallsNeedingActionWindow,
  loadCallsNeedingActionCalendar,
  getCachedCallsNeedingActionCalendar,
  invalidateCallsNeedingActionCalendar,
  postSiteInstallation,
  fetchMyPages,
  saveMyPages,
} from "./lib/api.js";

/** Fresh checklist title when skipping the instance list (field staff). */
function newSiteVisitLabel(category) {
  const kind =
    category === "measurement" ? "Measurement" : category === "material_delivery" ? "Delivery" : "Installation";
  const stamp = new Date().toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${kind} · ${stamp}`;
}
export default function SimpleBusinessManager() {
  const [calendarDays, setCalendarDays] = useState({});
  const [todoRefreshKey, setTodoRefreshKey] = useState(0);
  const [allSites, setAllSites] = useState([]);
  const [staffRoster, setStaffRoster] = useState([]);
  const [callsCount, setCallsCount] = useState(0);
  const [callersCount, setCallersCount] = useState(0);
  const [callsNeedingActionCount, setCallsNeedingActionCount] = useState(0);
  const [resolvedCallsCount, setResolvedCallsCount] = useState(0);
  /* Home Open tasks tile — from GET /api/dashboard/summary open_todos_count. */
  const [openTodosCount, setOpenTodosCount] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);
  /* Open (assigned, not done) site tasks — scoped server-side to "mine" for
     a staff session, or every open assignment business-wide for admin/
     superadmin. See fetchOpenSiteTasks and migration 0013. */
  const [openSiteTasks, setOpenSiteTasks] = useState([]);
  const [myOpenTodos, setMyOpenTodos] = useState([]);
  /** Home tile count — from summary (read-only); list loads on My call tasks. */
  const [myOpenTodosCount, setMyOpenTodosCount] = useState(0);
  const [urgentWorkCount, setUrgentWorkCount] = useState(0);
  /** SBM-72 — open complaints assigned to this staff member (red line on the Assigned work tile). */
  const [assignedComplaintsCount, setAssignedComplaintsCount] = useState(0);
  /** Admin home bookmark tabs — staff holding ≥1 open call todo, site stage, or complaint. */
  const [staffWithOpenTodos, setStaffWithOpenTodos] = useState([]);
  /** Selected admin-home tab: "admin" or a staff user id. */
  const [homeTab, setHomeTab] = useState("admin");
  /** Cached staff-scoped summary for the selected staff home tab. */
  const [staffPanel, setStaffPanel] = useState(null);
  const [staffPanelLoading, setStaffPanelLoading] = useState(false);
  const [complaintsRefreshKey, setComplaintsRefreshKey] = useState(0);
  const [view, setView] = useState({ name: "home" });
  const [busyIds, setBusyIds] = useState(new Set());

  /* Fetched on demand when a `staff` session opens a call from their site's
     timeline — their bulk `calls` list is never loaded (see the `me` effect
     below), so this is the only path to a call's transcript for them. */
  const [fetchedCall, setFetchedCall] = useState(null);
  /* The open call page is fetched once — keep its todos in step with edits. */
  const patchFetchedCallTodo = useCallback((todoId, patch) => {
    setFetchedCall((c) =>
      c?.todos ? { ...c, todos: c.todos.map((td) => (td.id === todoId ? { ...td, ...patch } : td)) } : c
    );
  }, []);

  /* undefined = checking, null = logged out, object = logged in. See
     src/lib/auth.ts / LoginScreen above — additive session-cookie auth,
     the whole dashboard is now gated behind it. */
  const [me, setMe] = useState(undefined);
  // SBM-106 — the admin's own "My pages" list, shown in the admin nav.
  const [myPages, setMyPages] = useState([]);
  const isAdminRole = me?.role === "admin" || me?.role === "superadmin";
  useEffect(() => {
    if (!isAdminRole) return;
    fetchMyPages()
      .then(setMyPages)
      .catch((err) => console.error("[sbm] failed to load my pages", err));
  }, [isAdminRole]);
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
    setTodoRefreshKey(0);
    setAllSites([]);
    setStaffRoster([]);
    setCallsCount(0);
    setCallersCount(0);
    setCallsNeedingActionCount(0);
    setResolvedCallsCount(0);
    setOpenTodosCount(0);
    setConfirmedCount(0);
    setUnconfirmedCount(0);
    setOpenSiteTasks([]);
    setMyOpenTodos([]);
    setMyOpenTodosCount(0);
    setUrgentWorkCount(0);
    setAssignedComplaintsCount(0);
    setStaffWithOpenTodos([]);
    setHomeTab("admin");
    setStaffPanel(null);

    const applySummary = (summary) => {
      setAllSites(summary.sites ?? []);
      setOpenSiteTasks(summary.open_site_tasks ?? []);
      setMyOpenTodos([]);
      setMyOpenTodosCount(
        summary.my_open_todos_count ?? summary.my_open_todos?.length ?? 0
      );
      setConfirmedCount(summary.confirmed_count ?? 0);
      setUnconfirmedCount(summary.unconfirmed_count ?? 0);
      setOpenTodosCount(summary.open_todos_count ?? summary.open_today ?? 0);
      setCallsCount(summary.calls_count ?? 0);
      setCallersCount(summary.callers_count ?? 0);
      setCallsNeedingActionCount(summary.calls_needing_action_count ?? 0);
      setResolvedCallsCount(summary.resolved_calls_count ?? 0);
      setStaffRoster(summary.staff_roster ?? []);
      setStaffWithOpenTodos(summary.staff_with_open_todos ?? []);
      setUrgentWorkCount(summary.urgent_work_count ?? 0);
      setAssignedComplaintsCount(summary.assigned_complaints_count ?? 0);
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
    // Must be the same window the carousel opens on, or it warms a cache
    // entry the view never reads.
    refreshCallsNeedingAction(defaultCallsNeedingActionWindow()).catch((err) =>
      console.error("[sbm] failed to prefetch calls needing action", err)
    );
    loadCallsNeedingActionCalendar()
      .then((data) => {
        if (!cancelled) setCalendarDays(data?.days ?? {});
      })
      .catch((err) => console.error("[sbm] failed to load calls needing action calendar", err));

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
    const sitesData = await fetchSites();
    setAllSites(sitesData);
    setConfirmedCount(sitesData.filter((s) => s.is_confirmed === "Y").length);
    setUnconfirmedCount(sitesData.filter((s) => s.is_confirmed === null).length);
  }, []);

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

  /* SBM-95 — "Add new site" → picked an existing site instead. Staff join its team. */
  const pickSiteAndRefresh = useCallback(
    async (site) => {
      const picked = await postPickSite(site.id);
      await refreshSites();
      return picked;
    },
    [refreshSites]
  );

  /* Tiles 1 & 2 — open/closed counts come from dashboard summary (and are
     adjusted locally on todo toggles). */

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
    return [current - 1, current, current + 1];
  }, []);

  /* Home calendar dots are the Calls Needing Action dots (SBM-102): the same
     in-memory 30-day windows the carousel uses, so a dot here always opens a
     day with cards. Older windows load when a date in them is opened in the
     carousel; coming back home picks up whatever it loaded or resolved. */
  const refreshCalendar = useCallback(async () => {
    invalidateCallsNeedingActionCalendar();
    try {
      const data = await loadCallsNeedingActionCalendar();
      setCalendarDays(data?.days ?? {});
    } catch (err) {
      console.error("[sbm] failed to load calls needing action calendar", err);
    }
  }, []);

  useEffect(() => {
    if (me?.role === "staff" || view.name !== "home") return;
    const cached = getCachedCallsNeedingActionCalendar();
    if (cached) setCalendarDays(cached.days);
  }, [me?.role, view.name]);

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
     open_todos_count in sync when completing from lists. */
  const mutate = useCallback(async (todo, patch) => {
    setBusyIds((s) => new Set(s).add(todo.id));
    setMyOpenTodos((list) => {
      if (!list.some((t) => t.id === todo.id)) return list;
      if (patch.status === "done" || patch.status === "snoozed") {
        return list.filter((t) => t.id !== todo.id);
      }
      return list.map((t) => (t.id === todo.id ? { ...t, ...patch } : t));
    });
    if (patch.status === "done" || patch.status === "snoozed") {
      setMyOpenTodosCount((n) => Math.max(0, n - 1));
      setOpenTodosCount((n) => Math.max(0, n - 1));
    }
    try {
      await patchTodo(todo.id, patch);
      patchFetchedCallTodo(todo.id, patch);
      setTodoRefreshKey((k) => k + 1);
      if (me?.role !== "staff") {
        fetchDashboardSummary()
          .then((summary) => {
            setMyOpenTodosCount(
              summary.my_open_todos_count ?? summary.my_open_todos?.length ?? 0
            );
            setOpenTodosCount(summary.open_todos_count ?? summary.open_today ?? 0);
            setStaffWithOpenTodos(summary.staff_with_open_todos ?? []);
          })
          .catch((err) => console.error("[sbm] failed to refresh staff tabs after todo mutate", err));
        if (homeTab !== "admin") {
          Promise.all([
            fetchDashboardSummary({ forUserId: homeTab }),
            fetchMyOpenTodos({ forUserId: homeTab }),
          ])
            .then(([summary, todos]) => {
              setStaffPanel({
                userId: homeTab,
                openSiteTasks: summary.open_site_tasks ?? [],
                myOpenTodos: todos,
                myOpenTodosCount:
                  summary.my_open_todos_count ?? summary.my_open_todos?.length ?? 0,
                sites: summary.sites ?? [],
                urgentWorkCount: summary.urgent_work_count ?? 0,
                assignedComplaintsCount: summary.assigned_complaints_count ?? 0,
              });
            })
            .catch((err) => console.error("[sbm] failed to refresh staff panel after todo mutate", err));
        }
      } else {
        fetchDashboardSummary()
          .then((summary) => {
            setMyOpenTodosCount(
              summary.my_open_todos_count ?? summary.my_open_todos?.length ?? 0
            );
          })
          .catch((err) => console.error("[sbm] failed to refresh my open todos count", err));
      }
    } catch {
      // Restore personal-queue row when the todo came from that list
      // (AssignedTodoRow carries client_name; CallDetail rows do not).
      if (todo.client_name != null && (patch.status === "done" || patch.status === "snoozed")) {
        setMyOpenTodos((list) => (list.some((t) => t.id === todo.id) ? list : [...list, todo]));
        setMyOpenTodosCount((n) => n + 1);
        setOpenTodosCount((n) => n + 1);
      }
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(todo.id);
        return n;
      });
    }
  }, [me?.role, homeTab]);

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

  /* Not optimistic — assignment (migration 0025: a todo can go to more than
     one staff member now) refreshes via key bump rather than a client-side
     merge, since the server response carries the full assignees[] list.
     Also refresh my_open_todos so an admin "Assign to me" shows up on the
     personal queue tile without a full page reload. */
  const onAssignTodo = useCallback(async (todoId, userIds) => {
    const updated = await patchTodo(todoId, { assigned_to_user_ids: userIds });
    patchFetchedCallTodo(todoId, {
      ...(updated?.assignees ? { assignees: updated.assignees } : {}),
      routed_at: updated?.routed_at ?? null,
    });
    setTodoRefreshKey((k) => k + 1);
    try {
      const [summary, todos] = await Promise.all([
        fetchDashboardSummary(),
        fetchMyOpenTodos(),
      ]);
      setMyOpenTodos(todos);
      setMyOpenTodosCount(
        summary.my_open_todos_count ?? summary.my_open_todos?.length ?? 0
      );
      setOpenTodosCount(summary.open_todos_count ?? summary.open_today ?? 0);
      setStaffWithOpenTodos(summary.staff_with_open_todos ?? []);
      setHomeTab((tab) => {
        if (tab === "admin") return tab;
        const still = (summary.staff_with_open_todos ?? []).some((s) => s.id === tab);
        return still ? tab : "admin";
      });
      if (homeTab !== "admin") {
        const [staffSum, staffTodos] = await Promise.all([
          fetchDashboardSummary({ forUserId: homeTab }),
          fetchMyOpenTodos({ forUserId: homeTab }),
        ]);
        setStaffPanel({
          userId: homeTab,
          openSiteTasks: staffSum.open_site_tasks ?? [],
          myOpenTodos: staffTodos,
          myOpenTodosCount:
            staffSum.my_open_todos_count ?? staffSum.my_open_todos?.length ?? 0,
          sites: staffSum.sites ?? [],
          urgentWorkCount: staffSum.urgent_work_count ?? 0,
          assignedComplaintsCount: staffSum.assigned_complaints_count ?? 0,
        });
      }
    } catch (err) {
      console.error("[sbm] failed to refresh my open todos after assign", err);
    }
    return updated;
  }, [homeTab]);

  const onTodoSiteAssigned = useCallback(async (result) => {
    const updated = result?.todo;
    if (updated?.id) {
      setMyOpenTodos((prev) =>
        prev.map((td) =>
          td.id === updated.id
            ? {
                ...td,
                ...updated,
                site_id: result.site_id ?? updated.site_id,
                site_name: result.site_name ?? updated.site_name,
                assignees: updated.assignees ?? td.assignees,
              }
            : td
        )
      );
    }
    setTodoRefreshKey((k) => k + 1);
    try {
      const [summary, todos] = await Promise.all([
        fetchDashboardSummary(),
        fetchMyOpenTodos(),
      ]);
      setMyOpenTodos(todos);
      setMyOpenTodosCount(
        summary.my_open_todos_count ?? summary.my_open_todos?.length ?? 0
      );
      setOpenTodosCount(summary.open_todos_count ?? summary.open_today ?? 0);
    } catch (err) {
      console.error("[sbm] failed to refresh after todo site assign", err);
    }
  }, []);

  /* After a change on Assigned work (done / pass on / urgent), refresh the
     tile counts for whoever's work it was — the staff member's own home, or
     the admin's staff bookmark panel. */
  const refreshWorkCounts = useCallback((forUserId) => {
    fetchDashboardSummary(forUserId ? { forUserId } : {})
      .then((summary) => {
        if (forUserId) {
          setStaffPanel((prev) =>
            prev?.userId === forUserId
              ? {
                  ...prev,
                  openSiteTasks: summary.open_site_tasks ?? [],
                  myOpenTodosCount: summary.my_open_todos_count ?? 0,
                  urgentWorkCount: summary.urgent_work_count ?? 0,
                assignedComplaintsCount: summary.assigned_complaints_count ?? 0,
                }
              : prev
          );
          return;
        }
        setOpenSiteTasks(summary.open_site_tasks ?? []);
        setMyOpenTodosCount(summary.my_open_todos_count ?? 0);
        setUrgentWorkCount(summary.urgent_work_count ?? 0);
      setAssignedComplaintsCount(summary.assigned_complaints_count ?? 0);
      })
      .catch((err) => console.error("[sbm] failed to refresh work counts", err));
  }, []);

  /* Load staff-scoped summary when admin selects a staff home bookmark. */
  useEffect(() => {
    if (!me || me.role === "staff") return;
    if (homeTab === "admin") {
      setStaffPanel(null);
      setStaffPanelLoading(false);
      return;
    }
    let cancelled = false;
    setStaffPanelLoading(true);
    fetchDashboardSummary({ forUserId: homeTab })
      .then((summary) => {
        if (cancelled) return;
        /* Preserve a list already loaded for this user — summary always sends
           my_open_todos: [] and must not wipe a concurrent my-open-todos fetch. */
        setStaffPanel((prev) => ({
          userId: homeTab,
          openSiteTasks: summary.open_site_tasks ?? [],
          myOpenTodos: prev?.userId === homeTab ? prev.myOpenTodos : [],
          myOpenTodosCount:
            summary.my_open_todos_count ?? summary.my_open_todos?.length ?? 0,
          sites: summary.sites ?? [],
          urgentWorkCount: summary.urgent_work_count ?? 0,
                assignedComplaintsCount: summary.assigned_complaints_count ?? 0,
        }));
      })
      .catch((err) => {
        console.error("[sbm] failed to load staff dashboard tab", err);
        if (!cancelled) setStaffPanel(null);
      })
      .finally(() => {
        if (!cancelled) setStaffPanelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [me, homeTab]);

  /* If the selected staff no longer has open todos, fall back to Admin. */
  useEffect(() => {
    if (homeTab === "admin") return;
    if (!staffWithOpenTodos.some((s) => s.id === homeTab)) {
      setHomeTab("admin");
    }
  }, [staffWithOpenTodos, homeTab]);

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

  const customization = me?.customization ?? { inner_scrolls: false, horizontal_scrolls: false };
  const innerScrolls = Boolean(customization.inner_scrolls);
  const horizontalScrolls = Boolean(customization.horizontal_scrolls);
  const onCustomizationChange = useCallback((next) => {
    setMe((m) => (m ? { ...m, customization: next } : m));
  }, []);

  /* SBM-72 — staff see their screens in their display language (Hindi by
     default); admin screens stay English, including when an admin opens a
     staff member's bookmark. */
  const displayLang = me?.role === "staff" ? me.display_language ?? "hi" : "en";

  /* SBM-81 — which staff member an admin is currently viewing (drill-in views
     carry forUserId; on the home view it's the selected bookmark tab). Set
     synchronously so child effects' fetches already carry X-SBM-View-As. */
  const viewAsUserId = view.forUserId || (view.name === "home" && homeTab !== "admin" ? homeTab : null);
  setViewAsUserId(me?.role === "staff" ? null : viewAsUserId);

  // SBM-106 — admin home and My pages: the dark header spans the full width,
  // and the left nav runs the full height beneath it, with the content to its right.
  const withAdminNav = (node, header = null) => {
    if (!isAdminRole) {
      return (
        <>
          {header}
          {node}
        </>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {header ? cloneElement(header, { flush: true }) : null}
        <div style={{ display: "flex", alignItems: "stretch", flex: 1, minHeight: 0 }}>
          <AdminNav
            pages={myPages}
            activeView={view}
            onHome={() => setView({ name: "home" })}
            onOpenView={(target) => setView({ ...target, from: view })}
            onNewPage={() => setView({ name: "my-page-edit", from: view })}
            onOpenPage={(page) => setView({ name: "my-page", pageId: page.id, from: { name: "home" } })}
          />
          <div style={{ flex: 1, minWidth: 0, padding: "1.5rem 1.75rem 4rem" }}>{node}</div>
        </div>
      </div>
    );
  };

  const persistMyPages = async (next) => setMyPages(await saveMyPages(next));

  /* fullBleed: no width cap or padding on <main> — the SBM-106 admin layout
     (withAdminNav) spans the whole window and pads its own content area. */
  const shell = (children, { wide = false, fillViewport = false, fullBleed = false } = {}) => (
    <LanguageProvider lang={displayLang}>
    <ScopesProvider me={me} viewAsUserId={viewAsUserId}>
    <TodoPermissionsProvider me={me}>
    <div
      className={fillViewport ? "sbm-fill-viewport" : undefined}
      data-inner-scrolls={innerScrolls ? "1" : "0"}
      data-horizontal-scrolls={horizontalScrolls ? "1" : "0"}
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
        body{margin:0}
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
          maxWidth: fullBleed ? "none" : wide ? 1100 : 720,
          margin: "0 auto",
          padding: fullBleed ? 0 : fillViewport ? "1rem 1.25rem 1rem" : "2rem 1.25rem 4rem",
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
    </TodoPermissionsProvider>
    </ScopesProvider>
    </LanguageProvider>
  );

  if (me === undefined) return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  if (me === null) {
    return <LoginScreen error={loginError} initialName={loginInitialName} />;
  }

  const goHomeTab = (id) => {
    setHomeTab(id);
    setView({ name: "home" });
  };

  /* Same header + calendar as the admin home screen. Staff bookmark tile
     pages reuse this so only the body under the tabs changes. */
  const adminHomeHeader = (
    <AppHeader
      me={me}
      onLogout={onLogout}
      onResetPin={onResetPin}
      onUpdatePhone={onUpdatePhone}
      customization={customization}
      onCustomizationChange={onCustomizationChange}
      onRequestReport={() => setView({ name: "app-request", from: { name: "home" } })}
      onOpenMaintenanceSiteContact={() =>
        setView({ name: "maintenance-site-contact", from: { name: "home" } })
      }
      onOpenMaintenanceScopes={() => setView({ name: "maintenance-scopes", from: { name: "home" } })}
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DeskConversationMic />
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{fmtDate(new Date().toISOString())}</span>
        </div>
      }
    >
      <StreakWall
        days={monthDays}
        onSelectDay={(date) =>
          setView({ name: "calls-needing-action", focusDate: date, from: { name: "home" } })
        }
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
  );

  /** Admin viewing a staff bookmark: keep header + tabs; swap body only. */
  const shellInStaffBookmark = (content, opts) => {
    const scopeId = view.forUserId || null;
    if (!scopeId || me.role === "staff") return shell(content, opts);
    return shell(
      <>
        {adminHomeHeader}
        <HomeDashboardTabs homeTab={scopeId} staffTabs={staffWithOpenTodos} onSelect={goHomeTab} />
        {content}
      </>,
      opts
    );
  };

  if (view.name === "call" && fetchedCall === undefined) {
    return shell(<p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>);
  }

  if (openCall)
    return shell(
      <CallDetail
        call={openCall}
        aside={
          view.task ? (
            <TaskTimelineCard
              kind={view.task.kind}
              id={view.task.id}
              onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: view })}
            />
          ) : null
        }
        onBack={() => setView(view.from ?? homeView)}
        onToggle={onToggle}
        busyIds={busyIds}
        canManage={me.role !== "staff"}
        staffRoster={staffRoster}
        currentUser={me}
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

  if (view.name === "site")
    return shell(
      <SiteView
        site={view.site}
        siteRecord={allSites.find((s) => s.name === view.site)}
        onBack={() => setView(view.from ?? homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "site", site: view.site, from: view.from } })}
        onSiteUpdated={refreshSites}
        onSiteIdentityChanged={(nextName) =>
          setView((current) =>
            current.name === "site" ? { ...current, site: nextName, autoEdit: false } : current
          )
        }
        autoEditDetails={Boolean(view.autoEdit)}
        canManage={me.role !== "staff"}
        myOpenTasks={openSiteTasks.filter((tk) => tk.site_name === view.site)}
        onTasksChanged={refreshOpenSiteTasks}
        staffRoster={staffRoster}
        currentUser={me}
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
        busyIds={busyIds}
        onCallsChanged={refreshCalendar}
        onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: { name: "calls" } })}
        innerScrolls={innerScrolls}
        horizontalScrolls={horizontalScrolls}
        canManage={me.role !== "staff"}
        staffRoster={staffRoster}
        currentUser={me}
        onAssign={me.role !== "staff" ? onAssignTodo : undefined}
        onTodoSiteAssigned={me.role !== "staff" ? onTodoSiteAssigned : undefined}
      />,
      { wide: true, fillViewport: innerScrolls }
    );

  if (view.name === "open-todos")
    return shell(
      <OpenTodosView
        staffRoster={staffRoster}
        currentUser={me}
        onBack={() => setView(view.from ?? homeView)}
        onOpen={(id) => setView({ name: "call", id, from: { name: "open-todos" } })}
        onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: { name: "open-todos" } })}
        onAssign={onAssignTodo}
        onToggle={onToggle}
        onTodoSiteAssigned={onTodoSiteAssigned}
        busyIds={busyIds}
        refreshKey={todoRefreshKey}
      />
    );

  if (view.name === "sites-review")
    return shell(
      <SitesReviewView
        sites={allSites}
        onBack={() => setView(homeView)}
        onSaved={refreshSites}
        canManage={me.role !== "staff"}
      />,
      {
        // Same 1100px container as the sites directory — this screen is now a
        // five-column grid too, and it carries more rows than the directory.
        wide: true,
      }
    );

  if (view.name === "sites-directory")
    return shellInStaffBookmark(
      <>
        {me.role === "staff" && (
          <AppHeader
            me={me}
            onLogout={onLogout}
            onResetPin={onResetPin}
            onUpdatePhone={onUpdatePhone}
            customization={customization}
            onCustomizationChange={onCustomizationChange}
            onRequestReport={() => setView({ name: "app-request", from: view })}
          />
        )}
        <SitesDirectoryView
          onBack={() => setView(view.from ?? homeView)}
          onOpenSite={(site) => setView({ name: "site", site, from: view })}
          onAddSite={() =>
            setView({
              name: "add-site",
              from: view,
              afterCreate: { name: "site" },
              forUserId: view.forUserId,
            })
          }
          isHome={me.role === "staff" && (!view.from || view.from.name === "staff-home")}
          innerScrolls={innerScrolls}
          horizontalScrolls={horizontalScrolls}
          staffRoster={staffRoster}
          currentUser={me}
          onAssignTodo={me.role !== "staff" ? onAssignTodo : undefined}
          onToggleTodo={me.role !== "staff" ? onToggle : undefined}
          forUserId={view.forUserId || null}
        />
      </>,
      // Six columns need the 1100px container, not the default 720 — same
      // reasoning as the calls page and the callers directory.
      { wide: true, fillViewport: innerScrolls }
    );

  if (view.name === "add-site")
    return shellInStaffBookmark(
      <AddSiteScreen
        canPickContacts={me.role !== "staff"}
        defaultAssignedBy={
          me?.contact ? { caller_id: me.contact.id, name: me.contact.name, phone: me.contact.phone || null } : null
        }
        onBack={() => setView(view.from ?? homeView)}
        onCreate={createSiteAndRefresh}
        onPickExisting={pickSiteAndRefresh}
        onDone={(site) => {
          const scopeId = view.forUserId || null;
          const next = view.afterCreate?.name;
          if (next === "site-visit-category") {
            setView({
              name: "site-visit-category",
              site,
              from: view.from ?? homeView,
              forUserId: scopeId,
            });
          } else if (next === "site-complaint") {
            setView({
              name: "site-complaint",
              site,
              from: view.from ?? homeView,
              forUserId: scopeId,
            });
          } else {
            setView({ name: "site", site: site.name, from: view.from ?? homeView });
          }
        }}
      />
    );

  /* SBM-64: the Staff tile opens a hub — Staff list, and Offboard a staff member. */
  if (view.name === "staff-hub")
    return shell(
      <StaffHubView
        staffCount={staffRoster.length}
        onBack={() => setView(homeView)}
        onOpenList={() => setView({ name: "staff-directory", from: view })}
        onOpenOffboarding={() => setView({ name: "offboarding-list", from: view })}
      />
    );

  if (view.name === "offboarding-list")
    return shell(
      <OffboardingListView
        onBack={() => setView(view.from ?? { name: "staff-hub" })}
        onOpen={(staffId) => setView({ name: "offboarding", staffId, from: view })}
      />
    );

  if (view.name === "offboarding")
    return shell(
      <OffboardingView
        key={view.staffId}
        staffId={view.staffId}
        onBack={() => setView(view.from ?? { name: "offboarding-list" })}
        onOpenCall={(id) => setView({ name: "call", id, from: view })}
        onFinished={() => setView(view.from ?? { name: "offboarding-list" })}
      />
    );

  if (view.name === "staff-directory")
    return shell(<StaffDirectoryView onBack={() => setView(view.from ?? { name: "staff-hub" })} />);

  if (view.name === "maintenance-site-contact")
    return shell(
      <MaintenanceSiteContactView onBack={() => setView(view.from ?? homeView)} innerScrolls={innerScrolls} />,
      { wide: true, fillViewport: innerScrolls }
    );

  if (view.name === "maintenance-scopes")
    return shell(<MaintenanceScopesView onBack={() => setView(view.from ?? homeView)} />);

  if (view.name === "callers-directory")
    return shell(
      <CallersDirectoryView
        onBack={() => setView(homeView)}
        innerScrolls={innerScrolls}
        horizontalScrolls={horizontalScrolls}
      />,
      {
        wide: true,
        fillViewport: innerScrolls,
      }
    );

  if (view.name === "calls-needing-action")
    return shell(
      <CallsNeedingActionView
        staffRoster={staffRoster}
        currentUser={me}
        initialFocusDate={view.focusDate ?? null}
        onAssignTodo={onAssignTodo}
        onToggleTodo={onToggle}
        busyIds={busyIds}
        onResolved={() => {
          setCallsNeedingActionCount((n) => Math.max(0, n - 1));
          setResolvedCallsCount((n) => n + 1);
        }}
        onBack={() => setView(view.from ?? homeView)}
      />,
      { wide: true }
    );

  if (view.name === "resolved-calls")
    return shell(
      <ResolvedCallsView
        onBack={() => setView(view.from ?? homeView)}
        onOpenCall={(id) => setView({ name: "call", id, from: { name: "resolved-calls" } })}
        innerScrolls={innerScrolls}
      />,
      { wide: true, fillViewport: innerScrolls }
    );

  if (view.name === "staff-home")
    return shell(
      <>
        <AppHeader
          me={me}
          onLogout={onLogout}
          onResetPin={onResetPin}
          onUpdatePhone={onUpdatePhone}
          customization={customization}
          onCustomizationChange={onCustomizationChange}
          onRequestReport={() => setView({ name: "app-request", from: { name: "staff-home" } })}
        />

        <StaffHomePanel
          openSiteTasks={openSiteTasks}
          myOpenTodosCount={myOpenTodosCount}
          urgentWorkCount={urgentWorkCount}
          assignedComplaintsCount={assignedComplaintsCount}
          sites={allSites}
          complaintsRefreshKey={complaintsRefreshKey}
          onOpenAssignedWork={() => setView({ name: "assigned-work", from: { name: "staff-home" } })}
          onOpenSiteVisit={() => setView({ name: "site-visit-sites", from: { name: "staff-home" } })}
          onOpenComplaints={() => setView({ name: "complaints-home", from: { name: "staff-home" } })}
          onOpenProduction={() => setView({ name: "my-production-steps", from: { name: "staff-home" } })}
          onOpenWarehouse={() => setView({ name: "warehouse", from: { name: "staff-home" } })}
        />
      </>
    );

  if (view.name === "assigned-work") {
    const scopeId = view.forUserId || null;
    return shellInStaffBookmark(
      <AssignedWorkView
        forUserId={scopeId}
        selfId={me.id}
        canAdmin={me.role !== "staff"}
        siteKey={view.siteKey ?? null}
        location={view.location ?? null}
        onSelectSite={(siteKey) => setView({ ...view, siteKey, location: null })}
        onSelectLocation={(location) => setView({ ...view, location })}
        onAddSite={() =>
          setView({ name: "add-site", from: view, afterCreate: { name: "site" }, forUserId: scopeId })
        }
        onBack={() => setView(view.from ?? homeView)}
        onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: view })}
        onOpenCall={(id) => setView({ name: "call", id, from: view })}
        onOpenComplaint={(id) => setView({ name: "complaint", id, from: view, forUserId: scopeId })}
        onChanged={() => refreshWorkCounts(scopeId)}
      />
    );
  }

  if (view.name === "staff-roster")
    return shell(
      <StaffRosterView
        onBack={() => setView(view.from ?? homeView)}
        onOpenStaff={(staff) => setView({ name: "staff-audit", staff, from: view })}
        onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: view })}
        onOpenCall={(id) => setView({ name: "call", id, from: view })}
        onOpenComplaint={(id) => setView({ name: "complaint", id, from: view })}
      />
    );

  if (view.name === "task-audit")
    return shell(
      <TaskAuditView
        initialTab={view.tab ?? "date"}
        initialQ={view.q ?? ""}
        onStateChange={({ tab, q }) =>
          setView((v) => (v.name === "task-audit" && (v.tab !== tab || v.q !== q) ? { ...v, tab, q } : v))
        }
        onBack={() => setView(view.from ?? homeView)}
        onOpenCall={(id) => setView({ name: "call", id, from: view })}
        onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: view })}
      />
    );

  if (view.name === "task-timeline")
    return shell(
      <div>
        <BackLink onClick={() => setView(view.from ?? homeView)}>Back</BackLink>
        <TaskTimelineCard
          kind={view.kind}
          id={view.id}
          onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: view })}
        />
      </div>
    );

  if (view.name === "staff-audit")
    return shell(
      <StaffAuditView
        staff={view.staff}
        onBack={() => setView(view.from ?? homeView)}
        onOpenAssignedWork={() =>
          setView({ name: "assigned-work", forUserId: view.staff.id, from: view })
        }
      />
    );

  // --- Staff field workflow (migration 0016): site visit -> category ->
  // installation checklist, and the site-level complaint form. ---

  if (view.name === "site-visit-sites")
    return shellInStaffBookmark(
      <SiteVisitSiteList
        forUserId={view.forUserId || null}
        onBack={() => setView(view.from ?? homeView)}
        onSelectSite={(site) =>
          setView({ name: "site-visit-category", site, from: view, forUserId: view.forUserId })
        }
        onAddSite={() =>
          setView({
            name: "add-site",
            from: view,
            afterCreate: { name: "site-visit-category" },
            forUserId: view.forUserId,
          })
        }
      />
    );

  if (view.name === "complaints-home")
    return shellInStaffBookmark(
      <ComplaintsHomeView
        refreshKey={complaintsRefreshKey}
        forUserId={view.forUserId || null}
        onBack={() => setView(view.from ?? homeView)}
        onAddComplaint={() =>
          setView({ name: "complaint-sites", from: view, forUserId: view.forUserId })
        }
        canAdd
        canAssign={me.role !== "staff" && !view.forUserId}
        selfId={me.role === "staff" ? me.id : view.forUserId || null}
        onOpenComplaint={(id) => setView({ name: "complaint", id, from: view, forUserId: view.forUserId })}
      />
    );

  /* SBM-71: one complaint — voice note, media, plan / pass on; admin assigns, flags, resolves. */
  if (view.name === "complaint")
    return shellInStaffBookmark(
      <ComplaintDetailView
        key={view.id}
        id={view.id}
        me={me}
        staffRoster={staffRoster}
        onAssignComplaint={onAssignComplaint}
        onBack={() => setView(view.from ?? { name: "complaints-home" })}
        onOpenSite={(siteName) => setView({ name: "site", site: siteName, from: view })}
        onChanged={() => {
          setComplaintsRefreshKey((k) => k + 1);
          refreshWorkCounts(view.forUserId || null);
        }}
      />
    );

  if (view.name === "complaint-sites")
    return shellInStaffBookmark(
      <SiteVisitSiteList
        titleKey="newComplaint"
        promptKey="whichSite"
        addLabelKey="addNewSite"
        forUserId={view.forUserId || null}
        onBack={() =>
          setView(
            view.from ?? {
              name: "complaints-home",
              from: homeView,
              forUserId: view.forUserId,
            }
          )
        }
        onSelectSite={(site) =>
          setView({ name: "site-complaint", site, from: view, forUserId: view.forUserId })
        }
        onAddSite={() =>
          setView({
            name: "add-site",
            from: view,
            afterCreate: { name: "site-complaint" },
            forUserId: view.forUserId,
          })
        }
      />
    );

  if (view.name === "site-visit-category")
    return shellInStaffBookmark(
      <SiteVisitCategoryGrid
        site={view.site}
        onBack={() => setView(view.from ?? homeView)}
        onOpenCategory={async (category) => {
          const scopeId = view.forUserId || null;
          if (category === "complaints") {
            setView({ name: "site-complaint", site: view.site, from: view, forUserId: scopeId });
            return;
          }
          // Skip the instance list — create a row and open the checklist.
          const created = await postSiteInstallation(view.site.id, newSiteVisitLabel(category), category);
          setView({
            name: "installation",
            installation: created,
            forUserId: scopeId,
            from: {
              name: "site-visit-category",
              site: view.site,
              from: view.from,
              forUserId: scopeId,
            },
          });
        }}
      />
    );

  if (view.name === "installation")
    return shellInStaffBookmark(
      <InstallationScreen
        installation={view.installation}
        onBack={() => setView(view.from ?? homeView)}
        onHome={() => setView(homeView)}
      />
    );

  if (view.name === "site-complaint")
    return shellInStaffBookmark(
      <SiteComplaintForm
        site={view.site}
        onBack={() =>
          setView(
            view.from ?? {
              name: "complaints-home",
              from: homeView,
              forUserId: view.forUserId,
            }
          )
        }
        onSubmitted={(created) => {
          setComplaintsRefreshKey((k) => k + 1);
          const list = { name: "complaints-home", from: homeView, forUserId: view.forUserId };
          /* SBM-71: an admin gets the set-up step (urgent / site / deadline / route). */
          if (me.role !== "staff" && created?.id) {
            setView({ name: "complaint-setup", complaint: created, site: view.site, from: list });
            return;
          }
          setView(list);
        }}
      />
    );

  if (view.name === "complaint-setup")
    return shell(
      <ComplaintSetupView
        complaint={view.complaint}
        site={view.site}
        me={me}
        staffRoster={staffRoster}
        onDone={(id) => {
          setComplaintsRefreshKey((k) => k + 1);
          setView({ name: "complaint", id, from: view.from ?? { name: "complaints-home", from: homeView } });
        }}
      />
    );

  if (view.name === "material-shortages") return shell(<MaterialShortagesView onBack={() => setView(homeView)} />);

  // --- Production job tracker + warehouse register — migration 0042. See
  // the approved "Production & Warehouse Workflow" diagram. Shared between
  // admin (full job list, "+ New job") and staff (their own assigned
  // steps) — shellInStaffBookmark falls back to plain shell outside a
  // staff-bookmark admin view. ---

  if (view.name === "production-jobs")
    return shell(
      <ProductionJobsListView
        onBack={() => setView(view.from ?? homeView)}
        onOpenJob={(job) => setView({ name: "production-job-detail", jobId: job.id, from: view })}
      />
    );

  if (view.name === "production-job-detail")
    return shellInStaffBookmark(
      <ProductionJobDetailView jobId={view.jobId} onBack={() => setView(view.from ?? homeView)} />
    );

  if (view.name === "my-production-steps")
    return shellInStaffBookmark(
      <MyProductionStepsView
        forUserId={view.forUserId || null}
        onBack={() => setView(view.from ?? homeView)}
        onOpenJob={(job) => setView({ name: "production-job-detail", jobId: job.id, from: view, forUserId: view.forUserId })}
      />
    );

  if (view.name === "warehouse")
    return shellInStaffBookmark(<WarehouseView onBack={() => setView(view.from ?? homeView)} />);

  if (view.name === "app-request") return shell(<RequestForm onBack={() => setView(view.from ?? homeView)} />);

  if (view.name === "my-page") {
    const page = myPages.find((p) => p.id === view.pageId);
    return shell(
      withAdminNav(
        page ? (
          <MyPageView
            page={page}
            onBack={() => setView(view.from ?? homeView)}
            onEdit={() => setView({ name: "my-page-edit", pageId: page.id, from: view })}
            onOpenView={(target) => setView({ ...target, from: view })}
          />
        ) : (
          <BackLink onClick={() => setView(homeView)}>Back</BackLink>
        ),
        adminHomeHeader
      ),
      { fullBleed: isAdminRole }
    );
  }

  if (view.name === "my-page-edit") {
    const page = myPages.find((p) => p.id === view.pageId);
    return shell(
      withAdminNav(
        <MyPageBuilderView
          page={page}
          onBack={() => setView(view.from ?? homeView)}
          onSave={async (saved) => {
            const next = page ? myPages.map((p) => (p.id === saved.id ? saved : p)) : [...myPages, saved];
            await persistMyPages(next);
            setView({ name: "my-page", pageId: saved.id, from: homeView });
          }}
          onDelete={async () => {
            if (!window.confirm(`Delete “${page.name}”? Its views stay in their sections.`)) return;
            await persistMyPages(myPages.filter((p) => p.id !== page.id));
            setView(homeView);
          }}
        />,
        adminHomeHeader
      ),
      { fullBleed: isAdminRole }
    );
  }

  return shell(
    withAdminNav(
    <>
      <HomeDashboardTabs homeTab={homeTab} staffTabs={staffWithOpenTodos} onSelect={goHomeTab} />

      {homeTab !== "admin" ? (
        staffPanelLoading ? (
          <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
        ) : staffPanel?.userId === homeTab ? (
          <>
          <StaffLanguagePicker staffId={homeTab} staffName={staffWithOpenTodos.find((s) => s.id === homeTab)?.name} />
          <StaffHomePanel
            openSiteTasks={staffPanel.openSiteTasks}
            myOpenTodosCount={staffPanel.myOpenTodosCount}
            urgentWorkCount={staffPanel.urgentWorkCount}
            assignedComplaintsCount={staffPanel.assignedComplaintsCount ?? 0}
            sites={staffPanel.sites}
            complaintsRefreshKey={complaintsRefreshKey}
            forUserId={homeTab}
            onOpenAssignedWork={() =>
              setView({ name: "assigned-work", forUserId: homeTab, from: { name: "home" } })
            }
            onOpenSiteVisit={() =>
              setView({ name: "site-visit-sites", forUserId: homeTab, from: { name: "home" } })
            }
            onOpenComplaints={() =>
              setView({ name: "complaints-home", forUserId: homeTab, from: { name: "home" } })
            }
            onOpenProduction={() =>
              setView({ name: "my-production-steps", forUserId: homeTab, from: { name: "home" } })
            }
            onOpenWarehouse={() =>
              setView({ name: "warehouse", forUserId: homeTab, from: { name: "home" } })
            }
          />
          </>
        ) : (
          <p style={{ fontSize: 14, color: t.edge2 }}>Couldn’t load this staff dashboard.</p>
        )
      ) : (
      /* Home tile panel. 2 columns on a phone; auto-widens toward one
          row as space allows. Every tile is fixed to --tile-height (see the
          Card `tile` variant) so the grid stays symmetrical regardless of
          content — list tiles (SitesAttentionTile) scroll internally instead
          of growing taller than their neighbours. */
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        {(me.role === "admin" || me.role === "superadmin") && (
          <StaffRosterTile staffCount={staffRoster.length} onOpen={() => setView({ name: "staff-roster", from: { name: "home" } })} />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <CallsNeedingActionTile
            count={callsNeedingActionCount}
            onOpen={() => setView({ name: "calls-needing-action", from: { name: "home" } })}
          />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <button
            onClick={() => setView({ name: "open-todos", from: { name: "home" } })}
            style={{ all: "unset", cursor: "pointer", display: "block" }}
            aria-label={`Open tasks — ${openTodosCount}`}
          >
            <Card tile>
              <TileLabel>Open tasks</TileLabel>
              <div style={TILE_VALUE_ROW_STYLE}>
                <span style={TILE_NUMBER_STYLE}>{openTodosCount}</span>
              </div>
            </Card>
          </button>
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <TaskAuditTile
            refreshKey={todoRefreshKey}
            onOpen={() => setView({ name: "task-audit", from: { name: "home" } })}
          />
        )}
        {/* SBM-71: Complaints sit right after Task audit; they replaced the old Escalations tile. */}
        <ComplaintsTile
          refreshKey={complaintsRefreshKey}
          onOpen={() => setView({ name: "complaints-home", from: { name: "home" } })}
        />
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
          onReviewSites={() => setView({ name: "sites-review" })}
          onViewDirectory={() => setView({ name: "sites-directory" })}
          unconfirmedCount={unconfirmedCount}
          confirmedCount={confirmedCount}
        />
        {(me.role === "admin" || me.role === "superadmin") && (
          <StaffTile count={staffRoster.length} onOpen={() => setView({ name: "staff-hub" })} />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <CallerTile count={callersCount} onOpen={() => setView({ name: "callers-directory" })} />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <MaterialShortagesTile onOpen={() => setView({ name: "material-shortages" })} />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <ProductionJobsTile onOpen={() => setView({ name: "production-jobs", from: { name: "home" } })} />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <WarehouseTile onOpen={() => setView({ name: "warehouse", from: { name: "home" } })} />
        )}
        {(me.role === "admin" || me.role === "superadmin") && (
          <ResolvedCallsTile
            count={resolvedCallsCount}
            onOpen={() => setView({ name: "resolved-calls", from: { name: "home" } })}
          />
        )}
        <WorkflowTilesRow
          tasks={openSiteTasks}
          onOpenCategory={(category) => setView({ name: "workflow-site-list", category, from: { name: "home" } })}
        />
      </div>
      )}
    </>,
    adminHomeHeader
    ),
    { fullBleed: isAdminRole }
  );
}


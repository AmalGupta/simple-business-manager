import { useState, useEffect, useCallback, useRef } from "react";
import { t } from "../../theme.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { DownloadButton } from "../../components/DownloadButton.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import {
  fetchAllCallsPages,
  fetchCallCallers,
  fetchCallsForDashboard,
  fetchDrivePollSettings,
  patchDrivePollSettings,
  postDrivePoll,
} from "../../lib/api.js";
import { withCallMetadata } from "../../lib/callMetadata.js";
import { CallsFilterBar } from "./CallsFilterBar.jsx";
import { CallsGrid } from "./CallsGrid.jsx";
import { CallDetailModal } from "./CallDetailModal.jsx";
import { DrivePollStatus } from "./DrivePollStatus.jsx";

const EMPTY_FILTERS = {
  dateFrom: "",
  dateTo: "",
  callers: [],
  importantOnly: false,
  withTodosOnly: false,
  entryTypes: [],
};

const PAGE_SIZE = 50;

function filtersToApi(filters) {
  return {
    include_low_signal: true,
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
    callers: filters.callers?.length ? filters.callers : undefined,
    important_only: filters.importantOnly || undefined,
    with_todos_only: filters.withTodosOnly || undefined,
    entry_types: filters.entryTypes?.length ? filters.entryTypes : undefined,
    limit: PAGE_SIZE,
  };
}

/**
 * Calls dashboard — fills the viewport (no page scroll). Table body scrolls.
 * Call detail opens in a modal so grid state is preserved on close.
 */
export function CallsPageView({ onBack, onToggle, onPark, busyIds, onCallsChanged }) {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [callerOptions, setCallerOptions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);

  const pageCache = useRef([]);

  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollMeta, setPollMeta] = useState({ lastAt: null, lastResult: null });
  const [pollProgress, setPollProgress] = useState(null);
  const [pollBusy, setPollBusy] = useState(false);
  const [pollStatus, setPollStatus] = useState("");

  const fetchPage = useCallback(async (index, apiFilters) => {
    const cached = pageCache.current[index];
    if (cached) {
      setRows(cached.items);
      setTotal(cached.total);
      setPageIndex(index);
      return cached.items;
    }

    const cursor = index === 0 ? null : pageCache.current[index - 1]?.next_cursor ?? null;
    if (index > 0 && !cursor) return [];

    const data = await fetchCallsForDashboard({ ...apiFilters, cursor: cursor ?? undefined });
    const decorated = (data.items ?? []).map(withCallMetadata);
    pageCache.current[index] = {
      items: decorated,
      total: data.total ?? 0,
      next_cursor: data.next_cursor,
    };
    setRows(decorated);
    setTotal(data.total ?? 0);
    setPageIndex(index);
    return decorated;
  }, []);

  const resetAndLoad = useCallback(
    async (nextFilters) => {
      setLoadError("");
      setRows(null);
      pageCache.current = [];
      const apiFilters = filtersToApi(nextFilters);
      try {
        await fetchPage(0, apiFilters);
      } catch (err) {
        setRows([]);
        setTotal(0);
        setLoadError(err.message || "Failed to load calls");
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    if (rows == null) return;
    window.scrollTo(0, 0);
  }, [rows]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const mq = window.matchMedia("(max-width: 640px)");
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      htmlHeight: html.style.height,
      bodyHeight: body.style.height,
    };

    const findAllowedScroller = (node) => {
      let el = node;
      while (el && el !== html) {
        if (!(el instanceof HTMLElement)) {
          el = el.parentElement;
          continue;
        }
        if (el.classList.contains("ag-grid-viewport") || el.classList.contains("ag-body-viewport")) {
          return el;
        }
        const oy = window.getComputedStyle(el).overflowY;
        if (
          (oy === "auto" || oy === "scroll") &&
          el.scrollHeight > el.clientHeight + 1 &&
          el !== body &&
          el.tagName !== "MAIN" &&
          el.tagName !== "HTML"
        ) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    };

    let lastY = 0;
    let scrollY = 0;
    let locked = false;
    const onTouchStart = (e) => {
      if (e.touches[0]) lastY = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
      const scroller = findAllowedScroller(e.target);
      if (!scroller) {
        e.preventDefault();
        return;
      }
      const y = e.touches[0]?.clientY;
      if (y == null) return;
      const dy = y - lastY;
      lastY = y;
      const atTop = scroller.scrollTop <= 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if ((atTop && dy > 0) || (atBottom && dy < 0)) {
        e.preventDefault();
      }
    };

    const restore = () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      html.style.height = prev.htmlHeight;
      body.style.height = prev.bodyHeight;
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };

    const apply = () => {
      const wasLocked = locked;
      restore();
      if (wasLocked) window.scrollTo(0, scrollY);
      locked = false;
      if (!mq.matches) return;
      locked = true;
      scrollY = window.scrollY || 0;
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      html.style.overscrollBehavior = "none";
      body.style.overscrollBehavior = "none";
      html.style.height = "100%";
      body.style.height = "100%";
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
      document.addEventListener("touchstart", onTouchStart, { passive: true });
      document.addEventListener("touchmove", onTouchMove, { passive: false });
    };

    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      restore();
      if (locked) window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    fetchCallCallers(true)
      .then((names) => setCallerOptions(Array.isArray(names) ? names : []))
      .catch(() => {});
    fetchDrivePollSettings()
      .then((s) => {
        setPollEnabled(Boolean(s.enabled));
        setPollMeta({ lastAt: s.lastAt ?? null, lastResult: s.lastResult ?? null });
        setPollProgress(s.progress ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    resetAndLoad(filters);
  }, [filters, resetAndLoad]);

  const applyPollSettings = useCallback((s) => {
    setPollEnabled(Boolean(s.enabled));
    setPollMeta({ lastAt: s.lastAt ?? null, lastResult: s.lastResult ?? null });
    setPollProgress(s.progress ?? null);
  }, []);

  useEffect(() => {
    const running = pollProgress?.status === "running" || pollBusy;
    if (!pollEnabled && !running) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await fetchDrivePollSettings();
        if (cancelled) return;
        applyPollSettings(s);
      } catch {
        /* keep last known progress */
      }
    };
    const id = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollEnabled, pollBusy, pollProgress?.status, applyPollSettings]);

  const prevPollStatus = useRef(pollProgress?.status);
  useEffect(() => {
    const status = pollProgress?.status;
    if (prevPollStatus.current === "running" && status === "done") {
      resetAndLoad(filters);
      if (typeof onCallsChanged === "function") onCallsChanged();
    }
    prevPollStatus.current = status;
  }, [pollProgress?.status, filters, resetAndLoad, onCallsChanged]);

  const onServerNext = useCallback(async () => {
    const cur = pageCache.current[pageIndex];
    if (!cur?.next_cursor) return;
    setLoadError("");
    try {
      await fetchPage(pageIndex + 1, filtersToApi(filters));
    } catch (err) {
      setLoadError(err.message || "Failed to load calls");
    }
  }, [fetchPage, pageIndex, filters]);

  const onServerPrev = useCallback(() => {
    if (pageIndex <= 0) return;
    const cached = pageCache.current[pageIndex - 1];
    if (cached) {
      setRows(cached.items);
      setTotal(cached.total);
      setPageIndex(pageIndex - 1);
    }
  }, [pageIndex]);

  const onPrepareExport = useCallback(async () => {
    setExportBusy(true);
    try {
      const raw = await fetchAllCallsPages(filtersToApi(filters));
      return raw.map(withCallMetadata);
    } finally {
      setExportBusy(false);
    }
  }, [filters]);

  const onTogglePolling = async () => {
    const next = !pollEnabled;
    setPollBusy(true);
    setPollStatus("");
    try {
      const s = await patchDrivePollSettings(next);
      applyPollSettings(s);
      setPollStatus("");
    } catch (err) {
      setPollStatus(`Could not update polling: ${err.message}`);
    } finally {
      setPollBusy(false);
    }
  };

  const onGetLatest = async () => {
    setPollBusy(true);
    setPollStatus("");
    try {
      await postDrivePoll();
      const s = await fetchDrivePollSettings();
      applyPollSettings(s);
      await resetAndLoad(filters);
      if (typeof onCallsChanged === "function") await onCallsChanged();
    } catch (err) {
      setPollStatus(`Get latest failed: ${err.message}`);
    } finally {
      setPollBusy(false);
    }
  };

  const serverOffset = pageIndex * PAGE_SIZE;
  const hasServerNext = Boolean(pageCache.current[pageIndex]?.next_cursor);
  const showEmpty = rows !== null && total === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        gap: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ flexShrink: 0, position: "sticky", top: 0, zIndex: 2, background: t.pane }}>
        <BackLink onClick={onBack}>Back</BackLink>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0.15rem 0 0" }}>
            Calls
          </h1>
          {total > 0 && (
            <DownloadButton calls={rows ?? []} label="filtered" onBeforeOpen={onPrepareExport} disabled={exportBusy}>
              {exportBusy ? "Preparing…" : "Download"}
            </DownloadButton>
          )}
        </div>
      </div>

      <Card style={{ marginBottom: 0, padding: "10px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <TileLabel>Drive sync</TileLabel>
          <button
            type="button"
            onClick={onGetLatest}
            disabled={pollBusy}
            style={{
              fontFamily: t.body,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: t.accent,
              border: "none",
              borderRadius: t.radiusButton,
              padding: "8px 12px",
              minHeight: 36,
              cursor: pollBusy ? "wait" : "pointer",
              opacity: pollBusy ? 0.7 : 1,
            }}
          >
            Get latest calls
          </button>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: t.edge,
              cursor: pollBusy ? "wait" : "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={pollEnabled}
              disabled={pollBusy}
              onChange={onTogglePolling}
              style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }}
            />
            Permanent polling
          </label>
          {pollStatus ? (
            <span style={{ fontSize: 12, color: t.signal, flex: "1 1 120px" }}>{pollStatus}</span>
          ) : null}
          <DrivePollStatus progress={pollProgress} lastResult={pollMeta.lastResult} />
        </div>
      </Card>

      {loadError && (
        <p style={{ fontSize: 14, color: t.signal, margin: 0, flexShrink: 0 }}>{loadError}</p>
      )}

      {rows === null ? (
        <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Loading calls…</p>
      ) : showEmpty ? (
        <EmptyState />
      ) : (
        <>
          <div style={{ flexShrink: 0, position: "sticky", top: 0, zIndex: 1, background: t.pane }}>
            <CallsFilterBar
              filters={filters}
              callerOptions={callerOptions}
              onChange={setFilters}
              resultCount={total}
            />
          </div>
          <h2
            style={{
              fontFamily: t.display,
              fontSize: 16,
              fontWeight: 600,
              color: t.edge,
              margin: "2px 0 0",
              flexShrink: 0,
            }}
          >
            Call / Voice Note Logs
          </h2>
          <CallsGrid
            rows={rows}
            selectedId={selectedId}
            onSelect={setSelectedId}
            serverPagination={{
              total,
              offset: serverOffset,
              hasPrev: pageIndex > 0,
              hasNext: hasServerNext,
              onPrev: onServerPrev,
              onNext: onServerNext,
            }}
          />
        </>
      )}

      {selectedId && (
        <CallDetailModal
          callId={selectedId}
          onClose={() => setSelectedId(null)}
          onToggle={onToggle}
          onPark={onPark}
          busyIds={busyIds}
        />
      )}
    </div>
  );
}

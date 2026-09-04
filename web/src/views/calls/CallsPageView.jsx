import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { t } from "../../theme.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { DownloadButton } from "../../components/DownloadButton.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import {
  fetchAllCallsPages,
  fetchCallCallers,
  fetchDrivePollSettings,
  patchDrivePollSettings,
  postDrivePoll,
} from "../../lib/api.js";
import { withCallMetadata, filterCallsByMeta } from "../../lib/callMetadata.js";
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

function filtersActive(filters) {
  return Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      (filters.callers?.length ?? 0) > 0 ||
      filters.importantOnly ||
      filters.withTodosOnly ||
      (filters.entryTypes?.length ?? 0) > 0
  );
}

/**
 * Calls dashboard — fills the viewport (no page scroll). Table body scrolls.
 * Call detail opens in a modal so grid state is preserved on close.
 *
 * The full call list is loaded once (and refreshed after a Drive sync or
 * "Get latest"); every filter toggle then applies instantly in memory via
 * filterCallsByMeta rather than round-tripping to the server. Pagination
 * still exists — it's the grid's own client-side pager over the filtered
 * set — it just isn't the reason a filter click has to wait on the network.
 */
export function CallsPageView({ onBack, onToggle, onPark, busyIds, onCallsChanged }) {
  const [allRows, setAllRows] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [callerOptions, setCallerOptions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadGen = useRef(0);
  const hasLoadedOnce = useRef(false);

  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollMeta, setPollMeta] = useState({ lastAt: null, lastResult: null });
  const [pollProgress, setPollProgress] = useState(null);
  const [pollBusy, setPollBusy] = useState(false);
  const [pollStatus, setPollStatus] = useState("");

  const loadAll = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoadError("");
    if (hasLoadedOnce.current) setRefreshing(true);
    try {
      const items = await fetchAllCallsPages({ include_low_signal: true });
      if (gen !== loadGen.current) return;
      setAllRows(items.map(withCallMetadata));
      hasLoadedOnce.current = true;
    } catch (err) {
      if (gen !== loadGen.current) return;
      setAllRows([]);
      setLoadError(err.message || "Failed to load calls");
      hasLoadedOnce.current = true;
    } finally {
      if (gen === loadGen.current) setRefreshing(false);
    }
  }, []);

  const rows = useMemo(() => (allRows ? filterCallsByMeta(allRows, filters) : null), [allRows, filters]);
  const total = rows?.length ?? 0;

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
    loadAll();
  }, [loadAll]);

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
      loadAll();
      if (typeof onCallsChanged === "function") onCallsChanged();
    }
    prevPollStatus.current = status;
  }, [pollProgress?.status, loadAll, onCallsChanged]);

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
      await loadAll();
      if (typeof onCallsChanged === "function") await onCallsChanged();
    } catch (err) {
      setPollStatus(`Get latest failed: ${err.message}`);
    } finally {
      setPollBusy(false);
    }
  };

  const initialLoading = rows === null;
  const noCallsAtAll = !initialLoading && (allRows?.length ?? 0) === 0 && !filtersActive(filters) && !refreshing;

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
            <DownloadButton calls={rows ?? []} label="filtered">
              Download
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

      {initialLoading ? (
        <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Loading calls…</p>
      ) : noCallsAtAll ? (
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
            {refreshing ? (
              <span style={{ fontSize: 13, fontWeight: 500, color: t.edge2, marginLeft: 10 }}>Updating…</span>
            ) : null}
          </h2>
          <CallsGrid rows={rows ?? []} selectedId={selectedId} onSelect={setSelectedId} dimmed={refreshing} />
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

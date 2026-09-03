import { useState, useMemo, useEffect, useCallback } from "react";
import { t } from "../../theme.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { DownloadButton } from "../../components/DownloadButton.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import {
  fetchCallsForDashboard,
  fetchDrivePollSettings,
  patchDrivePollSettings,
  postDrivePoll,
} from "../../lib/api.js";
import { withCallMetadata, uniqueCallers, filterCallsByMeta } from "../../lib/callMetadata.js";
import { CallsFilterBar } from "./CallsFilterBar.jsx";
import { CallsGrid } from "./CallsGrid.jsx";
import { CallDetailModal } from "./CallDetailModal.jsx";

const EMPTY_FILTERS = {
  dateFrom: "",
  dateTo: "",
  callers: [],
  importantOnly: false,
  withTodosOnly: false,
  entryTypes: [],
};

/**
 * Calls dashboard — fills the viewport (no page scroll). Table body scrolls.
 * Call detail opens in a modal so grid state is preserved on close.
 */
export function CallsPageView({ onBack, onToggle, onPark, busyIds, onCallsChanged }) {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);

  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollMeta, setPollMeta] = useState({ lastAt: null, lastResult: null });
  const [pollBusy, setPollBusy] = useState(false);
  const [pollStatus, setPollStatus] = useState("");

  const loadRows = useCallback(async () => {
    setLoadError("");
    const data = await fetchCallsForDashboard();
    const decorated = (Array.isArray(data) ? data : []).map(withCallMetadata);
    decorated.sort((a, b) => {
      const ad = a.meta.callDateIso || "";
      const bd = b.meta.callDateIso || "";
      return bd.localeCompare(ad);
    });
    setRows(decorated);
    return decorated;
  }, []);

  /* Entering from a scrolled home page left the window at the bottom; lock
     to the top so Back / title are visible and the table owns scrolling. */
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    if (rows == null) return;
    window.scrollTo(0, 0);
  }, [rows]);

  /* Mobile-only scroll lock. The desktop Calls page already fills 100vh
     via the shell; pinning body { position:fixed } there collapses the
     height chain and squeezes the grid. */
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
      /* Finger down at top, or finger up at bottom → would chain to the page. */
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
      /* Chrome Android: fixed body is more reliable than overflow:hidden alone
         at stopping document scroll / pull-to-refresh after nested overscroll. */
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
    let cancelled = false;
    loadRows().catch((err) => {
      if (!cancelled) {
        setRows([]);
        setLoadError(err.message || "Failed to load calls");
      }
    });
    fetchDrivePollSettings()
      .then((s) => {
        if (cancelled) return;
        setPollEnabled(Boolean(s.enabled));
        setPollMeta({ lastAt: s.lastAt ?? null, lastResult: s.lastResult ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loadRows]);

  const callerOptions = useMemo(() => uniqueCallers(rows ?? []), [rows]);
  const filtered = useMemo(
    () => (rows ? filterCallsByMeta(rows, filters) : []),
    [rows, filters]
  );

  const onTogglePolling = async () => {
    const next = !pollEnabled;
    setPollBusy(true);
    setPollStatus("");
    try {
      const s = await patchDrivePollSettings(next);
      setPollEnabled(Boolean(s.enabled));
      setPollMeta({ lastAt: s.lastAt ?? null, lastResult: s.lastResult ?? null });
      setPollStatus(next ? "Permanent polling on — every 5 minutes." : "Permanent polling off.");
    } catch (err) {
      setPollStatus(`Could not update polling: ${err.message}`);
    } finally {
      setPollBusy(false);
    }
  };

  const onGetLatest = async () => {
    setPollBusy(true);
    setPollStatus("Fetching latest calls from Drive…");
    try {
      const result = await postDrivePoll();
      const n = result.ingested?.length ?? 0;
      setPollMeta({
        lastAt: new Date().toISOString(),
        lastResult: `ingested ${n}; scanned ${result.scanned ?? 0}; skipped ${result.skippedExisting ?? 0}`,
      });
      setPollStatus(
        n === 0
          ? "No new calls to import."
          : `Imported ${n} call${n === 1 ? "" : "s"} — transcription started.`
      );
      await loadRows();
      if (typeof onCallsChanged === "function") await onCallsChanged();
    } catch (err) {
      setPollStatus(`Get latest failed: ${err.message}`);
    } finally {
      setPollBusy(false);
    }
  };

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
          {rows && rows.length > 0 && (
            <DownloadButton calls={filtered} label="filtered">
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
          {(pollStatus || pollMeta.lastResult) && (
            <span style={{ fontSize: 12, color: t.edge2, flex: "1 1 160px" }}>
              {pollStatus || pollMeta.lastResult}
            </span>
          )}
        </div>
      </Card>

      {loadError && (
        <p style={{ fontSize: 14, color: t.signal, margin: 0, flexShrink: 0 }}>{loadError}</p>
      )}

      {rows === null ? (
        <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Loading calls…</p>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div style={{ flexShrink: 0, position: "sticky", top: 0, zIndex: 1, background: t.pane }}>
            <CallsFilterBar
              filters={filters}
              callerOptions={callerOptions}
              onChange={setFilters}
              resultCount={filtered.length}
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
          <CallsGrid rows={filtered} selectedId={selectedId} onSelect={setSelectedId} />
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

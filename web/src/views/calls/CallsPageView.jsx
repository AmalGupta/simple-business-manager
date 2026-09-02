import { useState, useMemo, useEffect } from "react";
import { t } from "../../theme.js";
import { TILE_ROW_STYLE, TILE_NUMBER_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { DownloadButton } from "../../components/DownloadButton.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { CallCard } from "../../components/CallCard.jsx";
import {
  fetchDrivePollSettings,
  patchDrivePollSettings,
  postDrivePoll,
} from "../../lib/api.js";

/* Calls Transcripts page — everything that used to sit directly on the
   admin home feed, relocated behind the "Calls logged" tile. Adds the two
   summary tiles (Important/Regular — see CallTypeBadge above for the same
   split) and per-card badges; todo toggling, park, and download are
   unchanged from the old home feed. */
export function CallsPageView({ calls, onBack, onOpen, onToggle, onPark, busyIds, onCallsChanged }) {
  const [filter, setFilter] = useState(null); // null = all, "important", "regular"
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollMeta, setPollMeta] = useState({ lastAt: null, lastResult: null });
  const [pollBusy, setPollBusy] = useState(false);
  const [pollStatus, setPollStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchDrivePollSettings()
      .then((s) => {
        if (cancelled) return;
        setPollEnabled(Boolean(s.enabled));
        setPollMeta({ lastAt: s.lastAt ?? null, lastResult: s.lastResult ?? null });
      })
      .catch(() => {
        /* settings endpoint may 401 briefly during login race — ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const importantCalls = useMemo(() => calls.filter((c) => c.call_type !== "low_signal"), [calls]);
  const regularCalls = useMemo(() => calls.filter((c) => c.call_type === "low_signal"), [calls]);
  const shown = filter === "important" ? importantCalls : filter === "regular" ? regularCalls : calls;
  /* Drive-ingested calls show by caller name; list is newest call-time first. */
  const ordered = useMemo(
    () =>
      [...shown].sort((a, b) => {
        const ad = new Date(a.recording_date || a.recorded_at).getTime();
        const bd = new Date(b.recording_date || b.recorded_at).getTime();
        return bd - ad;
      }),
    [shown]
  );

  const toggle = (key) => setFilter((current) => (current === key ? null : key));

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
      if (typeof onCallsChanged === "function") await onCallsChanged();
    } catch (err) {
      setPollStatus(`Get latest failed: ${err.message}`);
    } finally {
      setPollBusy(false);
    }
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>Calls</h1>

      <Card style={{ marginBottom: "1.25rem", padding: "14px 16px" }}>
        <TileLabel>Drive sync</TileLabel>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <button
            type="button"
            onClick={onGetLatest}
            disabled={pollBusy}
            style={{
              fontFamily: t.body,
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: t.accent,
              border: "none",
              borderRadius: t.radiusButton,
              padding: "10px 14px",
              minHeight: 44,
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
              fontSize: 14,
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
              style={{ width: 18, height: 18, accentColor: "var(--color-accent)" }}
            />
            Permanent call polling
          </label>
        </div>
        {(pollStatus || pollMeta.lastResult) && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: t.edge2, lineHeight: 1.45 }}>
            {pollStatus || pollMeta.lastResult}
            {pollMeta.lastAt ? ` · last run ${new Date(pollMeta.lastAt).toLocaleString()}` : ""}
          </p>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
        <button onClick={() => toggle("important")} style={{ all: "unset", cursor: "pointer", display: "block" }}>
          <Card style={{ borderColor: filter === "important" ? t.accent : t.frost }}>
            <TileLabel>Important calls</TileLabel>
            <div style={{ ...TILE_ROW_STYLE, borderTop: "none", padding: "6px 0 0" }}>
              <span style={TILE_NUMBER_STYLE}>{importantCalls.length}</span>
            </div>
          </Card>
        </button>
        <button onClick={() => toggle("regular")} style={{ all: "unset", cursor: "pointer", display: "block" }}>
          <Card style={{ borderColor: filter === "regular" ? t.accent : t.frost }}>
            <TileLabel>Regular calls</TileLabel>
            <div style={{ ...TILE_ROW_STYLE, borderTop: "none", padding: "6px 0 0" }}>
              <span style={TILE_NUMBER_STYLE}>{regularCalls.length}</span>
            </div>
          </Card>
        </button>
      </div>

      {calls.length === 0 ? (
        <EmptyState />
      ) : ordered.length === 0 ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>No {filter} calls.</p>
      ) : (
        <>
          {ordered.map((call, i) => (
            <CallCard
              key={call.id}
              index={i}
              call={call}
              showTypeBadge
              onOpen={onOpen}
              onToggle={onToggle}
              onPark={onPark}
              busyIds={busyIds}
            />
          ))}
          <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
            <DownloadButton calls={ordered} label={filter ?? "all"}>
              Download {filter ?? "everything"}
            </DownloadButton>
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { fetchSiteCalls } from "../../lib/api.js";
import { Modal } from "../../components/Modal.jsx";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";

/* The calls a site name was heard in, so the reviewer can listen before
   marking an unconfirmed site valid or not. The discovering call is
   first and tagged; later mentions follow, newest first. */
export function SiteCallsModal({ site, onClose }) {
  const [calls, setCalls] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchSiteCalls(site.id)
      .then((rows) => !cancelled && setCalls(rows))
      .catch((err) => {
        console.error("[sbm] failed to load site calls", err);
        if (!cancelled) setError("Couldn't load calls — try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [site.id]);

  return (
    <Modal title={`Calls for ${site.name}`} onClose={onClose} width={480} scroll>
      {error && <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>{error}</p>}
      {!error && calls === null && <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>Loading…</p>}
      {calls?.length === 0 && (
        <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>No calls are linked to this site.</p>
      )}
      {calls?.map((call) => (
        <div
          key={call.id}
          style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 12, borderBottom: `1px solid ${t.frost}` }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: t.edge }}>{call.caller_name || "Unknown caller"}</span>
            {call.call_date && <span style={{ fontSize: 12, color: t.edge2 }}>{fmtShort(call.call_date)}</span>}
            {call.is_discovering && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: t.accent,
                  border: `1px solid ${t.accent}`,
                  borderRadius: 999,
                  padding: "1px 6px",
                }}
              >
                Discovered here
              </span>
            )}
          </div>
          {call.summary && <p style={{ fontSize: 13, color: t.edge2, margin: 0, lineHeight: 1.4 }}>{call.summary}</p>}
          {call.has_recording ? (
            <AudioPlayer src={`/api/calls/${call.id}/recording`} />
          ) : (
            <span style={{ fontSize: 12, color: t.edge2 }}>No recording available.</span>
          )}
        </div>
      ))}
    </Modal>
  );
}

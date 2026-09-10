import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { t } from "../../theme.js";
import { PRIMARY_BUTTON_STYLE } from "../../styles.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { fetchAppRequests, postAppRequestVoiceNote } from "../../lib/api.js";
import { VoiceNoteModal } from "../sites/VoiceNoteModal.jsx";

const STATUS_META = {
  submitted: { bg: t.frostSoft, fg: t.accent, label: "Filed" },
  pending: { bg: t.frost, fg: t.edge2, label: "Uploading…" },
  transcribing: { bg: t.frost, fg: t.edge2, label: "Processing…" },
  failed: { bg: t.signalBg, fg: t.signal, label: "Failed" },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      style={{
        flexShrink: 0,
        padding: "2px 8px",
        borderRadius: 999,
        background: meta.bg,
        color: meta.fg,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {meta.label}
    </span>
  );
}

/* "Request or report an issue" — voice only. Any logged-in session (staff or
   admin) records a spoken request; it's transcribed via the same Sarvam
   pipeline as a site voice note and then formatted + filed into Jira by the
   webhook once the transcript lands (migration 0033/0034,
   src/handlers/stt-webhook.ts). The list below polls while anything is
   still in flight, so a filed issue isn't a black hole once it's sent. */
export function RequestForm({ onBack }) {
  const [requests, setRequests] = useState(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [error, setError] = useState("");

  const refresh = () => {
    fetchAppRequests()
      .then(setRequests)
      .catch((err) => console.error("[sbm] failed to load requests", err));
  };

  useEffect(refresh, []);

  useEffect(() => {
    const inFlight = requests?.some((r) => r.status === "pending" || r.status === "transcribing");
    if (!inFlight) return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [requests]);

  const handleSave = async (blob, fileName) => {
    setError("");
    await postAppRequestVoiceNote(blob, fileName);
    refresh();
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        Request or report an issue
      </h1>

      <Card>
        <p style={{ fontSize: 14, color: t.edge2, margin: "0 0 12px", lineHeight: 1.5 }}>
          Record a voice note describing a bug, a missing feature, or anything you want changed. It's transcribed and
          filed straight into Jira.
        </p>
        <button
          onClick={() => setShowRecorder(true)}
          style={{
            ...PRIMARY_BUTTON_STYLE,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Mic size={16} /> Record request
        </button>
        {error && <p style={{ fontSize: 12, color: t.signal, margin: "10px 0 0" }}>{error}</p>}
      </Card>

      <h2 style={{ fontFamily: t.display, fontSize: 16, fontWeight: 600, color: t.edge, margin: "1.5rem 0 0.75rem" }}>
        Your requests
      </h2>
      {requests === null && <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>}
      {requests?.length === 0 && <p style={{ fontSize: 14, color: t.edge2 }}>Nothing submitted yet.</p>}
      {requests?.map((r) => (
        <Card key={r.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <p style={{ fontSize: 14, color: t.edge, margin: 0, flex: 1, whiteSpace: "pre-wrap" }}>
              {r.text || "Transcribing…"}
            </p>
            <StatusBadge status={r.status} />
          </div>
          {r.jira_issue_url && (
            <a
              href={r.jira_issue_url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, fontWeight: 600, color: t.accent, marginTop: 8, display: "inline-block" }}
            >
              {r.jira_issue_key} →
            </a>
          )}
          {r.status === "failed" && (
            <p style={{ fontSize: 12, color: t.signal, margin: "8px 0 0" }}>
              Couldn't file to Jira{r.error ? `: ${r.error}` : "."}
            </p>
          )}
        </Card>
      ))}

      {showRecorder && <VoiceNoteModal onClose={() => setShowRecorder(false)} onSave={handleSave} />}
    </div>
  );
}

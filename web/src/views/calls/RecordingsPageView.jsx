import { useMemo } from "react";
import { FileText } from "lucide-react";
import { t } from "../../theme.js";
import { fmtDate } from "../../lib/dates.js";
import { sortCalls } from "../../lib/constants.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { formatTodoSentence } from "../../components/TodoRow.jsx";

/* Recordings — admin/superadmin-only control, separate from the Calls page
   above. Where Calls is day-to-day todo triage (checklist rows, park/close),
   this is a review surface over the raw recordings themselves: play the
   audio back, see each extracted todo phrased as a plain sentence
   (formatTodoSentence) rather than a checkbox. Reuses the same `calls` list
   already loaded for an admin session — no separate fetch. Recording
   playback itself is scoped server-side (GET /api/calls/:id/recording,
   src/handlers/site-media.ts); this view is only ever reachable by
   admin/superadmin in the first place, same as CallsPageView. */
export function RecordingsPageView({ calls, onBack, onOpen }) {
  const ordered = useMemo(() => sortCalls(calls), [calls]);

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        Recordings
      </h1>

      {ordered.length === 0 ? (
        <EmptyState />
      ) : (
        ordered.map((call) => (
          <Card key={call.id} style={{ marginBottom: 12 }}>
            <button
              onClick={() => onOpen(call.id)}
              style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 500, color: t.edge }}>
                  {call.client_name}
                </span>
                <span style={{ fontSize: 12, color: t.edge2, whiteSpace: "nowrap" }}>
                  {fmtDate(call.recorded_at)}
                  {call.duration_s ? ` · ${Math.round(call.duration_s / 60)} min` : ""}
                </span>
              </div>
            </button>

            {!call.has_transcript ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, color: t.edge2, fontSize: 13, marginTop: 8 }}>
                <FileText size={16} />
                Transcription in progress
              </span>
            ) : (
              <AudioPlayer src={`/api/calls/${call.id}/recording`} />
            )}

            {call.todos.length > 0 && (
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: t.edge2 }}>
                {call.todos.map((td) => (
                  <li key={td.id}>{formatTodoSentence(td)}</li>
                ))}
              </ul>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

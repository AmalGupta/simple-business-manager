import { useState } from "react";
import { FileText } from "lucide-react";
import { t } from "../../theme.js";
import { fmtDate, dayKey, daysUntil } from "../../lib/dates.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { PhoneLink } from "../../components/PhoneLink.jsx";
import { WaitingTag } from "../../components/WaitingTag.jsx";
import { DownloadButton } from "../../components/DownloadButton.jsx";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { TodoRow } from "../../components/TodoRow.jsx";
import { CallHeading } from "../../components/CallHeading.jsx";
import { CommitmentsList } from "../../components/CommitmentsList.jsx";
import { TodoAssignControl } from "./TodoAssignControl.jsx";

/* 2-column layout: transcript/summary/details on the left, todos (with
   assignment) on the right — the left column is everything a call used to
   render top to bottom before this pass, unchanged in order or content;
   only the todos card moved out into its own column, and now stays fully
   expanded there instead of behind a "Show todos" toggle, since it no
   longer competes with the rest of the call for vertical space. Mobile
   stays single-column stacked (left column content, then todos) via
   .sbm-call-grid in Dashboard.jsx's shell() — side-by-side only from
   768px up. */
export function CallDetail({ call, onBack, onToggle, onPark, busyIds, canManage = true, staffRoster = [], onAssign }) {
  const openTodos = call.todos.filter((td) => td.status !== "done");
  const doneTodos = call.todos.filter((td) => td.status === "done");
  const [openTranscript, setOpenTranscript] = useState(false);

  const Section = ({ label, children }) => (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ fontSize: 12, color: t.edge2, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <div className="sbm-call-grid">
        <div>
          <div style={{ paddingBottom: "1rem", borderBottom: `1px solid ${t.frost}`, marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              {call.call_type === "internal" && call.sites?.length > 0 ? (
                <CallHeading call={call} />
              ) : (
                <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: 0 }}>
                  {call.client_name}
                </h1>
              )}
              {call.customer_waiting ? <WaitingTag /> : null}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
                marginTop: 6,
                fontSize: 13,
                color: t.edge2,
              }}
            >
              <span>
                {fmtDate(call.recorded_at)} · {Math.round(call.duration_s / 60)} min · {call.source}
              </span>
              <PhoneLink phone={call.client_phone} />
            </div>
            {call.has_transcript && <AudioPlayer src={`/api/calls/${call.id}/recording`} />}
          </div>

          <Section label="Summary">
            <p style={{ fontSize: 14, lineHeight: 1.7, color: t.edge, margin: 0 }}>{call.summary}</p>
          </Section>

          <Section label="Key takeaways">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.9, color: t.edge }}>
              {call.key_takeaways.map((k, i) => (
                <li key={i}>{k}</li>
              ))}
            </ul>
          </Section>

          {call.commitments?.length > 0 && (
            <Section label="Commitments">
              <CommitmentsList commitments={call.commitments} />
            </Section>
          )}

          {/* Unresolved is LLM output, never actionable — deliberately not checkboxes */}
          {call.unresolved.length > 0 && (
            <div style={{ borderLeft: `2px solid ${t.frost}`, paddingLeft: 14, marginBottom: "1.5rem" }}>
              <div style={{ fontSize: 12, color: t.edge2, marginBottom: 6 }}>Left unresolved on the call</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: t.edge2, display: "flex", flexDirection: "column", gap: 6 }}>
                {call.unresolved.map((u, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span>{u.item}</span>
                    {u.blocked_on && (
                      <span style={{ fontSize: 11, color: t.putty, whiteSpace: "nowrap" }}>blocked on {u.blocked_on}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {call.material_needs?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "1.5rem" }}>
              {call.material_needs.map((m, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    border: `1px solid ${t.frost}`,
                    borderRadius: t.radius,
                    color: t.edge2,
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          )}

          {call.deadline && (
            <Card
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.25rem",
              }}
            >
              <span style={{ fontSize: 13, color: t.edge2 }}>Deadline</span>
              <span
                style={{
                  fontSize: 13,
                  padding: "3px 10px",
                  borderRadius: t.radius,
                  color: daysUntil(call.deadline) <= 1 ? t.white : t.edge2,
                  background: daysUntil(call.deadline) <= 1 ? t.signal : t.frost,
                }}
              >
                {fmtDate(call.deadline)}
              </span>
            </Card>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              borderTop: `1px solid ${t.frost}`,
              paddingTop: "1rem",
            }}
          >
            {!call.has_transcript ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, color: t.edge2, fontSize: 13 }}>
                <FileText size={16} />
                Transcription in progress
              </span>
            ) : (
              <button
                onClick={() => setOpenTranscript((v) => !v)}
                aria-expanded={openTranscript}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 0,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: t.edge2,
                  fontSize: 13,
                }}
              >
                <FileText size={16} />
                {openTranscript ? "Hide transcript" : "Read full transcript"}
              </button>
            )}
            <DownloadButton calls={[call]} label={`${call.client_name.toLowerCase().replace(/\s+/g, "-")}-${dayKey(call.recorded_at)}`}>
              Call report
            </DownloadButton>
          </div>

          {call.transcript != null && openTranscript && (
            <p style={{ fontSize: 13, lineHeight: 1.8, color: t.edge2, marginTop: 12, whiteSpace: "pre-wrap" }}>
              {call.transcript}
            </p>
          )}
        </div>

        <div>
          {call.todos.length === 0 ? (
            <Card>
              <p style={{ fontSize: 13, color: t.edge2, margin: 0 }}>No todos extracted from this call.</p>
            </Card>
          ) : (
            <Card>
              <div style={{ fontSize: 12, color: t.edge2, marginBottom: 8, fontWeight: 600 }}>
                Todos ({call.todos.length})
              </div>
              {[...openTodos, ...doneTodos].map((td) => (
                <div key={td.id}>
                  <TodoRow
                    todo={td}
                    onToggle={onToggle}
                    onPark={canManage ? onPark : undefined}
                    busy={busyIds.has(td.id)}
                    readOnly={!canManage}
                  />
                  {canManage && <TodoAssignControl todo={td} staffRoster={staffRoster} onAssign={onAssign} />}
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { FileText } from "lucide-react";
import { t } from "../theme.js";
import { fmtDate } from "../lib/dates.js";
import { Card } from "./Card.jsx";
import { WaitingTag } from "./WaitingTag.jsx";
import { TodoRow } from "./TodoRow.jsx";
import { CallHeading } from "./CallHeading.jsx";
import { CallTypeBadge } from "./CallTypeBadge.jsx";
import { CommitmentsList } from "./CommitmentsList.jsx";

export function CallCard({ call, onOpen, onToggle, onPark, busyIds, index = 0, showTypeBadge = false }) {
  const visible = call.todos.filter((td) => td.status !== "done");
  const done = call.todos.filter((td) => td.status === "done");
  const [openTranscript, setOpenTranscript] = useState(false);

  return (
    <Card
      className="sbm-rise"
      style={{ marginBottom: 12, animationDelay: `${index * 40}ms` }}
    >
      <button
        onClick={() => onOpen(call.id)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <CallHeading call={call} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {showTypeBadge && <CallTypeBadge callType={call.call_type} />}
            {call.customer_waiting ? <WaitingTag /> : null}
          </div>
        </div>
        <div style={{ fontSize: 13, color: t.edge2, marginTop: 2 }}>
          {fmtDate(call.recorded_at)} · {Math.round(call.duration_s / 60)} min
        </div>
      </button>

      {call.summary && <p style={{ fontSize: 13, lineHeight: 1.6, color: t.edge2, margin: "0 0 10px" }}>{call.summary}</p>}

      {[...visible, ...done].map((todo) => (
        <TodoRow key={todo.id} todo={todo} onToggle={onToggle} onPark={onPark} busy={busyIds.has(todo.id)} />
      ))}

      {call.commitments?.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.frost}` }}>
          <CommitmentsList commitments={call.commitments} />
        </div>
      )}

      {call.has_transcript && call.transcript != null && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.frost}` }}>
          <button
            onClick={() => setOpenTranscript((v) => !v)}
            aria-expanded={openTranscript}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: t.edge2,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <FileText size={14} />
            {openTranscript ? "Hide transcript" : "Show transcript"}
          </button>
          {openTranscript && (
            <p style={{ fontSize: 13, lineHeight: 1.8, color: t.edge2, marginTop: 8, whiteSpace: "pre-wrap" }}>
              {call.transcript}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

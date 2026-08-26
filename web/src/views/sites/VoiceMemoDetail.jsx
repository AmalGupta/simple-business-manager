import { t } from "../../theme.js";
import { TodoRow } from "../../components/TodoRow.jsx";

export function VoiceMemoDetail({ entryRef }) {
  if (entryRef.transcript === undefined) return null; // not sent to this session (staff) — nothing to show
  if (entryRef.transcript === null) return null; // still transcribing
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.edge2, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Transcript
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: t.edge2,
          background: t.frostSoft,
          border: `1px solid ${t.frost}`,
          borderRadius: t.radiusButton,
          padding: "10px 12px",
          maxHeight: 220,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {entryRef.transcript}
      </div>
      {entryRef.todos?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.edge2, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Todos
          </div>
          {entryRef.todos.map((td) => (
            <TodoRow key={td.id} todo={td} readOnly />
          ))}
        </div>
      )}
    </div>
  );
}

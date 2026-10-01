import { t } from "../../theme.js";
import { AudioPlayer } from "../AudioPlayer.jsx";
import { useT } from "../../lib/i18n.jsx";

const SECTION_COLOR = { completed: "var(--color-unread)", pending: "var(--color-warn)", update: "var(--color-accent)" };
const SECTION_KEY = { completed: "sectionCompleted", pending: "sectionPending", update: "sectionUpdate" };

const mediaStyle = { display: "block", marginTop: 6, maxWidth: "100%", maxHeight: 240, borderRadius: t.radiusButton };

/* SBM-103 — one post's content: what kind of post it is (update /
   completed / pending), the note, and its voice notes (with transcript),
   photos and videos. Shared by the task updates popup and the site timeline. */
export function TaskUpdateContent({ section = "update", body, media = [], taskTitle = null }) {
  const tr = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: t.label,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: t.white,
            background: SECTION_COLOR[section] ?? SECTION_COLOR.update,
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          {tr(SECTION_KEY[section] ?? "sectionUpdate")}
        </span>
        {taskTitle && <span style={{ fontSize: 12, color: t.edge2 }}>{taskTitle}</span>}
      </div>
      {body && <p style={{ margin: 0, fontSize: 14, color: t.edge, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{body}</p>}
      {media.map((m) => {
        const src = `/api/task-update-media/${m.id}`;
        if (m.media_type === "photo") return <img key={m.id} src={src} alt="" style={{ ...mediaStyle, border: `1px solid ${t.frost}` }} />;
        if (m.media_type === "video") return <video key={m.id} src={src} controls style={mediaStyle} />;
        return (
          <div key={m.id}>
            <AudioPlayer src={src} preload="none" />
            {m.transcript ? (
              <p style={{ margin: "4px 0 0", fontSize: 13, color: t.edge2, fontStyle: "italic", lineHeight: 1.5 }}>“{m.transcript}”</p>
            ) : m.stt_status === "pending" ? (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: t.edge2 }}>{tr("transcribing")}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

import { Mic, FileText, Video, Image, Users } from "lucide-react";
import { t } from "../../theme.js";
import { fmtDate } from "../../lib/dates.js";
import { AudioPlayer } from "../../components/AudioPlayer.jsx";
import { VoiceMemoDetail } from "./VoiceMemoDetail.jsx";

/* ------------------------------------------------------------------
   Site timeline — unified activity feed (calls incl. voice notes, media
   uploads, team changes, site-detail edits), newest first. Extends the
   borderLeft rail idiom already used for CallDetail's unresolved-items
   block, with a dot marker per entry.
   ------------------------------------------------------------------ */
function timelineEntryIcon(entry) {
  if (entry.type === "call") return entry.ref?.is_voice_memo ? <Mic size={13} /> : <FileText size={13} />;
  if (entry.type === "media") return entry.ref?.media_type === "video" ? <Video size={13} /> : <Image size={13} />;
  if (entry.type === "team_added") return <Users size={13} />;
  return <FileText size={13} />;
}

export function SiteTimelineEntry({ entry, onOpenCall, canManage }) {
  const content = () => {
    if (entry.type === "call") {
      // A site voice memo's transcript/todos are admin-only (see
      // isCallAccessibleToUser) — staff get the plain summary line, not a
      // link into a call detail the API would 403 on anyway.
      if (entry.ref?.is_voice_memo && !canManage) {
        return <span style={{ fontSize: 14, color: t.edge, lineHeight: 1.6 }}>{entry.summary}</span>;
      }
      return (
        <button
          onClick={() => onOpenCall(entry.ref.call_id)}
          style={{ display: "block", textAlign: "left", padding: 0, border: "none", background: "none", cursor: "pointer", color: t.edge, fontSize: 14, lineHeight: 1.6 }}
        >
          {entry.summary}
        </button>
      );
    }
    if (entry.type === "media") {
      return (
        <>
          <span style={{ fontSize: 14, color: t.edge }}>{entry.summary}</span>
          {entry.ref?.media_type === "photo" ? (
            <img
              src={`/api/media/${entry.ref.media_id}`}
              alt=""
              style={{ display: "block", marginTop: 6, maxWidth: "100%", maxHeight: 220, borderRadius: t.radiusButton, border: `1px solid ${t.frost}` }}
            />
          ) : (
            <video
              src={`/api/media/${entry.ref.media_id}`}
              controls
              style={{ display: "block", marginTop: 6, maxWidth: "100%", maxHeight: 220, borderRadius: t.radiusButton }}
            />
          )}
        </>
      );
    }
    return <span style={{ fontSize: 14, color: t.edge }}>{entry.summary}</span>;
  };

  return (
    <div style={{ position: "relative", paddingLeft: 20, paddingBottom: 18 }}>
      <span
        style={{
          position: "absolute",
          left: -4.5,
          top: 4,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: t.accent,
          border: `2px solid ${t.white}`,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: t.edge2, marginBottom: 3 }}>
        {timelineEntryIcon(entry)}
        <span>{fmtDate(entry.created_at)}</span>
        {entry.actor_name && <span>· {entry.actor_name}</span>}
      </div>
      {content()}
      {entry.type === "call" && entry.ref?.is_voice_memo && <AudioPlayer src={`/api/calls/${entry.ref.call_id}/recording`} />}
      {entry.type === "call" && entry.ref?.is_voice_memo && canManage && <VoiceMemoDetail entryRef={entry.ref} />}
    </div>
  );
}

import { t } from "../../theme.js";

/* SBM-103 — the green "has updates" pill, same look as the Sites unread
   badge (sbm-unread-glow pulse is defined in Dashboard's global styles).
   Never decorative: it means the other side posted since you last opened. */
export function UpdatesBubble({ count, label, style }) {
  if (!count) return null;
  return (
    <span
      className="sbm-unread-glow"
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 20,
        height: 20,
        padding: "0 6px",
        borderRadius: 999,
        background: t.unread,
        color: t.white,
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
        ...style,
      }}
    >
      {count}
    </span>
  );
}

import { t } from "../theme.js";

/* "Important" = call_type client/internal (already got a card on the old
   home feed); "Regular" = low_signal (never surfaced anywhere before the
   Calls Transcripts page existed). Neutral colours, not urgency-red — this
   is a classification, not a warning. */
export function CallTypeBadge({ callType }) {
  const isImportant = callType !== "low_signal";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: t.radius,
        color: isImportant ? t.accent : t.edge2,
        background: isImportant ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : t.frostSoft,
        whiteSpace: "nowrap",
      }}
    >
      {isImportant ? "Important" : "Regular"}
    </span>
  );
}

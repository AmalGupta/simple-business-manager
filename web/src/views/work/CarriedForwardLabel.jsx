import { t } from "../../theme.js";
import { fmtShort } from "../../lib/dates.js";
import { carriedForwardDays } from "./workDates.js";

/* Planned later than the task's own due date — "c/f by n days", with the
   original due date. Warn colour, not danger: it's slipped, not necessarily urgent. */
export function CarriedForwardLabel({ item, style }) {
  const n = carriedForwardDays(item);
  if (!n) return null;
  return (
    <div style={{ color: t.putty, fontSize: 11, fontWeight: 700, ...style }}>
      c/f by {n} {n === 1 ? "day" : "days"} · due {fmtShort(item.due_date)}
    </div>
  );
}

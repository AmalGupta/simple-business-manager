import { t } from "../../theme.js";
import { carriedForwardDays } from "./workDates.js";
import { fmtShortLang, useLang, useT } from "../../lib/i18n.jsx";

/* Planned later than the task's own due date — "c/f by n days", with the
   original due date. Warn colour, not danger: it's slipped, not necessarily urgent. */
export function CarriedForwardLabel({ item, style }) {
  const tr = useT();
  const lang = useLang();
  const n = carriedForwardDays(item);
  if (!n) return null;
  return (
    <div style={{ color: t.putty, fontSize: 11, fontWeight: 700, ...style }}>
      {tr("carriedForward", { n, date: fmtShortLang(lang, item.due_date) })}
    </div>
  );
}

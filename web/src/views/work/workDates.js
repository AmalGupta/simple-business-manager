/* Staff roster date helpers (migration 0044). Server timestamps come from
   SQLite datetime('now') — "yyyy-mm-dd hh:mm:ss" in UTC with no zone
   marker — so they must be parsed as UTC explicitly, or the browser reads
   them as local time and every urgent deadline shifts by 5h30 in IST. */
export function parseSqliteUtc(ts) {
  if (!ts) return null;
  const s = String(ts);
  const iso = s.includes("T") ? s : `${s.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Urgent work is due 24h after an admin flagged it. */
export function urgentDeadline(urgentAt) {
  const d = parseSqliteUtc(urgentAt);
  return d ? new Date(d.getTime() + 24 * 60 * 60 * 1000) : null;
}

export function fmtTimeLeft(deadline, now = Date.now()) {
  if (!deadline) return "";
  const ms = deadline.getTime() - now;
  if (ms <= 0) return "overdue";
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(ms / 60000))}m left`;
}

export function fmtDateTime(ts) {
  const d = parseSqliteUtc(ts);
  if (!d) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/* Whole days between two yyyy-mm-dd dates (b − a), via UTC midnight so a
   DST boundary can't make it off by one. */
function daysBetweenIso(a, b) {
  const toUtc = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/**
 * "Carried forward" — the planned day sits after the task's own due date.
 * Returns the day count, or 0 when on time / no due date / not planned.
 */
export function carriedForwardDays(item) {
  if (!item.due_date || !item.scheduled_for) return 0;
  const n = daysBetweenIso(item.due_date, item.scheduled_for);
  return n > 0 ? n : 0;
}
